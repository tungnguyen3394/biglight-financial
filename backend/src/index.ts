/* ============================================================================
   BIGLIGHT 予実管理システム — API
   ----------------------------------------------------------------------------
   ★★★ NĂM LUẬT BẤT DI BẤT DỊCH (chép từ CRM sau sự cố mất dữ liệu 31/07/2026) ★★★
   1. NGUỒN SỰ THẬT DUY NHẤT = PostgreSQL.
   2. localStorage của trình duyệt CHỈ LÀ CACHE.
   3. KHÔNG BAO GIỜ sinh dữ liệu mẫu khi dữ liệu rỗng.
   4. KHÔNG BAO GIỜ nhận dữ liệu chưa từng đi ra từ server (bắt buộc pull trước).
   5. KHÔNG BAO GIỜ ghi đè cả database. Chỉ ghi theo từng bản ghi qua /state-delta.
   ========================================================================== */
import express from 'express'
import cors from 'cors'
import { pool, ensureTables, cfgGet, cfgSet } from './db'
import { verifyBearer, loginWithToken, profileOf, canWriteAtAll } from './auth'
import { mergeCollection, isRecordArray, isSuspiciousShrink, diffRecord } from './merge'
import { checkCollections, checkMoneyRules } from './authz'
import { fetchFromCrm, applyCrmPayload, logCrmSync, parseCsv, csvToRecords, CSV_MAP_COMPANY, CSV_MAP_WORKER, CSV_MAP_ASSIGN } from './crmsync'

const app = express()
const PORT = Number(process.env.PORT || 4000)

// Hợp đồng API: client cũ hơn số này KHÔNG được ghi (cache HTML cũ = nguồn của lỗi ma).
const API_CONTRACT = 1
const MIN_CLIENT_CONTRACT = 1
const MAX_DELETE_PER_REQ = 200
const PERM_MODE = (process.env.PERM_MODE || 'enforce').toLowerCase()   // 'log' khi mới bật

app.use(express.json({ limit: '64mb' }))
app.use(express.text({ limit: '32mb', type: 'text/csv' }))
app.use(cors({
  origin: (origin, cb) => cb(null, true),   // production đi cùng origin qua nginx → CORS không phát sinh
  credentials: false,
}))
app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })

/* ===================== Trạng thái phiên bản dữ liệu ===================== */
let globalRev = 0
const colRev: Record<string, number> = {}
let stateEpoch = ''          // đổi sau mỗi lần restore → client cũ buộc phải tải lại

function bumpRevs(keys: string[]) {
  globalRev++
  for (const k of keys) colRev[k] = globalRev
}

/* ===================== SSE ===================== */
const sseClients = new Set<any>()
function sseBroadcast(by: string) {
  const payload = `event: changed\ndata: ${JSON.stringify({ rev: globalRev, by })}\n\n`
  for (const res of sseClients) { try { res.write(payload) } catch { /* ignore */ } }
}

/* ===================== Tiện ích ===================== */
const ipOf = (req: any) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim()

