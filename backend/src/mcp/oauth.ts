/* ============================================================================
   MCP — OAuth 2.1 認可サーバー（ChatGPT ⇄ MCP サーバーの間の認証）  公式 §17.5
   ----------------------------------------------------------------------------
   なぜ要るのか:
     ChatGPT の Custom MCP は「OAuth」か「認証なし」しか選べない。APIキー（bl_live_…）
     を AI にそのまま渡す道は無いし、渡したくもない。そこで小さな認可サーバーが間に立つ:

       AI  ──authorize──▶ 職員が APIキー を貼る画面 ──▶ code ──▶ token
       AI  ──Bearer token──▶ /mcp ──▶ 連携（api_integrations）→ スコープ

     ・APIキーは「認可画面に貼る」ときに1回だけ通る。トークンにも DB にも残らない。
     ・トークンは HMAC 署名の自己完結型（表を足さない）。中身は 連携ID・aud・期限だけ。
       スコープはリクエストのたびに DB から読む ＝ 画面で鍵を失効／範囲変更すれば即座に効く。
     ・PKCE S256 必須。クライアントは公開クライアント（secret 無し。AI へ secret を
       安全に配る経路が無いため）。守りは PKCE ＋ redirect_uri の許可リスト ＋ 貼る APIキー。
     ・動的クライアント登録（DCR）は「署名付き client_id」で状態を持たない。
     ・認可コードだけメモリ（5分・1回きり）。api コンテナは1つの前提。
   秘密は環境変数 MCP_TOKEN_SECRET だけ。ソースには何も書かない。
   ============================================================================ */
import crypto from 'crypto'
import type { Pool } from 'pg'
import { resolveApiKey, getIntegrationById, rateHit, KEY_PREFIX, Integration, SCOPES } from '../apiv1/keys'

export interface McpConfig {
  publicUrl: string            // 例 https://finance.biglight.jp/mcp（= resource / issuer）
  origin: string               // 例 https://finance.biglight.jp
  basePath: string             // 例 /mcp
  secret: string               // MCP_TOKEN_SECRET
  clientId: string             // 静的クライアント（既定 'chatgpt'）
  redirectUris: string[]
  redirectPrefixes: string[]
  allowDcr: boolean
  accessTtl: number            // 秒
  refreshTtl: number           // 秒
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): McpConfig | null {
  if (String(env.MCP_ENABLED || 'false').toLowerCase() !== 'true') return null
  const publicUrl = String(env.MCP_PUBLIC_URL || 'https://finance.biglight.jp/mcp').replace(/\/+$/, '')
  let u: URL
  try { u = new URL(publicUrl) } catch { return null }
  const secret = String(env.MCP_TOKEN_SECRET || '')
  if (secret.length < 32) return null   // 短い秘密では動かさない（呼び出し側がログに出す）
  const list = (v: any, dflt: string[]) => { const a = String(v || '').split(',').map(s => s.trim()).filter(Boolean); return a.length ? a : dflt }
  return {
    publicUrl, origin: u.origin, basePath: u.pathname.replace(/\/+$/, '') || '/mcp', secret,
    clientId: String(env.MCP_OAUTH_CLIENT_ID || 'chatgpt').trim() || 'chatgpt',
    redirectUris: list(env.MCP_OAUTH_REDIRECT_URIS, ['https://chatgpt.com/connector_platform_oauth_redirect']),
    redirectPrefixes: list(env.MCP_OAUTH_REDIRECT_PREFIXES, ['https://chatgpt.com/connector/oauth/']),
    allowDcr: String(env.MCP_OAUTH_ALLOW_DCR || 'true').toLowerCase() !== 'false',
    accessTtl: Math.max(300, Math.min(86400, Number(env.MCP_ACCESS_TOKEN_TTL) || 3600)),
    refreshTtl: Math.max(3600, Math.min(90 * 86400, Number(env.MCP_REFRESH_TOKEN_TTL) || 30 * 86400)),
  }
}

/* ───────── 署名付きの小さな封筒（トークン・DCR の client_id） ───────── */
const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64u = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
function sign(secret: string, kind: string, payload: any): string {
  const body = b64u(JSON.stringify(payload))
  const mac = b64u(crypto.createHmac('sha256', secret).update(kind + '.' + body).digest())
  return kind + '_' + body + '.' + mac
}
function open(secret: string, kind: string, token: string): any | null {
  const t = String(token || '')
  if (!t.startsWith(kind + '_')) return null
  const rest = t.slice(kind.length + 1)
  const dot = rest.lastIndexOf('.')
  if (dot <= 0) return null
  const body = rest.slice(0, dot), mac = rest.slice(dot + 1)
  const want = b64u(crypto.createHmac('sha256', secret).update(kind + '.' + body).digest())
  const a = Buffer.from(mac), b = Buffer.from(want)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try { return JSON.parse(unb64u(body).toString('utf8')) } catch { return null }
}
const nowSec = () => Math.floor(Date.now() / 1000)

