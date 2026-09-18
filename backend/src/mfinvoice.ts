/* ============================================================================
   Money Forward（請求書 ／ 会計）— 「読むだけ」の口
   ----------------------------------------------------------------------------
   ★ 2026-09-14 / 2026-09-18 利用者の指示:
     ・請求書の作成・明細・税・PDF・送付は Money Forward が持つ。
     ・仕訳は 経理（外部の会計事務所）が MF 会計 で行う。この システムからは
       「消込一覧」などの CSV を渡すだけ。**MF には一切書かない**。
     → ここは MF から 請求書・入出金明細・試算表 を取ってきて、形をそろえて返すだけ。
       データベースへ入れる規則は mfsync.ts、入れる操作は index.ts。
   ★ 既定は停止。MF_CLIENT_ID / MF_CLIENT_SECRET を .env に入れたときだけ動きます。
     入れなくても、画面の「CSVを読み込む」だけで同じことができます（同じ規則を通ります）。
   ★ 仕様（2026-09-18 に公式ドキュメントで確認）:
       認可     https://api.biz.moneyforward.com/authorize
       トークン https://api.biz.moneyforward.com/token（refresh も同じ）
         出典: developers.biz.moneyforward.com › チュートリアル「アクセストークンを取得する」
               クライアント認証は CLIENT_SECRET_BASIC（Authorization ヘッダー）が推奨
         スコープ: 読み取り mfc/invoice/data.read ／ 書き込み mfc/invoice/data.write
               出典: biz.moneyforward.com/support/invoice/guide/api-guide/a03.html
         エラーの形: { "errors": [{ "code": "...", "message": "..." }] }・429 はレート制限
               出典: developers.biz.moneyforward.com › API共通仕様
       ★ 書き込みスコープ（data.write）は要求しません。読むだけの連携です。
       請求書   GET /api/v3/billings?page&per_page(≤100)&range_key&from&to&status
                status の例: 下書き / ロック中 / 未ロック → 下書き は取り込まない
       Billing: id, billing_number, partner_id, partner_name, title,
                billing_date, sales_date, due_date, subtotal_price, excise_price,
                total_price（金額は文字列）, payment_status, email_status, posting_status,
                is_locked, is_downloaded, updated_at
     会計（入出金明細・試算表）は別プロダクトの API です。ベースURLとスコープは .env で変えられます
     （MF_ACCOUNTING_API_BASE / MF_ACCOUNTING_SCOPE）。繋がらない場合は CSV で運用できます。
   ========================================================================== */
import express from 'express'
import crypto from 'crypto'

export const MF_AUTHORIZE_URL = 'https://api.biz.moneyforward.com/authorize'
export const MF_TOKEN_URL = 'https://api.biz.moneyforward.com/token'
export const MF_SCOPE = 'mfc/invoice/data.read'
export const MF_ACCOUNTING_SCOPE = 'mfc/accounting/data.read'

export type MfDeps = {
  fetch: typeof fetch
  cfgGet: (k: string) => Promise<string | null>
  cfgSet: (k: string, v: string) => Promise<void>
  env?: Record<string, string | undefined>
  now?: () => number
}

export function mfConfig(env: Record<string, string | undefined> = process.env) {
  const publicUrl = String(env.MF_PUBLIC_URL || env.PUBLIC_URL || 'https://finance.biglight.jp').replace(/\/$/, '')
  const accounting = String(env.MF_ACCOUNTING_ENABLED || '').toLowerCase() === 'true'
  const scopes = [String(env.MF_SCOPE || MF_SCOPE)]
  if (accounting) scopes.push(String(env.MF_ACCOUNTING_SCOPE || MF_ACCOUNTING_SCOPE))
  return {
    clientId: String(env.MF_CLIENT_ID || ''),
    clientSecret: String(env.MF_CLIENT_SECRET || ''),
    redirectUri: String(env.MF_REDIRECT_URI || publicUrl + '/api/mf/callback'),
    apiBase: String(env.MF_INVOICE_API_BASE || 'https://invoice.moneyforward.com/api/v3').replace(/\/$/, ''),
    acctBase: String(env.MF_ACCOUNTING_API_BASE || 'https://accounting.moneyforward.com/api/v3').replace(/\/$/, ''),
    accounting,
    scope: scopes.join(' '),
    /* アプリ登録時に選んだクライアント認証方式。basic（既定）か post */
    tokenAuth: String(env.MF_TOKEN_AUTH || 'basic').toLowerCase() === 'post' ? 'post' : 'basic',
    appUrl: publicUrl,
  }
}
export const mfConfigured = (env: Record<string, string | undefined> = process.env) => {
  const c = mfConfig(env); return !!(c.clientId && c.clientSecret)
}

