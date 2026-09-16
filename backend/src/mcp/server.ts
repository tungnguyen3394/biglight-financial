/* ============================================================================
   MCP サーバー — Streamable HTTP（JSON 応答・状態なし）      公式 §17.4
   ----------------------------------------------------------------------------
   道筋:  ChatGPT / AIクライアント → ここ (/mcp) → 予実システムの読み取り関数 → app_state
   ・POST /mcp        JSON-RPC（initialize / ping / tools/list / tools/call）
   ・GET  /mcp        405（サーバーから送る流れは持たない＝SSE を張らない）
   ・DELETE /mcp      405（セッションを持たないので終了もない）
   ・/.well-known/oauth-protected-resource[/mcp] ・/.well-known/oauth-authorization-server[/mcp]
   ・/mcp/oauth/{authorize,token,register}   → oauth.ts
   ・GET /mcp/health  鍵なしの死活確認

   なぜ SSE でなく JSON 応答か: ツールはどれも1秒以内に返る読み取りで、途中経過を
   流す理由が無い。JSON 応答は Streamable HTTP で正式に許され、nginx / Caddy の
   緩衝やタイムアウトの影響も受けない。
   ★ 監査: tools/call は成功も拒否も audit_log（entity='api_v1'）に残す。トークン・鍵は書かない。
   ★ 本体の express.json は 64MB まで受けるが、ここは 64KB を超える本文を捨てる。
   ============================================================================ */
import { Router } from 'express'
import express from 'express'
import crypto from 'crypto'
import type { Pool } from 'pg'
import { rateHit, touchLastUsed, hasScope, Integration } from '../apiv1/keys'
import { McpConfig, protectedResourceMetadata, authorizationServerMetadata, resourceMetadataUrl, readAuthorizeParams, validateAuthorize,
         authorizePage, grantCode, redirectWith, tokenEndpoint, registerClient, verifyAccessToken } from './oauth'
import { TOOLS, toolByName, validateArgs, ToolError } from './tools'

export const SERVER_NAME = 'BIGLIGHT 予実管理システム'
export const SERVER_VERSION = '1.0.0'
export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26']
const MAX_BODY = 64 * 1024
const INSTRUCTIONS = 'BIGLIGHT の予実管理システム（お金の管理）の読み取り専用ツールです。' +
  '会計年度は8月1日〜翌年7月31日（Q1=8〜10月）。予実の金額は税抜・計上月（発生主義）基準で、入金・支払は残高を動かすだけで損益には効きません。' +
  '「未回収はいくら」は list_unpaid_invoices、「いつから回収できていないか」は get_receivables_aging、' +
  '「これから払うお金」は list_unpaid_bills、「予実・利益」は get_yojitsu_summary、「資金繰り」は get_cash_forecast を使ってください。' +
  'それ以外の画面は list_screens → search_records → get_record で読めます。書き込み・削除はできません。'

export type Deps = { pool: Pool; cfg: McpConfig; audit: (actor: string, action: string, id: string, detail: any) => void }

const ipOf = (req: any) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64)
const rpcErr = (id: any, code: number, message: string, data?: any) => ({ jsonrpc: '2.0', id: id === undefined ? null : id, error: Object.assign({ code, message }, data !== undefined ? { data } : {}) })
const rpcOk = (id: any, result: any) => ({ jsonrpc: '2.0', id, result })

