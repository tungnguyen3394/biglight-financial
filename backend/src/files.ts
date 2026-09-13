/* ============================================================================
   添付ファイル — 請求書・入金・支払請求・支払・費目・物件・取引先 に付ける書類
   ----------------------------------------------------------------------------
   利用者の指示（2026-09-14）:「どの取引にも添付ボタンを。支払には請求書を、
   請求書には請求書のPDFを付けられるように」

   決めごと:
   ・ファイルの中身は app_state（全員の画面に配られるJSON）に絶対に入れない。
     入れると、アプリを開くたびに全員が全ファイルを受け取ることになる。
     別の表（attachments, BYTEA）に置く。CRM の worker_files と同じ作り。
   ・種類は「中身」で判断する（拡張子は信用しない）:
       PDF／画像（JPEG・PNG・GIF・WebP・HEIC）／Excel・Word（xlsx・docx・xls・doc）
     マクロ入りの Office ファイルは受け付けない（開いた人のPCで動くため）。
   ・1ファイル 10MB まで。
   ・見る・付ける・消す は、その伝票の画面の 表示・編集・削除 の権限に従う
     （画面を見せていない人には、添付も見せない）。
   ・消すのは「消した印」を付けるだけ。誰が何を消したかは操作履歴に残す。
   ・外部API・MCP からは一切見えません（ここにしか口が無い）。
   ========================================================================== */
import crypto from 'crypto'
import { Router } from 'express'
import type { Pool } from 'pg'

export const MAX_FILE_BYTES = 10 * 1024 * 1024

/** 添付を付けてよい台帳 → 権限を見る画面 */
export const ATTACH_ENTITIES: Record<string, string> = {
  invoices: 'invoices', payments: 'receipts', bills: 'bills', payouts: 'payouts',
  expenses: 'expenses', costItems: 'expenses', properties: 'properties', companies: 'companies',
}

export async function initFiles(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attachments (
      id          TEXT PRIMARY KEY,
      entity      TEXT NOT NULL,
      entity_id   TEXT NOT NULL,
      file_name   TEXT NOT NULL,
      mime        TEXT NOT NULL,
      kind        TEXT NOT NULL,
      size_bytes  INT  NOT NULL,
      sha256      TEXT NOT NULL,
      data        BYTEA NOT NULL,
      uploaded_by TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at  TIMESTAMPTZ,
      deleted_by  TEXT
    )`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_att_entity ON attachments(entity, entity_id) WHERE deleted_at IS NULL`)
}

const has = (b: Buffer, needle: string, enc: BufferEncoding = 'latin1') => b.indexOf(Buffer.from(needle, enc)) >= 0
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

export type Sniffed = { ok: boolean; mime?: string; kind?: string; reason?: string }

/** 中身を見て種類を決める。受け付けないものは reason を返す。 */
export function sniff(b: Buffer, fileName: string): Sniffed {
  const ext = String(fileName || '').toLowerCase().split('.').pop() || ''
  if (!b || b.length < 8) return { ok: false, reason: 'ファイルが空か、壊れています' }
  if (b.slice(0, 5).toString('latin1') === '%PDF-') return { ok: true, mime: 'application/pdf', kind: 'PDF' }
  if (b[0] === 0x89 && b.slice(1, 4).toString('latin1') === 'PNG') return { ok: true, mime: 'image/png', kind: '画像' }
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ok: true, mime: 'image/jpeg', kind: '画像' }
  if (b.slice(0, 4).toString('latin1') === 'GIF8') return { ok: true, mime: 'image/gif', kind: '画像' }
  if (b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') return { ok: true, mime: 'image/webp', kind: '画像' }
  const ftyp = b.slice(4, 12).toString('latin1')
  if (/^ftyp(heic|heix|hevc|mif1|msf1)/.test(ftyp)) return { ok: true, mime: 'image/heic', kind: '画像' }

  /* Office（新しい形式 = ZIP） */
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) {
    if (!has(b, '[Content_Types].xml')) return { ok: false, reason: 'ZIP ファイルは受け付けていません（Excel・Word 以外）' }
    if (has(b, 'vbaProject.bin')) return { ok: false, reason: 'マクロ入りの Office ファイルは受け付けません（xlsm・docm など）' }
    if (has(b, 'xl/')) return { ok: true, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'Excel' }
    if (has(b, 'word/')) return { ok: true, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'Word' }
    return { ok: false, reason: 'Excel・Word 以外の Office ファイルは受け付けていません' }
  }
  /* Office（古い形式 = OLE）。マクロの入れ物（_VBA_PROJECT・Macros）があれば断る */
  if (b.slice(0, 8).equals(OLE_MAGIC)) {
    if (has(b, '_VBA_PROJECT', 'utf16le') || has(b, 'Macros', 'utf16le') || has(b, '_VBA_PROJECT')) {
      return { ok: false, reason: 'マクロ入りの Office ファイルは受け付けません' }
    }
    if (ext === 'xls') return { ok: true, mime: 'application/vnd.ms-excel', kind: 'Excel' }
    if (ext === 'doc') return { ok: true, mime: 'application/msword', kind: 'Word' }
    return { ok: false, reason: '古い形式の Office は .xls / .doc だけ受け付けます' }
  }
  return { ok: false, reason: '受け付けている種類は PDF・画像・Excel・Word です' }
}