/* ---------- 鍵（ClientID / ClientSecret）の置き場所 ----------
   ★ 2026-09-18 利用者の要望: SSH を触らず、画面に貼るだけで繋げられるようにする。
     ① .env（MF_CLIENT_ID / MF_CLIENT_SECRET）… あればこちらが優先（今までの運用）
     ② 画面から入れた分 … サーバーの DB（server_config の mf_client）に入る
     どちらも「サーバーの中だけ」。画面・API の返り・ログには 先頭4文字と長さしか出しません。 */
export type MfCreds = { clientId: string; clientSecret: string; tokenAuth: 'basic' | 'post'; source: 'env' | 'db' | 'none' }
export async function mfCreds(d: MfDeps): Promise<MfCreds> {
  const c = mfConfig(d.env)
  if (c.clientId && c.clientSecret) return { clientId: c.clientId, clientSecret: c.clientSecret, tokenAuth: c.tokenAuth as any, source: 'env' }
  try {
    const raw = await d.cfgGet('mf_client')
    const j = raw ? JSON.parse(raw) : null
    if (j && j.clientId && j.clientSecret) {
      return { clientId: String(j.clientId), clientSecret: String(j.clientSecret),
        tokenAuth: String(j.tokenAuth || 'basic').toLowerCase() === 'post' ? 'post' : 'basic', source: 'db' }
    }
  } catch { /* 壊れていたら 無いものとして扱う */ }
  return { clientId: '', clientSecret: '', tokenAuth: c.tokenAuth as any, source: 'none' }
}
/** 画面から入れる。前の鍵と違えば 接続（トークン）も切る。 */
export async function saveMfCreds(d: MfDeps, clientId: string, clientSecret: string, tokenAuth: string) {
  const id = String(clientId || '').trim(), sec = String(clientSecret || '').trim()
  if (!id || !sec) throw new Error('ClientID と ClientSecret の両方が要ります。')
  if (/\s/.test(id) || /\s/.test(sec)) throw new Error('鍵に空白が入っています。前後の空白やコピー漏れをご確認ください。')
  const before = await mfCreds(d)
  await d.cfgSet('mf_client', JSON.stringify({
    clientId: id, clientSecret: sec,
    tokenAuth: String(tokenAuth || 'basic').toLowerCase() === 'post' ? 'post' : 'basic',
    savedAt: new Date((d.now || Date.now)()).toISOString(),
  }))
  if (before.clientId && before.clientId !== id) await d.cfgSet('mf_token', '')   // 別のアプリのトークンは使わない
  return { changedApp: !!before.clientId && before.clientId !== id }
}
/* ---------- 自動同期の予定（毎日 何時に流すか） ----------
   既定は 毎朝6時。画面（設定 › API・AI連携）から 管理者が変えられます。
   時刻は サーバーの時間帯＝日本時間（docker-compose の TZ）で考えます。 */
export type MfSchedule = { enabled: boolean; hour: number }
export const MF_SCHEDULE_DEFAULT: MfSchedule = { enabled: true, hour: 6 }
export async function mfSchedule(d: MfDeps): Promise<MfSchedule> {
  try {
    const raw = await d.cfgGet('mf_schedule')
    const j = raw ? JSON.parse(raw) : null
    if (!j) return { ...MF_SCHEDULE_DEFAULT }
    const h = Number(j.hour)
    return { enabled: j.enabled !== false, hour: Number.isInteger(h) && h >= 0 && h <= 23 ? h : MF_SCHEDULE_DEFAULT.hour }
  } catch { return { ...MF_SCHEDULE_DEFAULT } }
}
export const peek4 = (s: any) => { const t = String(s || ''); return t ? `${t.slice(0, 4)}…（${t.length}文字）` : '' }

export function authorizeUrl(state: string, env?: Record<string, string | undefined>, clientId?: string) {
  const c = mfConfig(env)
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId || c.clientId, redirect_uri: c.redirectUri, scope: c.scope, state })
  return MF_AUTHORIZE_URL + '?' + q.toString()
}