export function mcpRouter(d: Deps): Router {
  const r = Router()
  const { pool, cfg } = d
  const base = cfg.basePath
  const actorOf = (i: Integration) => 'mcp:' + i.name

  r.use([base, '/.well-known/oauth-protected-resource', '/.well-known/oauth-authorization-server'], (_req: any, res: any, next: any) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    next()
  })

  /* ── メタデータ（公開・秘密なし） ── */
  const prm = (_req: any, res: any) => res.json(protectedResourceMetadata(cfg))
  const asm = (_req: any, res: any) => res.json(authorizationServerMetadata(cfg))
  r.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource' + base, base + '/.well-known/oauth-protected-resource'], prm)
  r.get(['/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server' + base, base + '/.well-known/oauth-authorization-server'], asm)
  r.get(base + '/health', (_req: any, res: any) => res.json({ status: 'ok', service: SERVER_NAME + ' MCP', protocol_versions: PROTOCOL_VERSIONS }))

  /* ── OAuth ── */
  const form = express.urlencoded({ extended: false, limit: '16kb' })
  r.get(base + '/oauth/authorize', (req: any, res: any) => {
    if (rateHit('mcp-authz:' + ipOf(req), 60, 10 * 60_000)) return res.status(429).type('text/plain').send('too many requests')
    const p = readAuthorizeParams(req.query)
    const v = validateAuthorize(cfg, p)
    if (!v.ok) {
      if (v.fatal) return res.status(400).type('html').send(errPage(v.description))
      return res.redirect(302, redirectWith(cfg, p.redirect_uri, { error: v.error, error_description: v.description, state: p.state }))
    }
    res.type('html').send(authorizePage(cfg, p, v.client))
  })
  r.post(base + '/oauth/authorize', form, async (req: any, res: any) => {
    const p = readAuthorizeParams(req.body)
    const v = validateAuthorize(cfg, p)
    if (!v.ok) {
      if (v.fatal) return res.status(400).type('html').send(errPage(v.description))
      return res.redirect(302, redirectWith(cfg, p.redirect_uri, { error: v.error, error_description: v.description, state: p.state }))
    }
    const ip = ipOf(req)
    const g = await grantCode(pool, cfg, p, v.client, req.body && req.body.api_key, ip)
    if (!g.ok) {
      d.audit('mcp:unknown', 'mcp-authorize-denied', '-', { ip, client: v.client.id.slice(0, 40), reason: g.message, result: 'denied' })
      return res.status(g.retryable ? 401 : 429).type('html').send(authorizePage(cfg, p, v.client, g.message))
    }
    d.audit(actorOf(g.integration), 'mcp-authorized', g.integration.id, { ip, client: v.client.id.slice(0, 40), client_name: v.client.name, scopes: g.scopes, result: 'granted' })
    res.redirect(302, g.location)
  })
  r.post(base + '/oauth/token', form, async (req: any, res: any) => {
    const body = (req.body && typeof req.body === 'object' && Object.keys(req.body).length) ? req.body : {}
    const out = await tokenEndpoint(pool, cfg, body, ipOf(req))
    if (out.status === 200 && out.integration) {
      touchLastUsed(pool, out.integration.id)
      d.audit(actorOf(out.integration), 'mcp-token-issued', out.integration.id, { grant: String(body.grant_type || ''), scopes: String(out.body.scope || '').split(' ').filter(Boolean), result: 'issued' })
    } else {
      d.audit('mcp:unknown', 'mcp-token-denied', '-', { ip: ipOf(req), grant: String(body.grant_type || '').slice(0, 30), error: out.body && out.body.error, result: 'denied' })
    }
    res.setHeader('Pragma', 'no-cache')
    res.status(out.status).json(out.body)
  })
  r.post(base + '/oauth/register', (req: any, res: any) => {
    if (rateHit('mcp-reg:' + ipOf(req), 10, 10 * 60_000)) return res.status(429).json({ error: 'slow_down' })
    const out = registerClient(cfg, req.body || {})
    d.audit('mcp:unknown', out.status === 201 ? 'mcp-client-registered' : 'mcp-client-register-denied', '-', { ip: ipOf(req), redirect_uris: (req.body && req.body.redirect_uris) || null, result: out.status === 201 ? 'registered' : 'denied' })
    res.status(out.status).json(out.body)
  })

  /* ── MCP 本体 ── */
  const challenge = (res: any, reason: string) => {
    res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl(cfg)}", error="invalid_token", error_description="${reason}"`)
    return res.status(401).json({ error: 'unauthorized', message: 'アクセストークンが' + (({ missing: 'ありません', expired: '期限切れです', revoked: '失効しています（APIキーが無効）', audience: '別のサーバー宛です' } as any)[reason] || '無効です') })
  }
  r.get(base, (_req: any, res: any) => { res.setHeader('Allow', 'POST'); res.status(405).json({ error: 'method-not-allowed', message: 'MCP Streamable HTTP: POST でJSON-RPCを送ってください（サーバー発の流れはありません）' }) })
  r.delete(base, (_req: any, res: any) => { res.setHeader('Allow', 'POST'); res.status(405).json({ error: 'method-not-allowed', message: 'セッションを持たないため終了もありません' }) })
  r.post(base, async (req: any, res: any) => {
    const ip = ipOf(req)
    const requestId = crypto.randomUUID()
    res.setHeader('X-Request-Id', requestId)
    if (rateHit('mcp-ip:' + ip, 600, 60_000)) return res.status(429).json({ error: 'rate-limited' })
    const raw = req.body
    if (raw === undefined || raw === null || (typeof raw === 'object' && !Array.isArray(raw) && !Object.keys(raw).length)) return res.status(400).json(rpcErr(null, -32700, 'Parse error: JSON-RPC の本文がありません'))
    if (JSON.stringify(raw).length > MAX_BODY) return res.status(413).json(rpcErr(null, -32600, '本文が大きすぎます'))
    const msgs: any[] = Array.isArray(raw) ? raw : [raw]
    if (!msgs.length) return res.status(400).json(rpcErr(null, -32600, 'Invalid Request'))

    /* 認証なしで通すのは「名乗り」と「道具の名前を見る」だけ。AIクライアントはアプリ登録時に
       トークンを持たないまま initialize と tools/list を呼んで「行動」の一覧を凍結する。
       ここを 401 にすると「行動 0」のまま公開されてしまう。名前と説明は秘密ではない
       （データは1件も返らない）。tools/call は必ずトークン。 */
    const PUBLIC_METHODS = ['initialize', 'ping', 'tools/list', 'resources/list', 'prompts/list', 'notifications/initialized', 'notifications/cancelled', 'notifications/roots/list_changed']
    const needsAuth = msgs.some(m => !(m && typeof m === 'object' && PUBLIC_METHODS.includes(String(m.method))))
    const auth = await verifyAccessToken(pool, cfg, req.headers['authorization'])
    if (!auth.ok && (needsAuth || auth.reason !== 'missing')) {
      if (auth.reason !== 'missing' && rateHit('mcp-authfail:' + ip, 30, 10 * 60_000)) return res.status(429).json({ error: 'rate-limited' })
      if (auth.reason !== 'missing') d.audit('mcp:unknown', 'mcp-auth-failed', '-', { ip, reason: auth.reason, request_id: requestId, result: 'denied' })
      return challenge(res, auth.reason)
    }
    const integ: Integration | null = auth.ok ? auth.integration : null
    const scopes: string[] | null = auth.ok ? auth.scopes : null
    if (integ) {
      if (rateHit('mcp-key:' + integ.id, 120, 60_000)) return res.status(429).json({ error: 'rate-limited', message: 'この連携のリクエストが多すぎます（120/分）' })
      touchLastUsed(pool, integ.id)
    }

    const ver = String(req.headers['mcp-protocol-version'] || '')
    if (ver && !PROTOCOL_VERSIONS.includes(ver)) return res.status(400).json(rpcErr(null, -32000, 'Unsupported MCP-Protocol-Version: ' + ver, { supported: PROTOCOL_VERSIONS }))

    const out: any[] = []
    for (const m of msgs) {
      if (!m || typeof m !== 'object' || m.jsonrpc !== '2.0' || typeof m.method !== 'string') { out.push(rpcErr(m && m.id, -32600, 'Invalid Request')); continue }
      const isNotification = m.id === undefined || m.id === null
      const resp = await handle(m, { integ, scopes, ip, requestId })
      if (!isNotification && resp) out.push(resp)
    }
    res.setHeader('MCP-Protocol-Version', ver || PROTOCOL_VERSIONS[0])
    if (!out.length) return res.status(202).end()
    res.status(200).json(Array.isArray(raw) ? out : out[0])
  })

  async function handle(m: any, c: { integ: Integration | null; scopes: string[] | null; ip: string; requestId: string }): Promise<any> {
    const id = m.id, p = m.params || {}
    switch (m.method) {
      case 'initialize': {
        const want = String(p.protocolVersion || '')
        const pv = PROTOCOL_VERSIONS.includes(want) ? want : PROTOCOL_VERSIONS[0]
        return rpcOk(id, { protocolVersion: pv, capabilities: { tools: { listChanged: false } }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION, title: 'BIGLIGHT 予実管理システム（読み取り専用）' }, instructions: INSTRUCTIONS })
      }
      case 'notifications/initialized': case 'notifications/cancelled': case 'notifications/roots/list_changed': return null
      case 'ping': return rpcOk(id, {})
      case 'tools/list': {
        /* トークン無し（登録時の下見）は全ツールの名前を見せる。トークンがあれば鍵の範囲にある分だけ */
        const sc = c.scopes
        const tools = TOOLS.filter(t => sc === null ? true : (t.visible ? t.visible(sc) : hasScope(sc, t.scope))).map(t => ({
          name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
          annotations: Object.assign({ title: t.title, openWorldHint: false }, t.annotations || { readOnlyHint: true, destructiveHint: false, idempotentHint: true }),
        }))
        return rpcOk(id, { tools })
      }
      case 'tools/call': {
        const name = String(p.name || '')
        const t = toolByName(name)
        const args = p.arguments
        const started = Date.now()
        if (!c.integ || !c.scopes) return rpcErr(id, -32001, 'Unauthorized: tools/call にはアクセストークンが要ります')
        const actor = 'mcp:' + c.integ.name
        const argLog = summarizeArgs(args)
        if (!t) { d.audit(actor, 'mcp-tool-denied', name.slice(0, 60), { reason: 'unknown-tool', request_id: c.requestId, result: 'denied' }); return rpcErr(id, -32602, 'Unknown tool: ' + name.slice(0, 60)) }
        /* 引数を先に検べる: 画面を引数で選ぶツールは、引数が決まらないと要るスコープも決まらない */
        const bad = validateArgs(t, args)
        if (bad) { d.audit(actor, 'mcp-tool-denied', t.name, { reason: 'bad-input', detail: bad, args: argLog, request_id: c.requestId, result: 'denied' }); return rpcOk(id, toolResult({ error: 'bad-input', message: bad }, true)) }
        const need = t.scopeFor ? t.scopeFor(args || {}) : t.scope
        if (need && !hasScope(c.scopes, need)) {
          d.audit(actor, 'mcp-tool-denied', t.name, { reason: 'insufficient-scope', required_scope: need, args: argLog, request_id: c.requestId, result: 'denied' })
          return rpcOk(id, toolResult({ error: 'insufficient-scope', message: 'このAPIキーには範囲「' + need + '」がありません。予実管理システム › 設定 › API・AI連携 で付けてください', required_scope: need }, true))
        }
        try {
          const data = await t.run({ pool, scopes: c.scopes, actor }, args || {})
          d.audit(actor, 'mcp-tool-called', t.name, { args: argLog, ms: Date.now() - started, request_id: c.requestId, result: 'ok' })
          return rpcOk(id, toolResult(data, false))
        } catch (e: any) {
          if (e instanceof ToolError) {
            d.audit(actor, 'mcp-tool-called', t.name, { args: argLog, ms: Date.now() - started, request_id: c.requestId, result: e.code })
            return rpcOk(id, toolResult(Object.assign({ error: e.code, message: e.message }, e.data ? { data: e.data } : {}), true))
          }
          console.error('[mcp] tool error', t.name, e && e.message)
          d.audit(actor, 'mcp-tool-failed', t.name, { args: argLog, request_id: c.requestId, result: 'error' })
          return rpcOk(id, toolResult({ error: 'server-error', message: 'サーバー内部で失敗しました', request_id: c.requestId }, true))
        }
      }
      case 'resources/list': return rpcOk(id, { resources: [] })
      case 'prompts/list': return rpcOk(id, { prompts: [] })
      default: return rpcErr(id, -32601, 'Method not found: ' + String(m.method).slice(0, 60))
    }
  }
  return r
}

