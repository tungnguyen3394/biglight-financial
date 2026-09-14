/* ============================================================================
   Money Forward クラウド請求書 API v3 — 請求書を「読むだけ」の口
   ----------------------------------------------------------------------------
   ★ 2026-09-14 利用者の指示: 請求書の作成・明細・税・PDF・送付は Money Forward が持つ。
     このシステムは 取引先ごとの 請求額・入金額・残高 を月で見るだけ。
     → ここは MF から請求書の一覧を取ってきて、形をそろえて画面に返すだけ。
       データベースには書きません。取り込むかどうかは画面で人が確かめてから、
       いつもの保存（/state-delta・監査ログ・権限チェック）を通して書きます。
   ★ 既定は停止。MF_CLIENT_ID / MF_CLIENT_SECRET を .env に入れたときだけ動きます。
   ★ 仕様（MF 公開の OpenAPI v3.6.0 に合わせています）:
       認可   https://api.biz.moneyforward.com/authorize
       トークン https://api.biz.moneyforward.com/token（refresh も同じ）
       スコープ mfc/invoice/data.read（読み取りだけ。書き込み権限はもらわない）
       一覧   GET /api/v3/billings?page&per_page(≤100)&range_key&from&to
              → { data: Billing[], pagination: { total_pages, current_page, … } }
       Billing: id, billing_number, partner_id, partner_name, title,
                billing_date, sales_date, due_date,
                subtotal_price, excise_price, total_price（金額は文字列）, updated_at
   ========================================================================== */
import express from 'express'
import crypto from 'crypto'

export const MF_AUTHORIZE_URL = 'https://api.biz.moneyforward.com/authorize'
export const MF_TOKEN_URL = 'https://api.biz.moneyforward.com/token'
export const MF_SCOPE = 'mfc/invoice/data.read'

export type MfDeps = {
  fetch: typeof fetch
  cfgGet: (k: string) => Promise<string | null>
  cfgSet: (k: string, v: string) => Promise<void>
  env?: Record<string, string | undefined>
  now?: () => number
}

export function mfConfig(env: Record<string, string | undefined> = process.env) {
  const publicUrl = String(env.MF_PUBLIC_URL || env.PUBLIC_URL || 'https://finance.biglight.jp').replace(/\/$/, '')
  return {
    clientId: String(env.MF_CLIENT_ID || ''),
    clientSecret: String(env.MF_CLIENT_SECRET || ''),
    redirectUri: String(env.MF_REDIRECT_URI || publicUrl + '/api/mf/callback'),
    apiBase: String(env.MF_INVOICE_API_BASE || 'https://invoice.moneyforward.com/api/v3').replace(/\/$/, ''),
    /* アプリ登録時に選んだクライアント認証方式。basic（既定）か post */
    tokenAuth: String(env.MF_TOKEN_AUTH || 'basic').toLowerCase() === 'post' ? 'post' : 'basic',
    appUrl: publicUrl,
  }
}
export const mfConfigured = (env: Record<string, string | undefined> = process.env) => {
  const c = mfConfig(env); return !!(c.clientId && c.clientSecret)
}

export function authorizeUrl(state: string, env?: Record<string, string | undefined>) {
  const c = mfConfig(env)
  const q = new URLSearchParams({ response_type: 'code', client_id: c.clientId, redirect_uri: c.redirectUri, scope: MF_SCOPE, state })
  return MF_AUTHORIZE_URL + '?' + q.toString()
}

async function tokenRequest(params: Record<string, string>, d: MfDeps) {
  const c = mfConfig(d.env)
  const body = new URLSearchParams(params)
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }
  if (c.tokenAuth === 'basic') headers.authorization = 'Basic ' + Buffer.from(c.clientId + ':' + c.clientSecret).toString('base64')
  else { body.set('client_id', c.clientId); body.set('client_secret', c.clientSecret) }
  const r = await d.fetch(MF_TOKEN_URL, { method: 'POST', headers, body: body.toString() })
  const j: any = await r.json().catch(() => ({}))
  if (!r.ok || !j.access_token) throw new Error(`Money Forward のトークン取得に失敗しました（HTTP ${r.status}${j.error ? ' ' + j.error : ''}）`)
  const now = (d.now || Date.now)()
  return {
    access_token: String(j.access_token),
    refresh_token: String(j.refresh_token || params.refresh_token || ''),
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
    subtotal: money(b?.subtotal_price),
    tax: money(b?.excise_price),
    total: money(b?.total_price),
    updatedAt: String(b?.updated_at ?? ''),
  }
}