async function tokenRequest(params: Record<string, string>, d: MfDeps) {
  const k = await mfCreds(d)
  if (!k.clientId || !k.clientSecret) throw new Error('Money Forward の鍵（ClientID / ClientSecret）がまだ入っていません。設定 › API・AI連携 で入れてください。')
  const body = new URLSearchParams(params)
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }
  if (k.tokenAuth === 'basic') headers.authorization = 'Basic ' + Buffer.from(k.clientId + ':' + k.clientSecret).toString('base64')
  else { body.set('client_id', k.clientId); body.set('client_secret', k.clientSecret) }
  const r = await d.fetch(MF_TOKEN_URL, { method: 'POST', headers, body: body.toString() })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok || !j.access_token) throw new Error(scrub(`Money Forward のトークン取得に失敗しました（HTTP ${r.status}${mfErrorText(j) ? ' ' + mfErrorText(j) : ''}）`))
  const now = (d.now || Date.now)()
  return {
    access_token: String(j.access_token),
    refresh_token: String(j.refresh_token || params.refresh_token || ''),
    scope: String(j.scope || ''),
    expires_at: now + Math.max(60, Number(j.expires_in || 3600)) * 1000,
  }
}

/** 認可コード → トークン保存 */
export async function exchangeCode(code: string, by: string, d: MfDeps) {
  const c = mfConfig(d.env)
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: c.redirectUri }, d)
  await d.cfgSet('mf_token', JSON.stringify({ ...t, connected_by: by, connected_at: new Date((d.now || Date.now)()).toISOString() }))
}

/** 使えるアクセストークン（切れる1分前なら refresh して保存し直す） */
export async function accessToken(d: MfDeps): Promise<string> {
  const raw = await d.cfgGet('mf_token')
  const tok = raw ? JSON.parse(raw) : null
  if (!tok || !tok.access_token) throw new Error('Money Forward と接続されていません（管理者が「接続する」を押してください）')
  const now = (d.now || Date.now)()
  if (Number(tok.expires_at || 0) - 60_000 > now) return tok.access_token
  if (!tok.refresh_token) throw new Error('Money Forward の接続が切れました。もう一度「接続する」を押してください')
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: tok.refresh_token }, d)
  await d.cfgSet('mf_token', JSON.stringify({ ...tok, ...t }))
  return t.access_token
}