export function toolResult(data: any, isError: boolean) {
  const content: any[] = [{ type: 'text', text: JSON.stringify(data, null, 1) }]
  /* get_attachment: ファイルの中身は JSON に入れず、MCP の画像／リソースとして添える（2026-09-16） */
  const em = data && data.__embed
  if (em) content.push(/^image\//.test(em.mime)
    ? { type: 'image', data: em.base64, mimeType: em.mime }
    : { type: 'resource', resource: { uri: em.uri, mimeType: em.mime, blob: em.base64 } })
  return { content, structuredContent: data, isError }
}
/** 監査に残す引数は「鍵っぽいもの」を伏せ、長さも切る（検索語は残す＝誰が何を見たかは追える） */
function summarizeArgs(a: any) {
  if (!a || typeof a !== 'object') return {}
  const o: any = {}
  for (const [k, v] of Object.entries(a).slice(0, 10)) {
    const s = typeof v === 'string' ? v : JSON.stringify(v)
    o[k] = /bl_live_|mcpat_|mcprt_/.test(String(s)) ? '(伏せました)' : String(s).slice(0, 80)
  }
  return o
}
const errPage = (msg: string) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>BIGLIGHT 予実管理システム</title></head><body style="font-family:system-ui;padding:40px"><h2>接続できません</h2><p>${String(msg).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c])}</p></body></html>`