/** ファイル名から危ない文字を取る（ダウンロード時のヘッダーに入るため）。制御文字も落とす。 */
export function safeName(name: string): string {
  let n = ''
  for (const ch of String(name || 'file')) {
    const code = ch.charCodeAt(0)
    if (code < 32 || code === 127) continue
    n += '\\/<>:"|?*'.includes(ch) ? '_' : ch
  }
  n = n.trim()
  return (n || 'file').slice(0, 180)
}
export const newFileId = () => 'F' + Date.now().toString(36) + crypto.randomBytes(6).toString('hex')
export const sha256 = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex')

/* ───────── 口（index.ts から使う。テストでは偽のDBで同じものを動かす） ───────── */
export type FilesDeps = {
  pool: Pool
  /** 承認されたアカウントか。ダメなら自分で応答して null */
  requireActive: (req: any, res: any) => Promise<{ email: string; role: string } | null>
  permOf: (st: any, email: string, role: string, page: string) => { v: boolean; c: boolean; e: boolean; d: boolean }
  loadState: () => Promise<any>
  audit: (email: string, action: string, id: string, detail: any) => Promise<void> | void
}
const fileRow = (r: any) => ({ id: r.id, entity: r.entity, entityId: r.entity_id, fileName: r.file_name, mime: r.mime,
  kind: r.kind, size: Number(r.size_bytes || 0), uploadedBy: r.uploaded_by || '', createdAt: r.created_at })
const COLS = 'id,entity,entity_id,file_name,mime,kind,size_bytes,uploaded_by,created_at'