/** ログ・保存・画面に出す前にトークンらしき文字列を消す（秘密は1バイトも外に出さない） */
export function scrub(msg: any): string {
  let t = String(msg == null ? '' : msg)
  t = t.replace(/(Bearer\s+)[A-Za-z0-9._\-]{8,}/gi, '$1***')
  t = t.replace(/(Basic\s+)[A-Za-z0-9+/=]{8,}/gi, '$1***')
  t = t.replace(/((?:access|refresh|id)_token"?\s*[:=]\s*"?)[A-Za-z0-9._\-]{8,}/gi, '$1***')
  t = t.replace(/(client_secret"?\s*[:=]\s*"?)[^"&\s]+/gi, '$1***')
  return t.slice(0, 500)
}

const dateOnly = (v: any) => String(v || '').slice(0, 10)
const money = (v: any) => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return isFinite(n) ? Math.round(n) : 0 }

/** MF の Billing → このシステムで使う形（金額は数値・日付は YYYY-MM-DD） */
export function normalizeBilling(b: any) {
  return {
    mfId: String(b?.id ?? ''),
    number: String(b?.billing_number ?? ''),
    partnerId: String(b?.partner_id ?? ''),
    partnerName: String(b?.partner_name ?? ''),
    title: String(b?.title ?? ''),
    billingDate: dateOnly(b?.billing_date),
    salesDate: dateOnly(b?.sales_date),
    dueDate: dateOnly(b?.due_date),
    subtotal: b?.subtotal_price == null ? null : money(b?.subtotal_price),
    tax: money(b?.excise_price),
    total: money(b?.total_price),
    paymentStatus: String(b?.payment_status ?? ''),
    emailStatus: String(b?.email_status ?? ''),
    postingStatus: String(b?.posting_status ?? ''),
    isLocked: !!b?.is_locked,
    isDownloaded: !!b?.is_downloaded,
    mfStatus: String(b?.status ?? (b?.is_locked ? 'ロック中' : '')),
    updatedAt: String(b?.updated_at ?? ''),
  }
}

/** 公式の API共通仕様のエラー形 { errors:[{code,message}] } を読む（旧い形も一応見る） */
export function mfErrorText(j: any): string {
  const e = Array.isArray(j?.errors) ? j.errors : null
  if (e && e.length) return e.map((x: any) => [x?.code, x?.message].filter(Boolean).join(': ')).join(' / ')
  return String(j?.message || j?.error_description || j?.error || '')
}
export function mfHttpMessage(status: number, j: any, what: string) {
  const detail = mfErrorText(j)
  if (status === 401) return `Money Forward の接続が切れています（HTTP 401）。設定 › API・AI連携 で もう一度「接続する」を押してください。${detail ? ' ' + detail : ''}`
  if (status === 403) return `Money Forward がこの操作を許していません（HTTP 403）。アプリのスコープ（mfc/invoice/data.read）と 事業者の権限をご確認ください。${detail ? ' ' + detail : ''}`
  if (status === 429) return `Money Forward のレート制限に当たりました（HTTP 429）。少し待ってからもう一度お試しください。${detail ? ' ' + detail : ''}`
  return `Money Forward から${what}を取得できませんでした（HTTP ${status}${detail ? ' ' + detail : ''}）`
}
/** 次のページがあるか。total_pages / next_page / next_cursor のどれでも分かるようにする。 */
export function mfHasNextPage(j: any, page: number) {
  const p = j?.pagination || {}
  if (p.next_page != null) return !!p.next_page
  if (p.next_cursor != null) return !!p.next_cursor
  if (p.total_pages != null) return Number(p.current_page || page) < Number(p.total_pages)
  return false
}
async function getJson(url: string, token: string, d: MfDeps, what: string) {
  const r = await d.fetch(url, { headers: { authorization: 'Bearer ' + token, accept: 'application/json' } })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(scrub(mfHttpMessage(r.status, j, what)))
  return j
}

/** 期間内の請求書をすべて（ページをたどって）。既定では 下書き を除く。 */
export async function fetchBillings(from: string, to: string, d: MfDeps, opts: { rangeKey?: string; statuses?: string[] } = {}) {
  const c = mfConfig(d.env)
  const token = await accessToken(d)
  const rangeKey = opts.rangeKey || 'billing_date'
  const statuses = opts.statuses === undefined ? ['ロック中', '未ロック'] : opts.statuses
  const out: any[] = []
  const seen = new Set<string>()
  const pull = async (status?: string) => {
    for (let page = 1; page <= 200; page++) {
      const q = new URLSearchParams({ page: String(page), per_page: '100', range_key: rangeKey, from, to })
      if (status) q.set('status', status)
      const j = await getJson(`${c.apiBase}/billings?${q}`, token, d, '請求書')
      for (const b of (Array.isArray(j.data) ? j.data : [])) {
        const n = normalizeBilling(b)
        if (!n.mfId || seen.has(n.mfId)) continue
        if (status && !n.mfStatus) n.mfStatus = status
        seen.add(n.mfId); out.push(n)
      }
      if (!mfHasNextPage(j, page)) break
    }
  }
  if (!statuses.length) { await pull(); return out }
  try {
    for (const s of statuses) await pull(s)
  } catch (e: any) {
    /* status での絞り込みが効かない版のときは、全部取って 下書き はこちらで落とす（mfsync.isDraft） */
    out.length = 0; seen.clear(); await pull()
  }
  return out
}

/* ---------- MF 会計（入出金明細・試算表）----------
   繋がらない場合は画面の CSV 取り込みで同じことができます。エラーはそのまま画面に出します。 */
export async function fetchConnectedAccounts(d: MfDeps) {
  const c = mfConfig(d.env)
  const j = await getJson(`${c.acctBase}/connected_accounts`, await accessToken(d), d, '連携口座')
  const list = Array.isArray(j.data) ? j.data : (Array.isArray(j.connected_accounts) ? j.connected_accounts : [])
  return list.map((a: any) => ({
    id: String(a?.id ?? ''), name: String(a?.name ?? a?.service_name ?? ''),
    subAccounts: (a?.connected_sub_accounts || a?.sub_accounts || []).map((s: any) => ({
      id: String(s?.id ?? ''), name: String(s?.name ?? s?.sub_account_name ?? ''), lastSyncedAt: String(s?.last_synced_at ?? ''),
    })),
  }))
}
export async function fetchTransactions(from: string, to: string, subAccountId: string, d: MfDeps) {
  const c = mfConfig(d.env)
  const token = await accessToken(d)
  const out: any[] = []
  for (let page = 1; page <= 200; page++) {
    const q = new URLSearchParams({ page: String(page), per_page: '100', start_date: from, end_date: to, side: 'INCOME' })
    if (subAccountId) q.set('connected_sub_account_id', subAccountId)
    const j = await getJson(`${c.acctBase}/transactions?${q}`, token, d, '入出金明細')
    const list = Array.isArray(j.data) ? j.data : (Array.isArray(j.transactions) ? j.transactions : [])
    for (const t of list) {
      out.push({
        extId: String(t?.id ?? ''), date: dateOnly(t?.transaction_date ?? t?.recognized_at ?? t?.date),
        amount: money(t?.value ?? t?.amount), payerName: String(t?.content ?? t?.description ?? ''),
        side: String(t?.side ?? 'INCOME'), raw: { id: t?.id, content: t?.content, value: t?.value ?? t?.amount },
      })
    }
    if (!list.length) break
    if (!mfHasNextPage(j, page)) break
  }
  return out.filter(t => t.extId && t.date && t.amount > 0)
}
export async function fetchTrialBalance(month: string, d: MfDeps, kind: 'pl' | 'bs' = 'bs') {
  const c = mfConfig(d.env)
  const q = new URLSearchParams({ from: month + '-01', to: month + '-31' })
  const j = await getJson(`${c.acctBase}/reports/trial_balance_${kind}?${q}`, await accessToken(d), d, '試算表')
  const list = Array.isArray(j.data) ? j.data : (Array.isArray(j.items) ? j.items : [])
  return list.map((r: any) => ({
    code: String(r?.account_code ?? r?.code ?? ''), name: String(r?.account_name ?? r?.name ?? ''),
    amount: money(r?.closing_balance ?? r?.balance ?? r?.amount ?? r?.total),
  })).filter((r: any) => r.name)
}

/* ---------- 画面・cron から呼ぶ口 ---------- */
type RouterDeps = MfDeps & {
  verify: (req: any, res: any) => Promise<{ email: string; role: string } | null>
  audit?: (email: string, action: string, detail: any) => Promise<void> | void
  /** 取り込みの本体（index.ts が state を触る部分を渡す） */
  sync?: (kind: string, args: any, me: { email: string; role: string }) => Promise<any>
}

const isDate = (s: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))
const isMonth = (s: any) => /^\d{4}-\d{2}$/.test(String(s || ''))