/* ───────── クライアント ───────── */
interface Client { id: string; name: string; redirectUris: string[]; dcr: boolean }
export function resolveClient(cfg: McpConfig, clientId: string): Client | null {
  const id = String(clientId || '').trim()
  if (!id) return null
  if (id === cfg.clientId) return { id, name: 'AIクライアント（静的）', redirectUris: cfg.redirectUris, dcr: false }
  if (!cfg.allowDcr) return null
  const p = open(cfg.secret, 'mcpc', id)
  if (!p || !Array.isArray(p.r) || !p.r.length) return null
  return { id, name: String(p.n || 'DCR client').slice(0, 80), redirectUris: p.r.map(String), dcr: true }
}
/** redirect_uri の可否。静的: 完全一致 か 前方一致リスト。DCR: 登録した完全一致のみ。 */
export function redirectAllowed(cfg: McpConfig, c: Client, uri: string): boolean {
  const u = String(uri || '')
  if (!/^https:\/\//.test(u)) return false
  if (c.redirectUris.includes(u)) return true
  if (!c.dcr && cfg.redirectPrefixes.some(p => u.startsWith(p))) return true
  return false
}
const DCR_HOSTS = ['chatgpt.com', 'openai.com']
const hostOk = (uri: string) => { try { const h = new URL(uri).hostname; return DCR_HOSTS.some(d => h === d || h.endsWith('.' + d)) } catch { return false } }
export function registerClient(cfg: McpConfig, body: any): { status: number; body: any } {
  if (!cfg.allowDcr) return { status: 403, body: { error: 'invalid_client_metadata', error_description: 'dynamic registration is disabled' } }
  const uris: string[] = Array.isArray(body && body.redirect_uris) ? body.redirect_uris.map((x: any) => String(x)).slice(0, 5) : []
  if (!uris.length) return { status: 400, body: { error: 'invalid_redirect_uri', error_description: 'redirect_uris required' } }
  for (const u of uris) if (!/^https:\/\//.test(u) || !hostOk(u)) return { status: 400, body: { error: 'invalid_redirect_uri', error_description: 'redirect_uri must be https and under chatgpt.com / openai.com' } }
  const auth = String((body && body.token_endpoint_auth_method) || 'none')
  if (auth !== 'none') return { status: 400, body: { error: 'invalid_client_metadata', error_description: 'only token_endpoint_auth_method=none is supported' } }
  const name = String((body && body.client_name) || 'AIクライアント').slice(0, 80)
  const id = sign(cfg.secret, 'mcpc', { n: name, r: uris, t: nowSec() })
  return { status: 201, body: { client_id: id, client_name: name, redirect_uris: uris, token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], client_id_issued_at: nowSec() } }
}

/* ───────── メタデータ（RFC 9728 / RFC 8414） ───────── */
export const scopeIds = () => SCOPES.map(s => s.id)
export function protectedResourceMetadata(cfg: McpConfig) {
  return { resource: cfg.publicUrl, authorization_servers: [cfg.publicUrl], scopes_supported: scopeIds(),
    bearer_methods_supported: ['header'], resource_name: 'BIGLIGHT 予実管理システム MCP', resource_documentation: cfg.origin + '/' }
}
export function authorizationServerMetadata(cfg: McpConfig) {
  const b = cfg.publicUrl
  const m: any = {
    issuer: b, authorization_endpoint: b + '/oauth/authorize', token_endpoint: b + '/oauth/token',
    response_types_supported: ['code'], response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: scopeIds(),
    authorization_response_iss_parameter_supported: true,
    client_id_metadata_document_supported: false,
    service_documentation: cfg.origin + '/',
  }
  if (cfg.allowDcr) m.registration_endpoint = b + '/oauth/register'
  return m
}
export const resourceMetadataUrl = (cfg: McpConfig) => cfg.origin + '/.well-known/oauth-protected-resource' + cfg.basePath

/* ───────── 鍵の間違い（IPごと・10分の窓・メモリ） ───────── */
const _keyFails = new Map<string, { n: number; t: number }>()
function keyFailCount(ip: string): number {
  const e = _keyFails.get(ip)
  if (!e || Date.now() - e.t > 10 * 60_000) return 0
  return e.n
}
function keyFailHit(ip: string) {
  const e = _keyFails.get(ip)
  if (!e || Date.now() - e.t > 10 * 60_000) _keyFails.set(ip, { n: 1, t: Date.now() })
  else e.n++
}

/* ───────── 認可コード（メモリ・5分・1回きり） ───────── */
interface Code { cid: string; redirect: string; challenge: string; iid: string; scopes: string[]; resource: string; exp: number }
const _codes = new Map<string, Code>()
function pruneCodes() { const t = Date.now(); for (const [k, v] of _codes) if (v.exp < t) _codes.delete(k) }

const RESERVED = /^[\x20-\x7e]{1,2048}$/
const cleanParam = (v: any, max = 2048) => { const s = String(v == null ? '' : v); return RESERVED.test(s) && s.length <= max ? s : '' }
const esc = (s: any) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c])

