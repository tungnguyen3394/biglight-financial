/* ============================================================================
   API v1 — 連携（Integration）と APIキー           公式 §17.1
   ----------------------------------------------------------------------------
   ・鍵は bl_live_ + 40文字。データベースには SHA-256 だけを置く（平文は作った瞬間に
     1回返すきり。二度と出せない）。画面には bl_live_xxxx••••••••93Ks だけ出す。
   ・1連携 = 1鍵 = 独自のスコープ。全部に効く親鍵は作らない。
   ・ローテーションは「新しい鍵を作り、古い鍵に有効期限を付ける」。切替中に止まらない。
   ・レート制限はメモリ内（api コンテナは1つ。Redis は要らない）。
   ・スコープは collections.ts の台帳から自動で生える。ここに名前を書き足さない。
   ============================================================================ */
import crypto from 'crypto'
import type { Pool } from 'pg'
import { COLLECTION_SCOPES } from './collections'

export const KEY_PREFIX = 'bl_live_'

/** 集計だけを返すツール用のスコープ（1行の明細は返らない）。台帳の表とは別立て。 */
export const AGGREGATE_SCOPES: { id: string; label: string; danger?: boolean; basic?: boolean }[] = [
  { id: 'yojitsu.read', label: '予実・資金繰り・残高の「合計の数字」を読む（明細は返らない）', basic: true },
]

export const SCOPES: { id: string; label: string; danger?: boolean; basic?: boolean }[] = [
  ...AGGREGATE_SCOPES,
  ...COLLECTION_SCOPES,
]
export const SCOPE_IDS = SCOPES.map(s => s.id)
export const isScope = (s: any) => SCOPE_IDS.includes(String(s || ''))
export const hasScope = (scopes: string[] | null, need: string) =>
  !need || (Array.isArray(scopes) && scopes.includes(need))

/** 画面で選ぶ「段」。細かいチェックは常に出すが、ここを押せば一気に決まる（公式 §17.3） */
export const SCOPE_LEVELS = [
  { id: 'basic', label: '基本', note: '毎日の経理で使う表（取引先・請求・入金・支払・経費・予算・科目）＋合計の数字',
    scopes: SCOPES.filter(s => s.basic).map(s => s.id) },
  { id: 'all', label: '全画面', note: '個人情報の表（特定技能者・在籍期間）を除く すべての表',
    scopes: SCOPES.filter(s => !s.danger).map(s => s.id) },
  { id: 'all_pii', label: '全画面＋個人情報', note: '★ 特定技能者・在籍期間も読める。管理者の判断が要ります',
    scopes: SCOPES.map(s => s.id) },
]

export interface Integration {
  id: string; name: string; scopes: string[]; status: string
  keyPrefix: string; keyLast4: string; createdBy: string; createdAt: any
  lastUsedAt: any; expiresAt: any; revokedAt: any; rotatedFrom: string | null; note: string
}