export function mfRouter(d: RouterDeps) {
  const r = express.Router()
  const managers = (role: string) => role === 'Admin' || role === 'Manager'
  const needMgr = async (req: any, res: any) => {
    const me = await d.verify(req, res); if (!me) return null
    if (!managers(me.role)) { res.status(403).json({ error: 'admin-or-manager', message: '取り込めるのは 管理者・マネージャー だけです。' }); return null }
    return me
  }

  r.get('/mf/status', async (req, res) => {
    const me = await d.verify(req, res); if (!me) return
    const c = mfConfig(d.env)
    const k = await mfCreds(d)
    const raw = await d.cfgGet('mf_token').catch(() => null)
    const tok = raw ? JSON.parse(raw) : null
    const last = JSON.parse((await d.cfgGet('mf_last').catch(() => null)) || '{}')
    res.json({
      configured: !!(k.clientId && k.clientSecret), credSource: k.source, clientIdPeek: peek4(k.clientId),
      clientSecretLen: k.clientSecret.length, tokenAuth: k.tokenAuth,
      connected: !!(tok && tok.access_token),
      connectedBy: tok?.connected_by || '', connectedAt: tok?.connected_at || '', scopes: tok?.scope || c.scope,
      accounting: c.accounting, redirectUri: c.redirectUri,
      bankAccountId: (await d.cfgGet('mf_bank_account').catch(() => null)) || '',
      lastSyncAt: last.at || '', lastResult: last.result || '', lastError: last.error || '', lastStats: last.stats || null,
      connectLast: JSON.parse((await d.cfgGet('mf_connect_last').catch(() => null)) || 'null'),
      schedule: await mfSchedule(d),
    })
  })

  /* 接続の開始（管理者）。画面は返ってきた url を開く */
  r.post('/mf/connect', async (req, res) => {
    const me = await d.verify(req, res); if (!me) return
    if (me.role !== 'Admin') return res.status(403).json({ error: 'admin-only', message: '接続できるのは管理者だけです。' })
    const k = await mfCreds(d)
    if (!k.clientId || !k.clientSecret) return res.status(503).json({ error: 'not-configured', message: 'Money Forward の鍵（ClientID / ClientSecret）がまだ入っていません。「鍵を入れる」から貼り付けてください。' })
    const state = crypto.randomBytes(24).toString('hex')
    await d.cfgSet('mf_oauth_state', JSON.stringify({ state, by: me.email, exp: (d.now || Date.now)() + 10 * 60_000 }))
    res.json({ url: authorizeUrl(state, d.env, k.clientId) })
  })

  /* MF から戻ってくる所。ログインの代わりに state（10分・1回きり）で本人確認する */
  r.get('/mf/callback', async (req, res) => {
    const c = mfConfig(d.env)
    /* ★ 2026-09-18: 失敗しても理由がどこにも残らず調べられなかったので、最後の戻りを残す。
       残すのは 時刻・成否・消毒済みの理由 だけ（code も token も残さない）。 */
    const trace = async (ok: boolean, why: string, by = '') => {
      try { await d.cfgSet('mf_connect_last', JSON.stringify({ at: new Date((d.now || Date.now)()).toISOString(), ok, why: scrub(why), by })) } catch { /* 記録できなくても接続は妨げない */ }
    }
    const back = (k: string, msg = '') => res.redirect(302, `${c.appUrl}/?mf=${k}${msg ? '&msg=' + encodeURIComponent(msg) : ''}#arbook`)
    try {
      const raw = await d.cfgGet('mf_oauth_state')
      const st = raw ? JSON.parse(raw) : null
      await d.cfgSet('mf_oauth_state', '')
      if (req.query.error) { const e = String(req.query.error) + (req.query.error_description ? '：' + String(req.query.error_description) : '')
        await trace(false, 'Money Forward が断りました（' + e + '）', st?.by || ''); return back('error', e) }
      if (!st || !req.query.state || String(req.query.state) !== st.state || (d.now || Date.now)() > Number(st.exp)) {
        const why = !st ? '接続の手続きが始まっていません（「接続する」を押す前に戻ってきました）'
          : (d.now || Date.now)() > Number(st.exp) ? '接続の手続きが古くなっています（10分を過ぎました）'
          : '接続の手続きが合いません（別の手続きが割り込んだか、URL を2回開きました）'
        await trace(false, why, st?.by || '')
        return back('error', why + '。もう一度お試しください。')
      }
      await exchangeCode(String(req.query.code || ''), st.by, d)
      await d.audit?.(st.by, 'mf-connect', {})
      await trace(true, '接続しました', st.by)
      return back('connected')
    } catch (e: any) { const m = scrub(e?.message || e); await trace(false, m); return back('error', m) }
  })

  /* 自動同期の予定を変える（管理者だけ） */
  r.post('/mf/schedule', async (req, res) => {
    const me = await d.verify(req, res); if (!me) return
    if (me.role !== 'Admin') return res.status(403).json({ error: 'admin-only', message: '自動同期を変えられるのは管理者だけです。' })
    const h = Number(req.body?.hour)
    if (!Number.isInteger(h) || h < 0 || h > 23) return res.status(400).json({ error: 'bad-hour', message: '時刻は 0〜23 で指定してください。' })
    const next: MfSchedule = { enabled: req.body?.enabled !== false, hour: h }
    await d.cfgSet('mf_schedule', JSON.stringify(next))
    await d.audit?.(me.email, 'mf-schedule', next)
    res.json({ ok: true, schedule: next })
  })

  r.post('/mf/disconnect', async (req, res) => {
    const me = await d.verify(req, res); if (!me) return
    if (me.role !== 'Admin') return res.status(403).json({ error: 'admin-only' })
    await d.cfgSet('mf_token', '')
    await d.audit?.(me.email, 'mf-disconnect', {})
    res.json({ ok: true })
  })

  /* --- 鍵の入れ替え（管理者だけ・中身は返さない） --- */
  r.post('/mf/credentials', async (req, res) => {
    const me = await d.verify(req, res); if (!me) return
    if (me.role !== 'Admin') return res.status(403).json({ error: 'admin-only', message: '鍵を入れられるのは管理者だけです。' })
    if (mfConfigured(d.env)) return res.status(409).json({ error: 'env-wins',
      message: 'サーバーの .env に鍵が入っているため、画面からは変えられません（.env が優先です）。' })
    try {
      const out = await saveMfCreds(d, req.body?.clientId, req.body?.clientSecret, req.body?.tokenAuth)
      await d.audit?.(me.email, 'mf-credentials-set', { clientId: peek4(String(req.body?.clientId || '')), tokenAuth: req.body?.tokenAuth || 'basic', reconnect: out.changedApp })
      res.json({ ok: true, ...out })
    } catch (e: any) { res.status(400).json({ error: 'bad-credentials', message: scrub(e?.message || e) }) }
  })
  r.delete('/mf/credentials', async (req, res) => {
    const me = await d.verify(req, res); if (!me) return
    if (me.role !== 'Admin') return res.status(403).json({ error: 'admin-only' })
    await d.cfgSet('mf_client', ''); await d.cfgSet('mf_token', '')
    await d.audit?.(me.email, 'mf-credentials-cleared', {})
    res.json({ ok: true })
  })

  /* --- 請求書: 取得（読むだけ） --- */
  r.post('/mf/billings', async (req, res) => {
    const me = await needMgr(req, res); if (!me) return
    const from = String(req.body?.from || ''), to = String(req.body?.to || '')
    if (!isDate(from) || !isDate(to) || from > to) return res.status(400).json({ error: 'bad-range', message: '期間（from / to）を YYYY-MM-DD で指定してください。' })
    try {
      const items = await fetchBillings(from, to, d)
      await d.audit?.(me.email, 'mf-fetch', { from, to, count: items.length })
      res.json({ items, count: items.length })
    } catch (e: any) { res.status(502).json({ error: 'mf-failed', message: scrub(e?.message || e) }) }
  })

  /* --- 取り込み（計画を見る dryRun / 実行）。中身は index.ts の sync() --- */
  const syncRoute = (path: string, kind: string, check?: (b: any) => string) => {
    r.post(path, async (req, res) => {
      const me = await needMgr(req, res); if (!me) return
      if (!d.sync) return res.status(503).json({ error: 'not-available' })
      const bad = check ? check(req.body || {}) : ''
      if (bad) return res.status(400).json({ error: 'bad-request', message: bad })
      try { res.json(await d.sync(kind, req.body || {}, me)) }
      catch (e: any) { res.status(502).json({ error: 'sync-failed', message: scrub(e?.message || e) }) }
    })
  }
  syncRoute('/mf/sync/billings', 'billings', b => (b.csv || (isDate(b.from) && isDate(b.to))) ? '' : '期間（from / to）か CSV が要ります。')
  syncRoute('/mf/sync/transactions', 'transactions', b => (b.csv || (isDate(b.from) && isDate(b.to))) ? '' : '期間（from / to）か CSV が要ります。')
  syncRoute('/mf/sync/trial-balance', 'trial-balance', b => (isMonth(b.month)) ? '' : '対象月（YYYY-MM）が要ります。')
  syncRoute('/mf/reconcile', 'reconcile')
  syncRoute('/mf/sync/run', 'run')

  /* --- 会計: 連携口座の一覧と、使う口座の記憶 --- */
  r.get('/mf/accounting/accounts', async (req, res) => {
    const me = await needMgr(req, res); if (!me) return
    try { res.json({ items: await fetchConnectedAccounts(d), selected: (await d.cfgGet('mf_bank_account')) || '' }) }
    catch (e: any) { res.status(502).json({ error: 'mf-failed', message: scrub(e?.message || e) }) }
  })
  r.post('/mf/accounting/account', async (req, res) => {
    const me = await needMgr(req, res); if (!me) return
    await d.cfgSet('mf_bank_account', String(req.body?.id || ''))
    await d.audit?.(me.email, 'mf-bank-account', { id: req.body?.id || '' })
    res.json({ ok: true })
  })
  return r
}