export interface AuthorizeParams { response_type: string; client_id: string; redirect_uri: string; code_challenge: string; code_challenge_method: string; state: string; scope: string; resource: string }
export function readAuthorizeParams(src: any): AuthorizeParams {
  const g = (k: string, max?: number) => cleanParam(src && src[k], max)
  return { response_type: g('response_type', 20), client_id: g('client_id'), redirect_uri: g('redirect_uri'), code_challenge: g('code_challenge', 128),
    code_challenge_method: g('code_challenge_method', 10), state: g('state', 1024), scope: g('scope', 1024), resource: g('resource') }
}
/** 入口の検証。redirect できない種類の誤り（client/redirect_uri）は画面に出し、それ以外は redirect で返す。 */
/* 戻り値は union ではなく「省略できる項目つきの1つの形」。tsconfig が strict:false なので
   union を ok で絞り込めない（narrowing が効かない）ため。 */
export interface AuthorizeCheck { ok: boolean; client?: Client; fatal?: boolean; error?: string; description?: string }
export function validateAuthorize(cfg: McpConfig, p: AuthorizeParams): AuthorizeCheck {
  const client = resolveClient(cfg, p.client_id)
  if (!client) return { ok: false, fatal: true, error: 'invalid_client', description: 'client_id が登録されていません' }
  if (!redirectAllowed(cfg, client, p.redirect_uri)) return { ok: false, fatal: true, error: 'invalid_request', description: 'redirect_uri が許可リストにありません' }
  if (p.response_type !== 'code') return { ok: false, fatal: false, error: 'unsupported_response_type', description: 'response_type=code only' }
  if (!p.code_challenge || p.code_challenge_method !== 'S256' || !/^[A-Za-z0-9\-._~]{43,128}$/.test(p.code_challenge)) return { ok: false, fatal: false, error: 'invalid_request', description: 'PKCE (S256) が必要です' }
  if (p.resource && p.resource.replace(/\/+$/, '') !== cfg.publicUrl) return { ok: false, fatal: false, error: 'invalid_target', description: 'resource が一致しません' }
  return { ok: true, client }
}
export function redirectWith(cfg: McpConfig, redirect: string, q: Record<string, string>): string {
  const u = new URL(redirect)
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') u.searchParams.set(k, v)
  u.searchParams.set('iss', cfg.publicUrl)
  return u.toString()
}

