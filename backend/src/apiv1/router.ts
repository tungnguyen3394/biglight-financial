/* ============================================================================
   API v1 — ルーター                                     公式 §17.0 / §17.2
   ----------------------------------------------------------------------------
   2つの入口を1ファイルで持つ（同じ関数を使うため）:
     apiV1Router   /api/v1/*   外部（Power Automate・AI Builder 等）
                               APIキー（X-API-Key）・スコープ・レート制限
     apiMgmtRouter /apimgmt/*  画面（職員）— 従来の Google セッション（Bearer）
                               鍵の発行／失効／ローテーション・連携ログ

   ★ 書き込みの口はありません。外からこのシステムの金額は動かせません。
     （必要になったら 公式 §17.7 のとおり「確認待ち」を作ってから開くこと。
       いきなり直接書き込みを開けない。）
   ★ nginx は /api/ を api:4000/ に中継して /api を落とすので、ここは '/v1' で受けます
     （外から見える URL は https://finance.biglight.jp/api/v1/…）。
   ★ 監査: actor は 'api:<連携名>'。鍵そのものはどこにも書かない。
   ============================================================================ */
import { Router } from 'express'
import crypto from 'crypto'
import type { Pool } from 'pg'
import { loadStateCached } from '../statecache'
import { COLLECTIONS, collectionById, publicRow, rowStamp } from './collections'
import { SCOPES, SCOPE_LEVELS, resolveApiKey, touchLastUsed, rateHit, hasScope,
         createIntegration, cleanScopes, dtoMasked, KEY_PREFIX, Integration } from './keys'
import { buildOpenApi } from './openapi'
import * as R from './reports'
import * as F from './finance'
import * as A from './attachments'
import { safeName } from '../files'

export const API_V1_ENABLED = String(process.env.API_V1_ENABLED || 'false').toLowerCase() === 'true'
export const API_PUBLIC_BASE = String(process.env.API_V1_PUBLIC_BASE || 'https://finance.biglight.jp').replace(/\/+$/, '')
const SERVICE = 'BIGLIGHT 予実管理システム API'
const VERSION = 'v1'

export type Deps = {
  pool: Pool
  /** Bearer（Googleセッション）→ メール。ダメなら null */
  verifyBearer: (req: any) => Promise<string | null>
  /** Admin のときだけメール */
  verifyAdmin: (req: any) => Promise<string | null>
  audit: (actor: string, action: string, id: string, detail: any) => void
}

/* ───────── 小さな道具 ───────── */
const ipOf = (req: any) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64)
const reqId = (req: any) => {
  const h = String(req.headers['x-request-id'] || '').replace(/[^A-Za-z0-9\-_.:]/g, '').slice(0, 64)
  return h || crypto.randomUUID()
}
const safeId = (v: any) => { const s = String(v || ''); return /^[A-Za-z0-9\-_.:]{1,80}$/.test(s) ? s : '' }
function fail(res: any, status: number, error: string, message: string, extra?: any) {
  return res.status(status).json(Object.assign({ error, message, request_id: res.locals.requestId || null }, extra || {}))
}
/** async の例外を必ず応答にする（スタックは返さない・ログにだけ） */
function safe(r: Router) {
  for (const m of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    const orig = (r as any)[m].bind(r)
    ;(r as any)[m] = (path: string, ...fns: any[]) => orig(path, ...fns.map(fn => (req: any, res: any, next: any) =>
      Promise.resolve(fn(req, res, next)).catch(e => {
        console.error('[api-v1] route error', m.toUpperCase(), path, e && e.message)
        if (!res.headersSent) fail(res, 500, 'server-error', 'サーバー内部で失敗しました')
      })))
  }
}
const boolQ = (v: any) => ['1', 'true', 'yes', 'on'].includes(String(v || '').toLowerCase())

/* ══════════════════════════════════════════════════════════════════════════
   外部API  /api/v1/*
   ══════════════════════════════════════════════════════════════════════════ */