async function syncLog(req: any, email: string, result: string, reason: string, detail: any) {
  try {
    await pool.query(
      `INSERT INTO sync_log(actor_email,result,reason,ip,user_agent,contract,detail)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [email, result, reason, ipOf(req), String(req.headers['user-agent'] || '').slice(0, 300),
        Number(req.headers['x-client-contract'] || 0), JSON.stringify(detail || {})])
  } catch { /* nhật ký hỏng không được làm hỏng việc chính */ }
}

function countsOf(state: any) {
  const c: any = {}
  for (const [k, v] of Object.entries(state || {})) if (Array.isArray(v)) c[k] = v.length
  return c
}

async function saveHistory(state: any, email: string, reason: string) {
  try {
    await pool.query(
      'INSERT INTO app_state_history(actor_email, reason, counts, data) VALUES($1,$2,$3::jsonb,$4::jsonb)',
      [email, reason, JSON.stringify(countsOf(state)), JSON.stringify(state)])
    // Tự dọn: giữ toàn bộ 24h + mỗi giờ trong 7 ngày + mỗi ngày trong 30 ngày
    await pool.query(`
      DELETE FROM app_state_history WHERE id IN (
        SELECT id FROM (
          SELECT id, at,
            row_number() OVER (PARTITION BY date_trunc('hour', at) ORDER BY at DESC) rh,
            row_number() OVER (PARTITION BY date_trunc('day',  at) ORDER BY at DESC) rd
          FROM app_state_history WHERE at < now() - interval '24 hours'
        ) t
        WHERE (at >= now() - interval '7 days'  AND rh > 1)
           OR (at <  now() - interval '7 days'  AND at >= now() - interval '30 days' AND rd > 1)
           OR (at <  now() - interval '30 days')
      )`)
  } catch (e: any) { console.error('saveHistory:', e?.message) }
}

/** Ghi audit theo từng bản ghi — cái làm nhật ký đọc được, không phải bãi JSON. */
async function writeAudit(email: string, name: string, base: any, changed: any, deleted: any) {
  const rows: any[] = []
  for (const coll of Object.keys(changed || {})) {
    if (!Array.isArray(changed[coll])) continue
    const old = new Map((Array.isArray(base[coll]) ? base[coll] : []).map((r: any) => [String(r?.id), r]))
    for (const rec of changed[coll]) {
      if (!rec || rec.id == null) continue
      const prev = old.get(String(rec.id))
      if (!prev) rows.push([email, name, 'create', coll, String(rec.id), JSON.stringify({ after: rec })])
      else {
        const d = diffRecord(prev, rec)
        if (Object.keys(d).length) rows.push([email, name, 'update', coll, String(rec.id), JSON.stringify(d)])
      }
    }
  }
  for (const coll of Object.keys(deleted || {})) {
    const old = new Map((Array.isArray(base[coll]) ? base[coll] : []).map((r: any) => [String(r?.id), r]))
    for (const id of (deleted[coll] || [])) {
      // Xoá thì lưu NGUYÊN dòng cũ — không có nó thì không ai biết đã mất gì
      rows.push([email, name, 'delete', coll, String(id), JSON.stringify({ before: old.get(String(id)) ?? null })])
    }
  }
  if (!rows.length) return
  try {
    const vals = rows.map((_, i) => `($${i * 6 + 1},$${i * 6 + 2},$${i * 6 + 3},$${i * 6 + 4},$${i * 6 + 5},$${i * 6 + 6}::jsonb)`).join(',')
    await pool.query(
      `INSERT INTO audit_log(actor_email,actor_name,action,entity,entity_id,detail) VALUES ${vals}`,
      rows.flat())
  } catch (e: any) { console.error('writeAudit:', e?.message) }
}

/* ===================== Sức khoẻ ===================== */
app.get('/health', (_req, res) => res.json({ status: 'ok' }))
app.get('/version', (_req, res) => res.json({ apiContract: API_CONTRACT, minClientContract: MIN_CLIENT_CONTRACT, rev: globalRev, epoch: stateEpoch }))

/* ===================== Đăng nhập ===================== */
/* 画面が使うクライアントIDは「サーバーの .env」を唯一の正とする。
   HTMLに直接書いてあると、.env と食い違ったときに aud-mismatch で
   「@biglight.jp で入ってください」とだけ出て原因が分からなくなる（2026-08-27 実際に発生）。 */
app.get('/config', (_req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    allowedDomain: process.env.ALLOWED_DOMAIN || 'biglight.jp',
    apiContract: API_CONTRACT,
  })
})

app.post('/auth/google', async (req, res) => {
  const token = String(req.body?.credential || req.body?.token || '')
  if (!token) return res.status(400).json({ error: 'no token' })
  const me: any = await loginWithToken(token, ipOf(req), String(req.headers['user-agent'] || '').slice(0, 300))
  if (me && me.error) {
    const msg: any = {
      'domain-mismatch':  '@' + (process.env.ALLOWED_DOMAIN || 'biglight.jp') + ' のアカウントでログインしてください。',
      'aud-mismatch':     '設定エラー: 画面とサーバーのクライアントIDが違います。管理者にご連絡ください。',
      'email-unverified': 'メールアドレスが未確認のアカウントです。',
      'bad-token':        'ログイン情報を確認できませんでした。もう一度お試しください。',
      'network':          'Googleに接続できませんでした。時間をおいてお試しください。',
    }
    return res.status(401).json({ error: me.error, detail: me.detail, message: msg[me.error] || 'ログインできませんでした。' })
  }
  res.json(me)
})

app.get('/me', async (req, res) => {
  const email = await verifyBearer(req)
  if (!email) return res.status(401).json({ error: 'unauthorized' })
  const p = await profileOf(email)
  await pool.query('UPDATE profiles SET last_seen=now() WHERE email=$1', [email])
  res.json({ email, ...p })
})

app.get('/users', async (req, res) => {
  const email = await verifyBearer(req)
  if (!email) return res.status(401).json({ error: 'unauthorized' })
  const r = await pool.query(
    `SELECT email,name,picture,role,status,created_at,last_login,last_seen FROM profiles ORDER BY created_at`)
  res.json({ items: r.rows })
})

app.put('/users', async (req, res) => {
  const email = await verifyBearer(req)
  if (!email) return res.status(401).json({ error: 'unauthorized' })
  const me = await profileOf(email)
  if (me.role !== 'Admin') return res.status(403).json({ error: 'admin-only' })
  const { target, role, status } = req.body || {}
  if (!target) return res.status(400).json({ error: 'no target' })
  // Không cho tự hạ quyền chính mình → tránh khoá luôn cửa vào hệ thống
  if (String(target).toLowerCase() === email && role && role !== 'Admin') {
    return res.status(400).json({ error: 'cannot-demote-self' })
  }
  await pool.query(
    `UPDATE profiles SET role=COALESCE($2,role), status=COALESCE($3,status) WHERE email=$1`,
    [String(target).toLowerCase(), role || null, status || null])
  await pool.query('INSERT INTO audit_log(actor_email,action,entity,entity_id,detail) VALUES($1,$2,$3,$4,$5::jsonb)',
    [email, 'update', 'profiles', String(target).toLowerCase(), JSON.stringify({ role, status })])
  res.json({ ok: true })
})

app.get('/login-log', async (req, res) => {
  const email = await verifyBearer(req)
  if (!email) return res.status(401).json({ error: 'unauthorized' })
  const r = await pool.query('SELECT at,email,ip,user_agent FROM login_log ORDER BY at DESC LIMIT 200')
  res.json({ items: r.rows })
})

/* ===================== ĐỌC dữ liệu ===================== */
app.get('/state', async (req, res) => {
  const email = await verifyBearer(req)
  if (!email) return res.status(401).json({ error: 'unauthorized' })
  const r = await pool.query('SELECT data FROM app_state WHERE id=1')
  res.json({ data: r.rows[0]?.data || {}, rev: globalRev, epoch: stateEpoch, apiContract: API_CONTRACT })
})

app.get('/state-diff', async (req, res) => {
  const email = await verifyBearer(req)
  if (!email) return res.status(401).json({ error: 'unauthorized' })
  const since = Number(req.query.since || 0)
  if (since >= globalRev) return res.json({ changed: {}, rev: globalRev, epoch: stateEpoch })
  const r = await pool.query('SELECT data FROM app_state WHERE id=1')
  const data = r.rows[0]?.data || {}
  const changed: any = {}
  for (const k of Object.keys(data)) if ((colRev[k] || 0) > since) changed[k] = data[k]
  res.json({ changed, rev: globalRev, epoch: stateEpoch })
})

/* ===================== GHI dữ liệu — đường DUY NHẤT ===================== */
app.put('/state-delta', async (req, res) => {
  const email = await verifyBearer(req)
  if (!email) return res.status(401).json({ error: 'unauthorized' })

  // Chốt 1 — client quá cũ
  const contract = Number(req.headers['x-client-contract'] || 0)
  if (!(contract >= MIN_CLIENT_CONTRACT)) {
    syncLog(req, email, 'blocked', 'client-too-old', { contract })
    return res.status(426).json({ error: 'client-too-old', minClientContract: MIN_CLIENT_CONTRACT })
  }
  // Chốt 2 — tài khoản có được ghi không (LUÔN chặn thật)
  const prof = await profileOf(email)
  const gate = canWriteAtAll(prof.role, prof.status)
  if (!gate.ok) {
    syncLog(req, email, 'blocked', 'authz-' + gate.reason, {})
    return res.status(403).json({ error: gate.reason, message: 'このアカウントは書き込みできません（管理者に承認を依頼してください）。' })
  }
  const role = prof.role

  const changed = req.body?.changed
  const deleted = (req.body?.deleted && typeof req.body.deleted === 'object' && !Array.isArray(req.body.deleted)) ? req.body.deleted : {}
  const since = Number(req.body?.since) || 0
  const clientEpoch = String(req.body?.epoch || '')
  if (!changed || typeof changed !== 'object' || Array.isArray(changed)) return res.status(400).json({ error: 'no changed' })

  // Chốt 3 — chưa từng pull thì không được ghi
  if (since <= 0) {
    syncLog(req, email, 'blocked', 'since-required', { keys: Object.keys(changed) })
    return res.status(409).json({ error: 'since-required', rev: globalRev, epoch: stateEpoch })
  }
  // Chốt 4 — client đang cầm dữ liệu của "bản database" khác (sau restore)
  if (clientEpoch && stateEpoch && clientEpoch !== stateEpoch) {
    syncLog(req, email, 'blocked', 'epoch-mismatch', { clientEpoch, stateEpoch })
    return res.status(409).json({ error: 'epoch-mismatch', rev: globalRev, epoch: stateEpoch })
  }
  // Khoá cấu hình: người không phải Admin đẩy lên thì BỎ khoá đó, không trả 403 cả gói
  // (403 làm máy Staff kẹt vòng đồng bộ, dữ liệu thường cũng không lên được nữa)
  if (role !== 'Admin') {
    const dropped: string[] = []
    for (const k of ['userPerms', 'users', 'settings']) {
      if (Object.prototype.hasOwnProperty.call(changed, k)) { delete changed[k]; dropped.push(k) }
      if (deleted[k]) delete deleted[k]
    }
    if (dropped.length) syncLog(req, email, 'accepted', 'config-keys-stripped', { role, dropped })
  }

  const keys = Object.keys(changed)
  if (!keys.length) return res.json({ ok: true, rev: globalRev, epoch: stateEpoch })

  // Chốt 5 — xoá quá nhiều trong một lần
  let delTotal = 0
  for (const k of Object.keys(deleted)) if (Array.isArray(deleted[k])) delTotal += deleted[k].length
  if (delTotal > MAX_DELETE_PER_REQ) {
    syncLog(req, email, 'blocked', 'too-many-deletes', { delTotal })
    return res.status(409).json({ error: 'too-many-deletes', delTotal, max: MAX_DELETE_PER_REQ })
  }

  const client = await pool.connect()
  let merged: any = null
  const applied: any = {}
  const stats: any = {}
  let baseSnapshot: any = null
  try {
    await client.query('BEGIN')
    const r = await client.query('SELECT data FROM app_state WHERE id=1 FOR UPDATE')
    merged = r.rows[0]?.data || {}
    baseSnapshot = merged

    // Chốt 6 — xung đột: server đã có bản mới hơn lúc client pull
    const conflicts = keys.filter(k => (colRev[k] || 0) > since)
    if (conflicts.length) {
      await client.query('ROLLBACK'); client.release()
      const current: any = {}
      for (const k of conflicts) current[k] = merged[k]
      syncLog(req, email, 'blocked', 'conflict', { keys: conflicts, since })
      return res.status(409).json({ error: 'conflict', rev: globalRev, epoch: stateEpoch, current })
    }

    // Lớp 2 + Lớp 3 — quyền theo bảng và luật riêng của tiền
    {
      const g2 = checkCollections(merged, role, email, changed, deleted)
      const g3 = g2.ok ? checkMoneyRules(merged, role, changed, deleted) : { ok: true, reason: '', detail: undefined }
      const bad: any = !g2.ok ? g2 : (!g3.ok ? g3 : null)
      if (bad) {
        syncLog(req, email, PERM_MODE === 'log' ? 'accepted' : 'blocked', 'authz-' + bad.reason, { mode: PERM_MODE, role, ...(bad.detail || {}) })
        if (PERM_MODE !== 'log') {
          await client.query('ROLLBACK'); client.release()
          const msg = bad.reason === 'locked-doc-delete'
            ? '確定済みの伝票は削除できません。「取消」をご利用ください。'
            : bad.reason === 'locked-doc-amount'
              ? '確定済み伝票の金額変更は管理者・マネージャーのみです。'
              : 'この操作の権限がありません（管理者にご確認ください）。'
          return res.status(403).json({ error: bad.reason, detail: bad.detail, message: msg })
        }
      }
    }

    for (const k of keys) {
      const inc = changed[k]
      const base = merged[k]
      if (Array.isArray(inc) && Array.isArray(base) && (isRecordArray(base) || isRecordArray(inc))) {
        const before = base.length
        const m = mergeCollection(base, inc, deleted[k] || [])
        // Chốt 7 — co ngót bất thường
        if (isSuspiciousShrink(before, m.out.length) && req.body.confirmShrink !== true) {
          await client.query('ROLLBACK'); client.release()
          console.error('[SYNC] SHRINK GUARD', JSON.stringify({ by: email, k, before, after: m.out.length }))
          syncLog(req, email, 'blocked', 'shrink-guard', { collection: k, before, after: m.out.length })
          return res.status(409).json({ error: 'shrink-guard', collection: k, before, after: m.out.length })
        }
        merged[k] = m.out; applied[k] = m.out
        stats[k] = `${before}→${m.out.length} (+${m.added} ~${m.updated} -${m.removed})`
      } else {
        merged[k] = inc; applied[k] = inc; stats[k] = 'replace'
      }
    }
    await client.query(
      `INSERT INTO app_state (id, data, updated_at) VALUES (1, $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`, [JSON.stringify(merged)])
    await client.query('COMMIT')
  } catch (e: any) {
    try { await client.query('ROLLBACK') } catch { /* ignore */ }
    console.error('PUT /state-delta:', e?.message)
    client.release()
    return res.status(500).json({ error: 'db error' })
  }
  client.release()

  bumpRevs(keys)
  syncLog(req, email, 'accepted', 'delta', { stats, deletes: delTotal, keys })
  writeAudit(email, '', baseSnapshot, changed, deleted)
  saveHistory(merged, email, 'delta')
  res.json({ ok: true, rev: globalRev, epoch: stateEpoch, applied })
  sseBroadcast(email)              // báo SAU KHI đã commit — không bao giờ báo trước khi lưu
})

// ❌ GHI TOÀN BỘ DATABASE — KHÔNG BAO GIỜ CÓ. Giữ route để trả lỗi rõ ràng cho client cũ.
app.put('/state', async (_req, res) => {
  res.status(410).json({ error: 'gone', message: '全体書き込みは廃止されました。/state-delta をご利用ください。' })
})

/* ===================== Realtime ===================== */
app.get('/events', async (req, res) => {
  const email = await verifyBearer(req) || (req.query.token ? await verifyBearer({ headers: { authorization: 'Bearer ' + req.query.token } }) : null)
  if (!email) return res.status(401).end()
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
  res.flushHeaders?.()
  res.write(`event: hello\ndata: ${JSON.stringify({ rev: globalRev, epoch: stateEpoch })}\n\n`)
  sseClients.add(res)
  const ping = setInterval(() => { try { res.write(': ping\n\n') } catch { /* ignore */ } }, 25_000)
  req.on('close', () => { clearInterval(ping); sseClients.delete(res) })
})

/* ===================== Nhật ký & khôi phục ===================== */
app.get('/audit', async (req, res) => {
  const email = await verifyBearer(req)
  if (!email) return res.status(401).json({ error: 'unauthorized' })
  const me = await profileOf(email)
  const isAdmin = me.role === 'Admin'
  const { entity, action, actor, from, to } = req.query as any
  const w: string[] = [], p: any[] = []
  if (!isAdmin) { p.push(email); w.push(`actor_email=$${p.length}`) }         // ai không phải Admin chỉ thấy của mình
  else if (actor) { p.push('%' + String(actor).toLowerCase() + '%'); w.push(`lower(actor_email) LIKE $${p.length}`) }
  if (entity) { p.push(entity); w.push(`entity=$${p.length}`) }
  if (action) { p.push(action); w.push(`action=$${p.length}`) }
  if (from) { p.push(from); w.push(`at >= $${p.length}::date`) }
  if (to) { p.push(to); w.push(`at < ($${p.length}::date + interval '1 day')`) }
  const sql = `SELECT at,actor_email,action,entity,entity_id,detail FROM audit_log
               ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY at DESC LIMIT 500`
  const r = await pool.query(sql, p)
  res.json({ items: r.rows })
})

app.get('/sync-log', async (req, res) => {
  const email = await verifyBearer(req)
  if (!email) return res.status(401).json({ error: 'unauthorized' })
  const r = await pool.query('SELECT at,actor_email,result,reason,ip,contract,detail FROM sync_log ORDER BY at DESC LIMIT 200')
  res.json({ items: r.rows })
})

app.get('/state-history', async (req, res) => {
  const email = await verifyBearer(req)
  if (!email) return res.status(401).json({ error: 'unauthorized' })
  const r = await pool.query('SELECT id,at,actor_email,reason,counts FROM app_state_history ORDER BY at DESC LIMIT 100')
  res.json({ items: r.rows })
})

app.post('/state-history/:id/restore', async (req, res) => {
  const email = await verifyBearer(req)
  if (!email) return res.status(401).json({ error: 'unauthorized' })
  const me = await profileOf(email)
  if (me.role !== 'Admin') return res.status(403).json({ error: 'admin-only' })
  const r = await pool.query('SELECT data FROM app_state_history WHERE id=$1', [req.params.id])
  if (!r.rows[0]) return res.status(404).json({ error: 'not found' })
  const cur = await pool.query('SELECT data FROM app_state WHERE id=1')
  await saveHistory(cur.rows[0]?.data || {}, email, 'before-restore')   // khôi phục nhầm vẫn quay lại được
  const data = r.rows[0].data
  await pool.query('UPDATE app_state SET data=$1::jsonb, updated_at=now() WHERE id=1', [JSON.stringify(data)])
  await saveHistory(data, email, 'restore')
  stateEpoch = 'e' + Date.now().toString(36)     // mọi client buộc phải tải lại
  await cfgSet('epoch', stateEpoch)
  bumpRevs(Object.keys(data))
  await pool.query('INSERT INTO audit_log(actor_email,action,entity,entity_id,detail) VALUES($1,$2,$3,$4,$5::jsonb)',
    [email, 'restore', 'app_state', String(req.params.id), JSON.stringify({ counts: countsOf(data) })])
  res.json({ ok: true, epoch: stateEpoch, rev: globalRev })
  sseBroadcast(email)
})

/* ===================== CRM連携 ===================== */
app.get('/crm/status', async (req, res) => {
  const email = await verifyBearer(req)
  if (!email) return res.status(401).json({ error: 'unauthorized' })
  const r = await pool.query('SELECT at,source,actor,ok,stats,message FROM crm_sync_log ORDER BY at DESC LIMIT 30')
  res.json({
    configured: !!(process.env.CRM_API_BASE && process.env.CRM_EXPORT_KEY),
    apiBase: process.env.CRM_API_BASE || '',
    items: r.rows,
  })
})

/** Chạy đồng bộ. source='api' (gọi CRM) hoặc 'csv' (payload gửi kèm). */
async function runCrmSync(source: 'api' | 'csv', actor: string, payloadIn?: any) {
  const client = await pool.connect()
  try {
    const payload = source === 'api' ? await fetchFromCrm() : payloadIn
    await client.query('BEGIN')
    const r = await client.query('SELECT data FROM app_state WHERE id=1 FOR UPDATE')
    const cur = r.rows[0]?.data || {}
    const { state, stats } = applyCrmPayload(cur, payload)
    await client.query('UPDATE app_state SET data=$1::jsonb, updated_at=now() WHERE id=1', [JSON.stringify(state)])
    await client.query('COMMIT')
    bumpRevs(['companies', 'workers', 'assignments'])
    saveHistory(state, actor, 'crm-sync')
    await logCrmSync(source, actor, true, stats, 'OK')
    sseBroadcast(actor)
    return { ok: true, stats }
  } catch (e: any) {
    try { await client.query('ROLLBACK') } catch { /* ignore */ }
    const msg = String(e?.message || e)
    console.error('[CRM] sync lỗi:', msg)
    await logCrmSync(source, actor, false, {}, msg)
    return { ok: false, message: msg }
  } finally { client.release() }
}

app.post('/crm/sync', async (req, res) => {
  const email = await verifyBearer(req)
  if (!email) return res.status(401).json({ error: 'unauthorized' })
  const me = await profileOf(email)
  if (me.role !== 'Admin' && me.role !== 'Manager') return res.status(403).json({ error: 'admin-or-manager' })
  const out = await runCrmSync('api', email)
  res.status(out.ok ? 200 : 502).json(out)
})

/** Đường dự phòng: nạp CSV xuất từ CRM. kind = companies | workers | assignments */
app.post('/crm/import-csv', async (req, res) => {
  const email = await verifyBearer(req)
  if (!email) return res.status(401).json({ error: 'unauthorized' })
  const me = await profileOf(email)
  if (me.role !== 'Admin' && me.role !== 'Manager') return res.status(403).json({ error: 'admin-or-manager' })
  const kind = String(req.query.kind || req.body?.kind || '')
  const text = typeof req.body === 'string' ? req.body : String(req.body?.csv || '')
  if (!text.trim()) return res.status(400).json({ error: 'empty-csv' })
  const rows = parseCsv(text)
  const map = kind === 'companies' ? CSV_MAP_COMPANY : kind === 'workers' ? CSV_MAP_WORKER : kind === 'assignments' ? CSV_MAP_ASSIGN : null
  if (!map) return res.status(400).json({ error: 'bad-kind', message: 'kind = companies | workers | assignments' })
  const recs = csvToRecords(rows, map)
  if (!recs.length) return res.status(400).json({ error: 'no-rows', message: 'CSVから有効な行が読み取れませんでした（列見出しをご確認ください）。' })
  const out = await runCrmSync('csv', email, { [kind]: recs })
  res.status(out.ok ? 200 : 500).json({ ...out, read: recs.length })
})

/* ===================== Khởi động ===================== */
async function start() {
  await ensureTables()
  stateEpoch = (await cfgGet('epoch')) || ('e' + Date.now().toString(36))
  await cfgSet('epoch', stateEpoch)
  const r = await pool.query('SELECT data FROM app_state WHERE id=1')
  bumpRevs(Object.keys(r.rows[0]?.data || {}))

  // Đồng bộ CRM hằng đêm 03:00 (giờ máy chủ). Không dùng thư viện cron cho một việc.
  setInterval(() => {
    const now = new Date()
    if (now.getHours() === 3 && now.getMinutes() === 0) {
      if (process.env.CRM_API_BASE && process.env.CRM_EXPORT_KEY) runCrmSync('api', 'cron')
    }
  }, 60_000)

  app.listen(PORT, '0.0.0.0', () => console.log(`[予実] API cổng ${PORT} · contract ${API_CONTRACT} · epoch ${stateEpoch}`))
}
start().catch(e => { console.error('Khởi động thất bại:', e); process.exit(1) })