export function filesRouter(d: FilesDeps): Router {
  const r = Router()
  /** その伝票の画面の 表示(v)・編集(e)・削除(d) を持っているか */
  async function perm(req: any, res: any, entity: string, act: 'v' | 'e' | 'd') {
    const me = await d.requireActive(req, res); if (!me) return null
    const page = ATTACH_ENTITIES[String(entity || '')]
    if (!page) { res.status(400).json({ error: 'bad-entity', message: 'この台帳には添付できません' }); return null }
    const st = await d.loadState()
    const p = d.permOf(st, me.email, me.role, page)
    const ok = act === 'v' ? p.v : (act === 'e' ? (p.e || p.c) : p.d)
    if (!ok) {
      res.status(403).json({ error: 'no-permission', message: 'この画面の添付を' + ({ v: '見る', e: '付ける', d: '消す' } as any)[act] + '権限がありません' })
      return null
    }
    return { ...me, st }
  }
  const wrap = (fn: any) => (req: any, res: any) => Promise.resolve(fn(req, res)).catch((e: any) => {
    console.error('[files]', e && e.message)
    if (!res.headersSent) res.status(500).json({ error: 'server-error', message: 'サーバー内部で失敗しました' })
  })

  r.get('/files', wrap(async (req: any, res: any) => {
    const entity = String(req.query.entity || ''), entityId = String(req.query.id || '')
    if (!(await perm(req, res, entity, 'v'))) return
    const q = await d.pool.query(`SELECT ${COLS} FROM attachments WHERE entity=$1 AND entity_id=$2 AND deleted_at IS NULL ORDER BY created_at`, [entity, entityId])
    res.json({ items: q.rows.map(fileRow) })
  }))
  /** 一覧の 📎 の数（1画面ぶんを1回で） */
  r.get('/files/counts', wrap(async (req: any, res: any) => {
    const entity = String(req.query.entity || '')
    if (!(await perm(req, res, entity, 'v'))) return
    const q = await d.pool.query(`SELECT entity_id, COUNT(*)::int AS n FROM attachments WHERE entity=$1 AND deleted_at IS NULL GROUP BY entity_id`, [entity])
    const out: any = {}; for (const x of q.rows) out[x.entity_id] = Number(x.n)
    res.json({ counts: out })
  }))
  r.post('/files', wrap(async (req: any, res: any) => {
    const b = req.body || {}
    const entity = String(b.entity || ''), entityId = String(b.entityId || '')
    const me = await perm(req, res, entity, 'e'); if (!me) return
    const list: any[] = Array.isArray((me.st as any)[entity]) ? (me.st as any)[entity] : []
    if (!list.some(x => x && String(x.id) === entityId)) return res.status(404).json({ error: 'no-record', message: '添付先の伝票が見つかりません（先に保存してください）' })
    const raw = String(b.dataBase64 || '').replace(/^data:[^;]+;base64,/, '')
    const buf = Buffer.from(raw, 'base64')
    if (!buf.length) return res.status(400).json({ error: 'empty', message: 'ファイルが空です' })
    if (buf.length > MAX_FILE_BYTES) return res.status(413).json({ error: 'too-large', message: '1ファイル 10MB までです' })
    const name = safeName(b.fileName)
    const t = sniff(buf, name)
    if (!t.ok) return res.status(415).json({ error: 'bad-type', message: t.reason })
    const id = newFileId(), hash = sha256(buf)
    await d.pool.query(`INSERT INTO attachments(id,entity,entity_id,file_name,mime,kind,size_bytes,sha256,data,uploaded_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, entity, entityId, name, t.mime, t.kind, buf.length, hash, buf, me.email])
    await d.audit(me.email, 'upload', id, { entity, entityId, fileName: name, kind: t.kind, size: buf.length, sha256: hash })
    const q = await d.pool.query(`SELECT ${COLS} FROM attachments WHERE id=$1`, [id])
    res.status(201).json({ item: fileRow(q.rows[0]) })
  }))
  r.get('/files/:id', wrap(async (req: any, res: any) => {
    const q0 = await d.pool.query('SELECT entity FROM attachments WHERE id=$1 AND deleted_at IS NULL', [String(req.params.id)])
    /* 無いときも、まず本人確認をしてから 404（ID があるかどうかを他人に教えない） */
    if (!q0.rows[0]) { if (await d.requireActive(req, res)) res.status(404).json({ error: 'not-found' }); return }
    if (!(await perm(req, res, q0.rows[0].entity, 'v'))) return
    const q = await d.pool.query('SELECT file_name, mime, data FROM attachments WHERE id=$1', [String(req.params.id)])
    const f = q.rows[0]
    const inline = String(req.query.inline || '') === '1' && /^(application\/pdf|image\/)/.test(f.mime)
    res.setHeader('Content-Type', f.mime)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Disposition', (inline ? 'inline' : 'attachment') + "; filename*=UTF-8''" + encodeURIComponent(f.file_name))
    res.send(f.data)
  }))
  r.delete('/files/:id', wrap(async (req: any, res: any) => {
    const q0 = await d.pool.query('SELECT entity, entity_id, file_name, size_bytes, sha256 FROM attachments WHERE id=$1 AND deleted_at IS NULL', [String(req.params.id)])
    if (!q0.rows[0]) { if (await d.requireActive(req, res)) res.status(404).json({ error: 'not-found' }); return }
    const me = await perm(req, res, q0.rows[0].entity, 'd'); if (!me) return
    await d.pool.query('UPDATE attachments SET deleted_at=now(), deleted_by=$2 WHERE id=$1', [String(req.params.id), me.email])
    const x = q0.rows[0]
    await d.audit(me.email, 'delete', String(req.params.id), { entity: x.entity, entityId: x.entity_id, fileName: x.file_name, size: x.size_bytes, sha256: x.sha256 })
    res.json({ ok: true })
  }))
  return r
}