export function apiV1Router(d: Deps): Router {
  const r = Router()
  safe(r)
  const pool = d.pool

  r.use('/v1', (req: any, res: any, next: any) => {
    res.locals.requestId = reqId(req)
    res.setHeader('X-Request-Id', res.locals.requestId)
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  r.get('/v1/health', (_req: any, res: any) => res.json({ status: 'ok', service: SERVICE, version: VERSION }))

  /* 認証 — 公開2本（health と openapi.json）以外はすべて鍵が要る。
     openapi.json を公開にしたのは、外部の設定担当者がコネクタを作るのに
     毎回この画面へログインするのは現実的でないため。仕様書に秘密は無く、
     載っているどの口も呼ぶには鍵が要る。 */
  r.use('/v1', async (req: any, res: any, next: any) => {
    if (req.path === '/health') return next()
    const ip = ipOf(req)
    if (rateHit('ip:' + ip, 600, 60_000)) return fail(res, 429, 'rate-limited', 'リクエストが多すぎます')
    if (req.path === '/openapi.json') return next()
    const hdr = String(req.headers['x-api-key'] || '')
    const auth = String(req.headers['authorization'] || '')
    const m = /^Bearer\s+(.+)$/i.exec(auth)
    const presented = (hdr || (m ? m[1] : '')).trim()
    if (!presented) return fail(res, 401, 'unauthorized', 'APIキーがありません（ヘッダー X-API-Key）')
    const integ = await resolveApiKey(pool, presented)
    if (!integ) {
      if (rateHit('authfail:' + ip, 30, 10 * 60_000)) return fail(res, 429, 'rate-limited', '認証失敗が多すぎます')
      d.audit('api:unknown', 'api-auth-failed', '-', { key_prefix: presented.startsWith(KEY_PREFIX) ? presented.slice(0, KEY_PREFIX.length + 4) : '(形式外)', ip, path: req.path, request_id: res.locals.requestId, result: 'denied' })
      return fail(res, 401, 'unauthorized', 'APIキーが無効・失効・期限切れです')
    }
    if (rateHit('key:' + integ.id, 300, 60_000)) return fail(res, 429, 'rate-limited', 'この連携のリクエストが多すぎます（300/分）')
    touchLastUsed(pool, integ.id)
    res.locals.integration = integ
    next()
  })
  const scopesOf = (res: any): string[] => (res.locals.integration && res.locals.integration.scopes) || []
  const need = (scope: string) => (req: any, res: any, next: any) => {
    if (!hasScope(scopesOf(res), scope)) {
      const integ: Integration = res.locals.integration
      d.audit('api:' + integ.name, 'api-scope-denied', '-', { scope, path: req.path, request_id: res.locals.requestId, result: 'denied' })
      return fail(res, 403, 'insufficient-scope', 'このAPIキーにはスコープ「' + scope + '」がありません（設定 › API・AI連携 で付けてください）', { required_scope: scope })
    }
    next()
  }

  r.get('/v1/openapi.json', (_req: any, res: any) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Disposition', 'inline; filename="biglight-yojitsu-api-v1.swagger.json"')
    res.json(buildOpenApi(API_PUBLIC_BASE))
  })

  r.get('/v1/integration/me', (_req: any, res: any) => {
    const i: Integration = res.locals.integration
    res.json({ integration: i.name, integration_id: i.id, scopes: i.scopes, status: i.status, expires_at: i.expiresAt, service: SERVICE, version: VERSION })
  })

  /* ── 表（画面）ごとの読み取り ── */
  r.get('/v1/collections', async (_req: any, res: any) => {
    const scopes = scopesOf(res)
    const st = await loadStateCached(pool)
    res.json({
      collections: COLLECTIONS.map(c => ({
        id: c.id, label: c.label, page: c.page, scope: c.readScope, note: c.note || '',
        granted: hasScope(scopes, c.readScope),
        count: hasScope(scopes, c.readScope) ? (Array.isArray(st[c.crmKey]) ? st[c.crmKey].length : 0) : null,
      })),
    })
  })

  r.get('/v1/records/:collection', async (req: any, res: any) => {
    const def = collectionById(req.params.collection)
    if (!def) return fail(res, 404, 'unknown-collection', '知らない表です（/api/v1/collections で一覧できます）')
    if (!hasScope(scopesOf(res), def.readScope)) return fail(res, 403, 'scope-required', 'この表を読むには ' + def.readScope + ' が必要です', { required_scope: def.readScope })

    const st = await loadStateCached(pool)
    const all: any[] = Array.isArray(st[def.crmKey]) ? st[def.crmKey] : []
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100))
    const since = String(req.query.updated_since || '').trim()
    if (since && isNaN(Date.parse(since)))
      return fail(res, 400, 'bad-updated_since', 'updated_since は日付（例 2026-09-01）で指定してください')

    let rows = all.filter(x => x && typeof x === 'object')
    if (since) { const t = Date.parse(since); rows = rows.filter(x => { const dd = Date.parse(rowStamp(x)); return !isNaN(dd) && dd >= t }) }
    rows = rows.slice().sort((a, b) => {
      const c = rowStamp(b).localeCompare(rowStamp(a))
      return c !== 0 ? c : String(a.id || '').localeCompare(String(b.id || ''))
    })
    const cur = String(req.query.cursor || '')
    if (cur) {
      const i = rows.findIndex(x => (rowStamp(x) + '|' + String(x.id || '')) === cur)
      if (i < 0) return fail(res, 400, 'bad-cursor', 'cursor が見つかりません。最初から取り直してください')
      rows = rows.slice(i + 1)
    }
    const page = rows.slice(0, limit)
    const last = page[page.length - 1]
    res.json({
      collection: def.id, label: def.label,
      items: page.map(x => publicRow(def, x)),
      count: page.length, total: all.length, has_more: rows.length > page.length,
      next_cursor: rows.length > page.length && last ? (rowStamp(last) + '|' + String(last.id || '')) : null,
    })
  })

  r.get('/v1/records/:collection/:id', async (req: any, res: any) => {
    const def = collectionById(req.params.collection)
    if (!def) return fail(res, 404, 'unknown-collection', '知らない表です')
    if (!hasScope(scopesOf(res), def.readScope)) return fail(res, 403, 'scope-required', 'この表を読むには ' + def.readScope + ' が必要です', { required_scope: def.readScope })
    const st = await loadStateCached(pool)
    const all: any[] = Array.isArray(st[def.crmKey]) ? st[def.crmKey] : []
    const row = all.find(x => x && String(x.id || '') === String(req.params.id || ''))
    if (!row) return fail(res, 404, 'not-found', '見つかりません')
    res.json(publicRow(def, row))
  })

  /* ── まとめの数字（MCP と同じ関数） ── */
  r.get('/v1/reports/pl', need('yojitsu.read'), async (req: any, res: any) => {
    const st = await loadStateCached(pool)
    const fy = req.query.fy ? Number(req.query.fy) : (F.fyOf(F.thisMonth()) as number)
    if (!Number.isInteger(fy) || fy < 2000 || fy > 2100) return fail(res, 400, 'bad-fy', 'fy は年度の西暦（例 2025）で')
    res.json(R.plReport(st, fy))
  })
  r.get('/v1/reports/receivables', need('invoices.read'), async (req: any, res: any) => {
    const st = await loadStateCached(pool)
    res.json(R.receivablesReport(st, { overdueOnly: boolQ(req.query.overdue_only), companyId: safeId(req.query.company_id) || undefined, limit: Number(req.query.limit) || 100 }))
  })
  r.get('/v1/reports/payables', need('bills.read'), async (req: any, res: any) => {
    const st = await loadStateCached(pool)
    res.json(R.payablesReport(st, { overdueOnly: boolQ(req.query.overdue_only), dueWithinDays: req.query.due_within_days == null ? undefined : Number(req.query.due_within_days), companyId: safeId(req.query.company_id) || undefined, limit: Number(req.query.limit) || 100 }))
  })
  r.get('/v1/reports/settlement', need('invoices.read'), async (req: any, res: any) => {
    const month = String(req.query.month || '')
    if (!/^[0-9]{4}-[0-9]{2}$/.test(month)) return fail(res, 400, 'bad-month', 'month は YYYY-MM で')
    res.json(R.settlementReport(await loadStateCached(pool), month))
  })
  r.get('/v1/reports/reconciliation', need('invoices.read'), async (req: any, res: any) => {
    const month = String(req.query.month || '')
    if (!/^[0-9]{4}-[0-9]{2}$/.test(month)) return fail(res, 400, 'bad-month', 'month は YYYY-MM で')
    res.json(R.reconciliationReport(await loadStateCached(pool), month))
  })
  r.get('/v1/reports/cashflow', need('yojitsu.read'), async (req: any, res: any) => {
    const st = await loadStateCached(pool)
    const mode = String(req.query.mode || 'week') === 'month' ? 'month' : 'week'
    res.json(R.cashflowReport(st, mode as any, Number(req.query.periods) || 12))
  })

  /* ── 添付ファイル（証憑）— 読むだけ。スコープは その伝票の表と同じ ── */
  const monthQ = (v: any) => { const s = String(v || ''); return /^\d{4}-\d{2}$/.test(s) ? s : '' }
  r.get('/v1/attachments/missing', async (req: any, res: any) => {
    const want = req.query.screen ? [String(req.query.screen)] : A.MISSING_SCREENS
    const bad = want.find(x => !A.MISSING_SCREENS.includes(x))
    if (bad) return fail(res, 400, 'bad-screen', 'screen は ' + A.MISSING_SCREENS.join(' / ') + ' のどれかです')
    const screens = want.filter(x => hasScope(scopesOf(res), A.attScreen(x)!.readScope))
    if (!screens.length) return fail(res, 403, 'scope-required', 'この表を読むスコープがありません', { required_scope: A.attScreen(want[0])!.readScope })
    const st = await loadStateCached(pool)
    res.json(await A.missingAttachments(pool, st, screens, { monthFrom: monthQ(req.query.month_from), monthTo: monthQ(req.query.month_to),
      companyId: safeId(req.query.company_id) || undefined, limit: Number(req.query.limit) || 100 }))
  })
  r.get('/v1/attachments/file/:fileId', async (req: any, res: any) => {
    const st = await loadStateCached(pool)
    const got = await A.attachmentFile(pool, st, safeId(req.params.fileId))
    if (!got) return fail(res, 404, 'not-found', '見つかりません')
    if (!hasScope(scopesOf(res), got.def.readScope)) return fail(res, 403, 'scope-required', 'このファイルを読むには ' + got.def.readScope + ' が必要です', { required_scope: got.def.readScope })
    const integ: Integration = res.locals.integration
    d.audit('api:' + integ.name, 'api-file-read', got.file.id, { screen: got.def.id, record_id: got.record.id, file_name: got.file.fileName, request_id: res.locals.requestId, result: 'ok' })
    res.setHeader('Content-Type', got.file.mime)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(safeName(got.file.fileName)))
    res.send(got.file.data)
  })
  r.get('/v1/attachments/:screen/:id', async (req: any, res: any) => {
    const def = A.attScreen(req.params.screen)
    if (!def) return fail(res, 404, 'unknown-screen', '添付が付く表は ' + A.ATT_SCREEN_IDS.join(' / ') + ' です')
    if (!hasScope(scopesOf(res), def.readScope)) return fail(res, 403, 'scope-required', 'この表を読むには ' + def.readScope + ' が必要です', { required_scope: def.readScope })
    const st = await loadStateCached(pool)
    const out = await A.attachmentsOf(pool, st, def, safeId(req.params.id))
    if (!out) return fail(res, 404, 'not-found', 'その伝票はありません')
    res.json(out)
  })

  r.use('/v1', (_req: any, res: any) => fail(res, 404, 'not-found', 'このエンドポイントはありません（/api/v1/openapi.json を見てください）'))
  return r
}