export async function initApiKeys(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_integrations (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      key_hash      TEXT NOT NULL,
      key_prefix    TEXT NOT NULL,
      key_last4     TEXT NOT NULL,
      scopes        JSONB NOT NULL DEFAULT '[]'::jsonb,
      status        TEXT NOT NULL DEFAULT 'active',
      note          TEXT,
      created_by    TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_used_at  TIMESTAMPTZ,
      expires_at    TIMESTAMPTZ,
      revoked_at    TIMESTAMPTZ,
      revoked_by    TEXT,
      rotated_from  TEXT
    )`)
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_apiint_hash ON api_integrations(key_hash)')
}

export const sha256 = (s: string | Buffer) => crypto.createHash('sha256').update(s).digest('hex')

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
export function generateKey(): string {
  const bytes = crypto.randomBytes(40)
  let s = ''
  for (let i = 0; i < 40; i++) s += ALNUM[bytes[i] % ALNUM.length]
  return KEY_PREFIX + s
}
/** 表示用: bl_live_xxxx••••••••93Ks */
export const maskKey = (prefix: string, last4: string) => KEY_PREFIX + String(prefix || '').slice(0, 4) + '••••••••' + String(last4 || '')

export function dto(x: any): Integration {
  return {
    id: x.id, name: x.name, scopes: Array.isArray(x.scopes) ? x.scopes : [], status: x.status,
    keyPrefix: x.key_prefix, keyLast4: x.key_last4, createdBy: x.created_by || '', createdAt: x.created_at,
    lastUsedAt: x.last_used_at || null, expiresAt: x.expires_at || null, revokedAt: x.revoked_at || null,
    rotatedFrom: x.rotated_from || null, note: x.note || '',
  }
}
export const dtoMasked = (x: any) => ({ ...dto(x), maskedKey: maskKey(x.key_prefix, x.key_last4) })

export function cleanScopes(v: any): string[] {
  if (!Array.isArray(v)) return []
  return Array.from(new Set(v.map(s => String(s || '').trim()).filter(isScope)))
}

/** 新しい連携を作る。平文の鍵はこの戻り値にしか無い。 */
export async function createIntegration(pool: Pool, p: { name: string; scopes: string[]; by: string; note?: string; rotatedFrom?: string | null }) {
  const key = generateKey()
  const body = key.slice(KEY_PREFIX.length)
  const id = crypto.randomUUID()
  await pool.query(
    `INSERT INTO api_integrations(id, name, key_hash, key_prefix, key_last4, scopes, status, note, created_by, rotated_from)
     VALUES($1,$2,$3,$4,$5,$6::jsonb,'active',$7,$8,$9)`,
    [id, p.name, sha256(key), body.slice(0, 4), body.slice(-4), JSON.stringify(cleanScopes(p.scopes)), p.note || null, p.by, p.rotatedFrom || null])
  const q = await pool.query('SELECT * FROM api_integrations WHERE id=$1', [id])
  return { integration: dtoMasked(q.rows[0]), plaintextKey: key }
}

/** 鍵 → 連携。無効・失効・期限切れは null。監査は呼び出し側が結果ごとに書く。 */
export async function resolveApiKey(pool: Pool, presented: string): Promise<Integration | null> {
  const k = String(presented || '').trim()
  if (!k.startsWith(KEY_PREFIX) || k.length !== KEY_PREFIX.length + 40) return null
  const q = await pool.query('SELECT * FROM api_integrations WHERE key_hash=$1', [sha256(k)])
  const row = q.rows[0]
  if (!row) return null
  if (row.status !== 'active' && row.status !== 'rotating') return null   // rotating = 猶予中の旧鍵
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null
  return dto(row)
}

/** id → 連携（MCP のトークンから引く）。判定は resolveApiKey と同じ。 */
export async function getIntegrationById(pool: Pool, id: string): Promise<Integration | null> {
  const sid = String(id || '')
  if (!/^[A-Za-z0-9\-]{8,64}$/.test(sid)) return null
  const q = await pool.query('SELECT * FROM api_integrations WHERE id=$1', [sid])
  const row = q.rows[0]
  if (!row) return null
  if (row.status !== 'active' && row.status !== 'rotating') return null
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null
  return dto(row)
}

/* 最終利用日時は1分に1回まで（毎リクエスト UPDATE しない） */
const _lastTouch = new Map<string, number>()
export function touchLastUsed(pool: Pool, id: string) {
  const now = Date.now()
  if ((_lastTouch.get(id) || 0) > now - 60_000) return
  _lastTouch.set(id, now)
  pool.query('UPDATE api_integrations SET last_used_at=now() WHERE id=$1', [id]).catch(() => {})
}

/* ───────── レート制限（メモリ内） ───────── */
const _rl = new Map<string, { n: number; t: number }>()
export function rateHit(key: string, max: number, winMs: number): boolean {
  const now = Date.now()
  const e = _rl.get(key)
  if (!e || now - e.t > winMs) { _rl.set(key, { n: 1, t: now }); return false }
  e.n++
  return e.n > max
}
export function rateReset() { _rl.clear() }