/** 認可画面（職員が APIキーを貼る）。秘密は何も埋め込まない。 */
export function authorizePage(cfg: McpConfig, p: AuthorizeParams, client: Client, err?: string): string {
  const hidden = ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource']
    .map(k => `<input type="hidden" name="${k}" value="${esc((p as any)[k])}">`).join('')
  const want = p.scope ? p.scope.split(/\s+/).filter(Boolean) : []
  const scopeRows = (want.length ? SCOPES.filter(s => want.includes(s.id)) : SCOPES.filter(s => !s.danger)).map(s => `<li><code>${esc(s.id)}</code> — ${esc(s.label)}</li>`).join('')
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>BIGLIGHT 予実管理システム — AI連携の許可</title>
<style>body{font-family:system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;background:#f4f6f9;margin:0;color:#1f2937}
.card{max-width:520px;margin:48px auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px 28px 22px;box-shadow:0 2px 10px rgba(0,0,0,.04)}
h1{font-size:18px;margin:0 0 6px}p{font-size:14px;line-height:1.6;margin:8px 0}ul{font-size:13px;padding-left:18px;line-height:1.7}code{background:#f3f4f6;padding:1px 5px;border-radius:4px}
label{display:block;font-size:13px;font-weight:600;margin:16px 0 6px}input[type=password]{width:100%;box-sizing:border-box;font-size:15px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-family:ui-monospace,monospace}
button{margin-top:16px;width:100%;font-size:15px;padding:11px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;font-weight:600;cursor:pointer}
.err{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:8px;padding:10px 12px;font-size:13px;margin-top:12px}
.note{font-size:12px;color:#6b7280;margin-top:14px;line-height:1.6}</style></head><body><div class="card">
<h1>BIGLIGHT 予実管理システム — AI連携の許可</h1>
<p><b>${esc(client.name)}</b> が、このシステムを<b>読み取り専用</b>で使おうとしています。金額を書き換える道はありません。</p>
<p>設定 › API・AI連携 で発行した <b>APIキー</b>を貼り付けてください。鍵はここで1回確認するだけで、AI側には渡りません（AIが受け取るのは期限付きの別トークンです）。</p>
<ul>${scopeRows}</ul>
<form method="post" action="${esc(cfg.basePath)}/oauth/authorize" autocomplete="off">${hidden}
<label for="k">APIキー（${esc(KEY_PREFIX)}…）</label>
<input id="k" type="password" name="api_key" required autofocus placeholder="${esc(KEY_PREFIX)}xxxxxxxx…">
${err ? `<div class="err">${esc(err)}</div>` : ''}
<button type="submit">許可する</button></form>
<div class="note">許可できるのは、その鍵に付いている範囲だけです。鍵を失効すると、この許可も同時に無効になります。</div>
</div></body></html>`
}

/** POST /oauth/authorize — 鍵を確かめ、コードを発行して redirect。 */
export interface GrantResult { ok: boolean; location?: string; integration?: Integration; scopes?: string[]; message?: string; retryable?: boolean }
export async function grantCode(pool: Pool, cfg: McpConfig, p: AuthorizeParams, client: Client, apiKey: string, ip: string): Promise<GrantResult> {
  /* 数えるのは「鍵を間違えた回数」だけ（成功した許可や無効トークンを混ぜると、
     正しく使っているだけで止まる。CRM で実際に起きた）。 */
  if (keyFailCount(ip) >= 10) return { ok: false, message: '鍵の間違いが多すぎます。10分後にやり直してください', retryable: false }
  const integ = await resolveApiKey(pool, String(apiKey || '').trim())
  if (!integ) { keyFailHit(ip); return { ok: false, message: 'APIキーが無効・失効・期限切れです', retryable: true } }
  const want = p.scope ? p.scope.split(/\s+/).filter(Boolean) : []
  /* 求められたスコープは「鍵にある分だけ」渡す。AI は既定で全部を求めてくるので、
     1つでも無ければ拒む作りだと、基本の鍵では必ず止まる。1つも重ならないときだけ拒む。 */
  const granted = want.length ? want.filter(s => integ.scopes.includes(s)) : integ.scopes.slice()
  if (!granted.length) return { ok: false, message: 'この鍵には、求められた範囲が1つもありません（鍵の範囲: ' + integ.scopes.join(', ') + '）', retryable: true }
  pruneCodes()
  const code = 'mcpac_' + crypto.randomBytes(32).toString('hex')
  _codes.set(code, { cid: client.id, redirect: p.redirect_uri, challenge: p.code_challenge, iid: integ.id, scopes: granted, resource: cfg.publicUrl, exp: Date.now() + 5 * 60_000 })
  return { ok: true, location: redirectWith(cfg, p.redirect_uri, { code, state: p.state }), integration: integ, scopes: granted }
}

/* ───────── トークン ───────── */
export interface TokenPayload { iid: string; aud: string; cid: string; sc: string[]; exp: number; jti: string; typ: 'at' | 'rt' }
function issue(cfg: McpConfig, iid: string, cid: string, scopes: string[]) {
  const t = nowSec()
  const at = sign(cfg.secret, 'mcpat', { iid, aud: cfg.publicUrl, cid, sc: scopes, exp: t + cfg.accessTtl, jti: crypto.randomBytes(8).toString('hex'), typ: 'at' })
  const rt = sign(cfg.secret, 'mcprt', { iid, aud: cfg.publicUrl, cid, sc: scopes, exp: t + cfg.refreshTtl, jti: crypto.randomBytes(8).toString('hex'), typ: 'rt' })
  return { access_token: at, token_type: 'Bearer', expires_in: cfg.accessTtl, refresh_token: rt, scope: scopes.join(' ') }
}
const tokenErr = (status: number, error: string, description: string) => ({ status, body: { error, error_description: description } })

export async function tokenEndpoint(pool: Pool, cfg: McpConfig, body: any, ip: string): Promise<{ status: number; body: any; integration?: Integration }> {
  if (rateHit('mcp-token:' + ip, 60, 60_000)) return tokenErr(429, 'slow_down', 'too many requests')
  const b = body || {}
  const grant = String(b.grant_type || '')
  const client = resolveClient(cfg, String(b.client_id || ''))
  if (!client) return tokenErr(401, 'invalid_client', 'unknown client_id')
  if (grant === 'authorization_code') {
    pruneCodes()
    const code = String(b.code || '')
    const c = _codes.get(code)
    if (c) _codes.delete(code)   // 1回きり（失敗しても二度は使えない）
    if (!c || c.exp < Date.now()) return tokenErr(400, 'invalid_grant', 'code is invalid or expired')
    if (c.cid !== client.id) return tokenErr(400, 'invalid_grant', 'code was issued to another client')
    if (String(b.redirect_uri || '') !== c.redirect) return tokenErr(400, 'invalid_grant', 'redirect_uri mismatch')
    const verifier = String(b.code_verifier || '')
    if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return tokenErr(400, 'invalid_grant', 'code_verifier required (PKCE)')
    const calc = b64u(crypto.createHash('sha256').update(verifier).digest())
    const a = Buffer.from(calc), dd = Buffer.from(c.challenge)
    if (a.length !== dd.length || !crypto.timingSafeEqual(a, dd)) return tokenErr(400, 'invalid_grant', 'PKCE verification failed')
    if (b.resource && String(b.resource).replace(/\/+$/, '') !== cfg.publicUrl) return tokenErr(400, 'invalid_target', 'resource mismatch')
    const integ = await getIntegrationById(pool, c.iid)
    if (!integ) return tokenErr(400, 'invalid_grant', 'API key was revoked')
    const scopes = c.scopes.filter(s => integ.scopes.includes(s))
    return { status: 200, body: issue(cfg, integ.id, client.id, scopes), integration: integ }
  }
  if (grant === 'refresh_token') {
    const p = open(cfg.secret, 'mcprt', String(b.refresh_token || '')) as TokenPayload | null
    if (!p || p.typ !== 'rt' || p.aud !== cfg.publicUrl || p.exp < nowSec()) return tokenErr(400, 'invalid_grant', 'refresh_token is invalid or expired')
    if (p.cid !== client.id) return tokenErr(400, 'invalid_grant', 'refresh_token was issued to another client')
    const integ = await getIntegrationById(pool, p.iid)
    if (!integ) return tokenErr(400, 'invalid_grant', 'API key was revoked')
    const want = b.scope ? String(b.scope).split(/\s+/).filter(Boolean) : p.sc
    const scopes = want.filter((s: string) => p.sc.includes(s) && integ.scopes.includes(s))
    return { status: 200, body: issue(cfg, integ.id, client.id, scopes), integration: integ }
  }
  return tokenErr(400, 'unsupported_grant_type', 'authorization_code or refresh_token')
}

/** Bearer → 連携（+ このトークンに許したスコープ ∩ 鍵の今のスコープ）。ダメなら理由。 */
export interface TokenCheck { ok: boolean; integration?: Integration; scopes?: string[]; jti?: string; reason?: string }
export async function verifyAccessToken(pool: Pool, cfg: McpConfig, header: string): Promise<TokenCheck> {
  const m = /^Bearer\s+(.+)$/i.exec(String(header || ''))
  if (!m) return { ok: false, reason: 'missing' }
  const p = open(cfg.secret, 'mcpat', m[1].trim()) as TokenPayload | null
  if (!p || p.typ !== 'at') return { ok: false, reason: 'invalid' }
  if (p.aud !== cfg.publicUrl) return { ok: false, reason: 'audience' }
  if (p.exp < nowSec()) return { ok: false, reason: 'expired' }
  const integ = await getIntegrationById(pool, p.iid)
  if (!integ) return { ok: false, reason: 'revoked' }
  const scopes = (Array.isArray(p.sc) ? p.sc : []).filter(s => integ.scopes.includes(s))
  return { ok: true, integration: integ, scopes, jti: String(p.jti || '') }
}

/** テスト用: メモリの認可コードを捨てる */
export function _resetCodes() { _codes.clear() }