/** 期間内の請求書をすべて（ページをたどって）取る */
export async function fetchBillings(from: string, to: string, d: MfDeps, rangeKey = 'billing_date') {
  const c = mfConfig(d.env)
  const token = await accessToken(d)
  const out: any[] = []
  for (let page = 1; page <= 200; page++) {
    const q = new URLSearchParams({ page: String(page), per_page: '100', range_key: rangeKey, from, to })
    const r = await d.fetch(`${c.apiBase}/billings?${q}`, { headers: { authorization: 'Bearer ' + token, accept: 'application/json' } })
    const j: any = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(`Money Forward から請求書を取得できませんでした（HTTP ${r.status}）`)
    for (const b of (Array.isArray(j.data) ? j.data : [])) out.push(normalizeBilling(b))
    const p = j.pagination || {}
    if (!p.total_pages || Number(p.current_page || page) >= Number(p.total_pages)) break
  }
  return out
}

type RouterDeps = MfDeps & {
  verify: (req: any, res: any) => Promise<{ email: string; role: string } | null>
  audit?: (email: string, action: string, detail: any) => Promise<void> | void
}

const isDate = (s: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))

export function mfRouter(d: RouterDeps) {
  const r = express.Router()
  const managers = (role: string) => role === 'Admin' || role === 'Manager'

  r.get('/mf/status', async (req, res) => {
    const me = await d.verify(req, res); if (!me) return
    const c = mfConfig(d.env)
    const raw = await d.cfgGet('mf_token').catch(() => null)
    const tok = raw ? JSON.parse(raw) : null
    res.json({ configured: mfConfigured(d.env), connected: !!(tok && tok.access_token),
      connectedBy: tok?.connected_by || '', connectedAt: tok?.connected_at || '', redirectUri: c.redirectUri })
  })

  /* 接続の開始（管理者）。画面は返ってきた url を開く */
  r.post('/mf/connect', async (req, res) => {
    const me = await d.verify(req, res); if (!me) return
    if (me.role !== 'Admin') return res.status(403).json({ error: 'admin-only', message: '接続できるのは管理者だけです。' })
    if (!mfConfigured(d.env)) return res.status(503).json({ error: 'not-configured', message: 'MF_CLIENT_ID / MF_CLIENT_SECRET が設定されていません。' })
    const state = crypto.randomBytes(24).toString('hex')
    await d.cfgSet('mf_oauth_state', JSON.stringify({ state, by: me.email, exp: (d.now || Date.now)() + 10 * 60_000 }))
    res.json({ url: authorizeUrl(state, d.env) })
  })

  /* MF から戻ってくる所。ログインの代わりに state（10分・1回きり）で本人確認する */
  r.get('/mf/callback', async (req, res) => {
    const c = mfConfig(d.env)
    const back = (k: string, msg = '') => res.redirect(302, `${c.appUrl}/?mf=${k}${msg ? '&msg=' + encodeURIComponent(msg) : ''}#arbook`)
    try {
      const raw = await d.cfgGet('mf_oauth_state')
      const st = raw ? JSON.parse(raw) : null
      await d.cfgSet('mf_oauth_state', '')
      if (!st || !req.query.state || String(req.query.state) !== st.state || (d.now || Date.now)() > Number(st.exp)) return back('error', '接続の手続きが古いか、正しくありません。もう一度お試しください。')
      if (req.query.error) return back('error', String(req.query.error))
      await exchangeCode(String(req.query.code || ''), st.by, d)
      await d.audit?.(st.by, 'mf-connect', {})
      return back('connected')
    } catch (e: any) { return back('error', String(e?.message || e)) }
  })

  r.post('/mf/disconnect', async (req, res) => {
    const me = await d.verify(req, res); if (!me) return
    if (me.role !== 'Admin') return res.status(403).json({ error: 'admin-only' })
    await d.cfgSet('mf_token', '')
    await d.audit?.(me.email, 'mf-disconnect', {})
    res.json({ ok: true })
  })

  /* 請求書の一覧（読むだけ・書き込まない） */
  r.post('/mf/billings', async (req, res) => {
    const me = await d.verify(req, res); if (!me) return
    if (!managers(me.role)) return res.status(403).json({ error: 'admin-or-manager', message: '取り込めるのは 管理者・マネージャー だけです。' })
    const from = String(req.body?.from || ''), to = String(req.body?.to || '')
    if (!isDate(from) || !isDate(to) || from > to) return res.status(400).json({ error: 'bad-range', message: '期間（from / to）を YYYY-MM-DD で指定してください。' })
    try {
      const items = await fetchBillings(from, to, d)
      await d.audit?.(me.email, 'mf-fetch', { from, to, count: items.length })
      res.json({ items, count: items.length })
    } catch (e: any) {
      res.status(502).json({ error: 'mf-failed', message: String(e?.message || e) })
    }
  })
  return r
}