/* ══════════════════════════════════════════════════════════════════════════
   画面（職員）用  /apimgmt/*
   ══════════════════════════════════════════════════════════════════════════ */
export function apiMgmtRouter(d: Deps): Router {
  const r = Router()
  safe(r)
  const pool = d.pool
  const auth = async (req: any, res: any): Promise<string | null> => {
    const email = await d.verifyBearer(req)
    if (!email) { res.status(401).json({ error: 'unauthorized' }); return null }
    res.locals.requestId = reqId(req)
    return email
  }
  const admin = async (req: any, res: any): Promise<string | null> => {
    const email = await d.verifyAdmin(req)
    if (!email) { res.status(403).json({ error: 'admin-only', message: 'API連携の設定は管理者のみです。' }); return null }
    res.locals.requestId = reqId(req)
    return email
  }

  r.get('/apimgmt/status', async (req: any, res: any) => {
    const email = await auth(req, res); if (!email) return
    const k = await pool.query(`SELECT COUNT(*)::int AS n FROM api_integrations WHERE status IN ('active','rotating')`)
    res.json({
      enabled: true, active_keys: k.rows[0].n,
      mcp_enabled: String(process.env.MCP_ENABLED || '').toLowerCase() === 'true',
      mcp_url: String(process.env.MCP_PUBLIC_URL || (API_PUBLIC_BASE + '/mcp')),
      api_base: API_PUBLIC_BASE + '/api/v1',
    })
  })
  r.get('/apimgmt/meta', async (req: any, res: any) => {
    const email = await auth(req, res); if (!email) return
    res.json({
      scopes: SCOPES, levels: SCOPE_LEVELS,
      collections: COLLECTIONS.map(c => ({ id: c.id, label: c.label, page: c.page, scope: c.readScope, danger: !!c.danger, basic: !!c.basic, note: c.note || '' })),
    })
  })
  r.get('/apimgmt/openapi.json', async (req: any, res: any) => {
    const email = await auth(req, res); if (!email) return
    res.setHeader('Content-Disposition', 'attachment; filename="biglight-yojitsu-api-v1.swagger.json"')
    res.json(buildOpenApi(API_PUBLIC_BASE))
  })

  r.get('/apimgmt/keys', async (req: any, res: any) => {
    const email = await admin(req, res); if (!email) return
    const q = await pool.query('SELECT * FROM api_integrations ORDER BY created_at DESC')
    res.json({ items: q.rows.map(dtoMasked) })
  })
  r.post('/apimgmt/keys', async (req: any, res: any) => {
    const email = await admin(req, res); if (!email) return
    const name = String((req.body && req.body.name) || '').trim().slice(0, 80)
    if (!name) return res.status(400).json({ error: 'name-required', message: '連携の名前（使う人の名前）を入れてください。' })
    const scopes = cleanScopes(req.body && req.body.scopes)
    if (!scopes.length) return res.status(400).json({ error: 'scopes-required', message: '読める範囲を1つ以上選んでください。' })
    const out = await createIntegration(pool, { name, scopes, by: email, note: String((req.body && req.body.note) || '').slice(0, 500) })
    d.audit(email, 'api-key-created', out.integration.id, { name, scopes, masked: out.integration.maskedKey, result: 'created' })
    res.status(201).json({ integration: out.integration, api_key: out.plaintextKey, notice: 'この鍵はいま一度しか表示されません。安全な場所に保存してください。' })
  })
  r.patch('/apimgmt/keys/:id', async (req: any, res: any) => {
    const email = await admin(req, res); if (!email) return
    const id = safeId(req.params.id)
    const cur = await pool.query('SELECT * FROM api_integrations WHERE id=$1', [id]); if (!cur.rows[0]) return res.status(404).json({ error: 'not-found' })
    const b = req.body || {}
    const scopes = b.scopes !== undefined ? cleanScopes(b.scopes) : null
    if (scopes !== null && !scopes.length) return res.status(400).json({ error: 'scopes-required', message: '読める範囲を1つ以上選んでください。' })
    const name = b.name !== undefined ? String(b.name).trim().slice(0, 80) : null
    const note = b.note !== undefined ? String(b.note).slice(0, 500) : null
    await pool.query(`UPDATE api_integrations SET scopes=COALESCE($2::jsonb, scopes), name=COALESCE($3, name), note=COALESCE($4, note) WHERE id=$1`,
      [id, scopes ? JSON.stringify(scopes) : null, name || null, note])
    d.audit(email, 'api-key-updated', id, { scopes, name, result: 'updated' })
    const q = await pool.query('SELECT * FROM api_integrations WHERE id=$1', [id])
    res.json({ integration: dtoMasked(q.rows[0]) })
  })
  r.post('/apimgmt/keys/:id/revoke', async (req: any, res: any) => {
    const email = await admin(req, res); if (!email) return
    const id = safeId(req.params.id)
    const q = await pool.query(`UPDATE api_integrations SET status='revoked', revoked_at=now(), revoked_by=$2 WHERE id=$1 AND status IN ('active','rotating') RETURNING name`, [id, email])
    if (!q.rowCount) return res.status(404).json({ error: 'not-found-or-already-revoked' })
    d.audit(email, 'api-key-revoked', id, { name: q.rows[0].name, result: 'revoked' })
    res.json({ ok: true })
  })
  /* 失効（revoke）は「使えなくするが記録は残す」、こちらは行ごと消す。
     消す前に必ず監査へ残す（何をいつ誰が消したか分からなくならないように）。 */
  r.delete('/apimgmt/keys/:id', async (req: any, res: any) => {
    const email = await admin(req, res); if (!email) return
    const id = safeId(req.params.id)
    const cur = await pool.query('SELECT name, scopes, status, key_prefix, key_last4 FROM api_integrations WHERE id=$1', [id])
    const old = cur.rows[0]; if (!old) return res.status(404).json({ error: 'not-found' })
    d.audit(email, 'api-key-deleted', id, { name: old.name, scopes: old.scopes, was: old.status,
      masked: KEY_PREFIX + String(old.key_prefix || '').slice(0, 4) + '****' + String(old.key_last4 || '') })
    await pool.query('DELETE FROM api_integrations WHERE id=$1', [id])
    res.json({ ok: true })
  })
  r.post('/apimgmt/keys/:id/rotate', async (req: any, res: any) => {
    const email = await admin(req, res); if (!email) return
    const id = safeId(req.params.id)
    const cur = await pool.query(`SELECT * FROM api_integrations WHERE id=$1 AND status='active'`, [id])
    const old = cur.rows[0]; if (!old) return res.status(404).json({ error: 'not-found-or-revoked' })
    const graceH = Math.max(0, Math.min(168, Number((req.body && req.body.grace_hours) ?? 24) || 0))
    const out = await createIntegration(pool, { name: old.name, scopes: old.scopes, by: email, note: old.note || '', rotatedFrom: old.id })
    if (graceH > 0) await pool.query(`UPDATE api_integrations SET expires_at = now() + ($2 || ' hours')::interval, status='rotating' WHERE id=$1`, [id, String(graceH)])
    else await pool.query(`UPDATE api_integrations SET status='revoked', revoked_at=now(), revoked_by=$2 WHERE id=$1`, [id, email])
    d.audit(email, 'api-key-rotated', id, { new_id: out.integration.id, grace_hours: graceH, result: 'rotated' })
    res.status(201).json({ integration: out.integration, api_key: out.plaintextKey, old_expires_in_hours: graceH,
      notice: '新しい鍵はいま一度しか表示されません。古い鍵は ' + graceH + ' 時間後に使えなくなります。' })
  })

  /* 連携ログ（audit_log の api_v1 分） */
  r.get('/apimgmt/logs', async (req: any, res: any) => {
    const email = await auth(req, res); if (!email) return
    const lim = Math.max(1, Math.min(500, Number(req.query.limit) || 200))
    const q = await pool.query(`SELECT at, actor_email, action, entity_id, detail FROM audit_log WHERE entity='api_v1' ORDER BY at DESC LIMIT ${lim}`)
    res.json({ items: q.rows })
  })
  return r
}
