/* ============================================================================
   MCP — ツール（読み取りだけ）                            公式 §17.6
   ----------------------------------------------------------------------------
   決まりごと:
     ・ツールは「名前が決まった関数」だけ。任意の SQL や URL を AI に選ばせる道は作らない。
     ・数字は必ず reports.ts / finance.ts を通す（画面と同じ式。AI 用に別計算をしない）。
     ・1画面 = 1スコープ。鍵に付いていない画面はここからも見えない。
     ・書き込み・削除のツールは無い。外からこのシステムの金額は動かせない
       （開けるときは 公式 §17.7 のとおり「確認待ち」から）。
     ・二種類のツールを両方置く:
        業務ツール  — 人がよく聞く質問の形（未回収は？ 今月いくら払う？ 予実は？）
        汎用ツール  — list_screens → search_records → get_record。
                      画面を1つ許可に足せば、コードを足さずに AI が読めるようになる。
   ============================================================================ */
import type { Pool } from 'pg'
import { loadStateCached } from '../statecache'
import { hasScope } from '../apiv1/keys'
import { COLLECTIONS, collectionById, publicRow, rowStamp, CollectionDef } from '../apiv1/collections'
import * as R from '../apiv1/reports'
import * as F from '../apiv1/finance'
import * as A from '../apiv1/attachments'

export interface ToolDef {
  name: string
  title: string
  description: string
  /** 固定のスコープ。画面を引数で選ぶツールは '' にして scopeFor で決める */
  scope: string
  inputSchema: any
  run: (ctx: ToolCtx, args: any) => Promise<any>
  scopeFor?: (args: any) => string | null
  visible?: (scopes: string[]) => boolean
  annotations?: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean }
}
export interface ToolCtx { pool: Pool; scopes: string[]; actor: string }
export class ToolError extends Error { constructor(public code: string, message: string, public data?: any) { super(message) } }

/* ───────── 小さな道具 ───────── */
const S = (v: any, max: number) => { const s = String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim(); return s.length > max ? s.slice(0, max) : s }
const safeId = (v: any) => { const s = S(v, 80); return /^[A-Za-z0-9\-_.:]{1,80}$/.test(s) ? s : '' }
const intIn = (v: any, lo: number, hi: number, dflt: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.floor(n))) : dflt }
const norm = (v: any) => String(v == null ? '' : v).toLowerCase().normalize('NFKC').replace(/\s+/g, '')

/* 個人番号・パスワード・トークンの類は、どの画面から来ても MCP では必ず伏せる。
   台帳の hidden（publicRow）に加えた二段目。名前の形が違っても拾えるようにする。 */
const NEVER_KEYS = ['individualnumber', 'mynumber', 'password', 'passwordhash', 'pin', 'pinhash', 'token', 'secret', 'apikey', 'accesstoken', 'refreshtoken', 'residencecard', 'passportno', 'bankinfo']
const neverKey = (k: string) => { const n = k.toLowerCase().replace(/[_\-]/g, ''); return NEVER_KEYS.some(x => n === x || n.endsWith(x)) }
function safeRow(def: CollectionDef, row: any): any {
  const o = publicRow(def, row)
  if (!o) return null
  for (const k of Object.keys(o)) if (neverKey(k)) delete o[k]
  return o
}
/** 参照（companyId / workerId）に名前を添える。AI が id だけ見て迷わないように */
function withRefs(st: any, o: any): any {
  if (!o) return o
  if (o.companyId) o.company_name = F.companyName(st, o.companyId)
  if (o.workerId) { const w = (st.workers || []).find((x: any) => String(x.id) === String(o.workerId)); o.worker_name = w ? String(w.name || '') : '' }
  return o
}
const rowText = (o: any) => Object.values(o || {}).map(v => (v === null || v === undefined) ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(' ')
const SCREEN_IDS = COLLECTIONS.map(c => c.id)
const rowsOf = (st: any, def: CollectionDef): any[] => Array.isArray(st[def.crmKey]) ? st[def.crmKey].filter((r: any) => r && r.id) : []
function screenArg(args: any): CollectionDef {
  const def = collectionById(S(args && args.screen, 40))
  if (!def) throw new ToolError('bad-input', 'screen が不正です。list_screens で使える画面を確認してください')
  return def
}
/** 取引先を1社に決める（id か 名前の一部）。決まらなければ ToolError。 */
function findCompany(st: any, args: any) {
  const list: any[] = Array.isArray(st.companies) ? st.companies.filter((c: any) => c && c.id) : []
  const id = safeId(args && args.company_id), q = norm(S(args && args.company_name, 80))
  if (!id && !q) throw new ToolError('bad-input', 'company_id か company_name のどちらかが必要です')
  if (id) {
    const c = list.find(x => String(x.id) === id)
    if (!c) throw new ToolError('not-found', 'その id の取引先はありません')
    return c
  }
  const hits = list.filter(x => [x.name, x.kana].some(v => norm(v).includes(q)))
  if (!hits.length) throw new ToolError('not-found', '取引先が見つかりません（search_companies で探してください）')
  if (hits.length > 1) throw new ToolError('ambiguous', '取引先名が複数に一致します。company_id で指定してください', { candidates: hits.slice(0, 10).map(x => ({ id: x.id, name: x.name })) })
  return hits[0]
}
const fyArg = (st: any, a: any): number => {
  if (a && a.fiscal_year != null) {
    const n = Number(a.fiscal_year)
    if (!Number.isInteger(n) || n < 2000 || n > 2100) throw new ToolError('bad-input', 'fiscal_year は年度の西暦（例 2025 = 2025年8月〜2026年7月）で')
    return n
  }
  return F.fyOf(F.thisMonth()) as number
}

/* ══════════════════════════ ツール一覧 ══════════════════════════ */
export const TOOLS: ToolDef[] = [
  /* ══════ 業務ツール ══════ */
  {
    name: 'get_yojitsu_summary', title: '予実（損益）のまとめ', scope: 'yojitsu.read',
    description: '会計年度（8月〜翌7月）の損益を、実績・予算・前年・着地見込で返す。売上高／売上原価／売上総利益／販管費／営業利益／営業外収支／経常利益の7行と、粗利率・営業利益率・予算達成率・前年比。金額は税抜、計上月（発生主義）基準。売上の実績は請求書から、費用の実績は会計事務所の試算表から手入力した数字（費用表は予定なので実績には入らない）。',
    inputSchema: { type: 'object', properties: { fiscal_year: { type: 'integer', description: '年度の西暦。2025 = 2025年8月〜2026年7月。省略すると今の年度' } }, additionalProperties: false },
    async run(ctx, a) { const st = await loadStateCached(ctx.pool); return R.plReport(st, fyArg(st, a)) },
  },
  {
    name: 'list_unpaid_invoices', title: '未回収の請求（回収の対象）', scope: 'invoices.read',
    description: '入金がまだ済んでいない請求書を、入金期日の早い順に返す。overdue_only=true にすると期日を過ぎたもの（延滞）だけ。取引先を指定すればその会社の分だけ。合計・件数・未消込の入金額も付く。',
    inputSchema: { type: 'object', properties: {
      overdue_only: { type: 'boolean', description: 'true なら入金期日を過ぎたものだけ' },
      company_name: { type: 'string', description: '取引先名の一部' },
      company_id: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
    }, additionalProperties: false },
    async run(ctx, a) {
      const st = await loadStateCached(ctx.pool)
      let cid: string | undefined
      if ((a && a.company_id) || (a && a.company_name)) cid = String(findCompany(st, a).id)
      return R.receivablesReport(st, { overdueOnly: !!(a && a.overdue_only), companyId: cid, limit: intIn(a && a.limit, 1, 200, 50) })
    },
  },
  {
    name: 'get_receivables_aging', title: '債権年齢表（いつから回収できていないか）', scope: 'invoices.read',
    description: '未回収の売掛金を、取引先ごと・経過日数の区分ごと（未到来／1〜30日／31〜60日／61〜90日／90日超）に集計して返す。残高の大きい取引先が先に来る。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async run(ctx) {
      const st = await loadStateCached(ctx.pool)
      const rep = R.receivablesReport(st, { limit: 1 })
      return { as_of: rep.as_of, open_total: rep.open_total, open_count: rep.open_count, overdue_total: rep.overdue_total, overdue_count: rep.overdue_count,
        aging_buckets: rep.aging_buckets, aging_totals: rep.aging_totals, aging_by_company: rep.aging_by_company, note: rep.note }
    },
  },
  {
    name: 'list_unpaid_bills', title: '未払の支払請求（これから払うお金）', scope: 'bills.read',
    description: '仕入先からの請求のうち、まだ払い終わっていないものを支払期日の早い順に返す。既定は30日以内に期日が来るもの。overdue_only=true なら期日を過ぎたものだけ。明細の勘定科目（売上原価か販管費か）と、未払のうち売上原価にあたる金額も付く。',
    inputSchema: { type: 'object', properties: {
      due_within_days: { type: 'integer', minimum: 0, maximum: 365, description: '何日以内に期日が来るものか（既定 30）' },
      overdue_only: { type: 'boolean' },
      company_name: { type: 'string', description: '支払先名の一部' },
      company_id: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
    }, additionalProperties: false },
    async run(ctx, a) {
      const st = await loadStateCached(ctx.pool)
      let cid: string | undefined
      if ((a && a.company_id) || (a && a.company_name)) cid = String(findCompany(st, a).id)
      return R.payablesReport(st, { overdueOnly: !!(a && a.overdue_only), dueWithinDays: a && a.due_within_days != null ? Number(a.due_within_days) : undefined, companyId: cid, limit: intIn(a && a.limit, 1, 200, 50) })
    },
  },
  {
    name: 'get_cash_forecast', title: '資金繰り（入るお金 − 出るお金）', scope: 'yojitsu.read',
    description: '未回収の請求の入金期日と、未払の支払期日から、これからの現金の出入りと残高見込みを返す。週ごと（既定）か月ごと。開始残高は 設定 に入れた通帳残高。',
    inputSchema: { type: 'object', properties: {
      mode: { type: 'string', enum: ['week', 'month'], description: '週ごと（既定）か月ごとか' },
      periods: { type: 'integer', minimum: 1, maximum: 52, default: 12 },
    }, additionalProperties: false },
    async run(ctx, a) {
      const st = await loadStateCached(ctx.pool)
      const mode = String((a && a.mode) || 'week') === 'month' ? 'month' : 'week'
      return R.cashflowReport(st, mode as any, intIn(a && a.periods, 1, 52, 12))
    },
  },
  {
    name: 'search_companies', title: '取引先を探す', scope: 'companies.read',
    description: '取引先（得意先・仕入先）を名前・フリガナで探す。締日・支払サイト・支払日と、売掛・買掛の残高が付く。',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: '検索語（1文字以上）' }, limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 } }, required: ['query'], additionalProperties: false },
    async run(ctx, a) {
      const st = await loadStateCached(ctx.pool)
      const q = norm(S(a && a.query, 80))
      if (!q) throw new ToolError('bad-input', 'query を入れてください')
      const hits = (st.companies || []).filter((c: any) => c && c.id && [c.name, c.kana].some((v: any) => norm(v).includes(q)))
      return { total: hits.length, items: hits.slice(0, intIn(a && a.limit, 1, 50, 20)).map((c: any) => ({
        id: c.id, name: c.name || '', kana: c.kana || '', kind: c.kind || null,
        closing_day: c.closingDay ?? null, pay_site_months: c.paySite ?? null, pay_day: c.payDay ?? null,
        ar_balance: F.arBalanceOf(st, c.id), ap_balance: F.apBalanceOf(st, c.id),
      })) }
    },
  },
  {
    name: 'get_company_account', title: '取引先1社の入金・支払の状況', scope: 'companies.read',
    description: '取引先1社の売掛残高・買掛残高、未回収の請求、未払の支払、直近の入金・支払を1回で返す。「あの会社、いくら残ってる？」に答えるためのもの。',
    inputSchema: { type: 'object', properties: { company_id: { type: 'string' }, company_name: { type: 'string', description: '取引先名の一部' } }, additionalProperties: false },
    async run(ctx, a) {
      const st = await loadStateCached(ctx.pool)
      const c = findCompany(st, a)
      const out: any = R.companyAccount(st, String(c.id))
      if (!hasScope(ctx.scopes, 'invoices.read')) { delete out.open_invoices; delete out.ar_balance }
      if (!hasScope(ctx.scopes, 'bills.read')) { delete out.open_bills; delete out.ap_balance }
      if (!hasScope(ctx.scopes, 'payments.read')) delete out.recent_payments
      if (!hasScope(ctx.scopes, 'payouts.read')) delete out.recent_payouts
      return out
    },
  },
  {
    name: 'get_invoice', title: '請求書1枚の中身', scope: 'invoices.read',
    description: '請求書を id か請求番号（INV-202509-001 など）で読む。明細（勘定科目つき）・税込合計・入金済み・残高・状態・年齢区分、どの入金がいくら充てられたかも返す。',
    inputSchema: { type: 'object', properties: { invoice_id: { type: 'string' }, invoice_no: { type: 'string', description: '請求番号' } }, additionalProperties: false },
    async run(ctx, a) {
      const st = await loadStateCached(ctx.pool)
      const id = safeId(a && a.invoice_id), no = S(a && a.invoice_no, 60).toUpperCase()
      if (!id && !no) throw new ToolError('bad-input', 'invoice_id か invoice_no のどちらかが必要です')
      const list: any[] = Array.isArray(st.invoices) ? st.invoices : []
      const inv = id ? list.find(x => String(x.id) === id) : list.find(x => String(x.no || '').toUpperCase() === no)
      if (!inv) throw new ToolError('not-found', 'その請求書はありません')
      return R.invoiceDetail(st, inv)
    },
  },
  {
    name: 'get_bill', title: '支払請求1枚の中身', scope: 'bills.read',
    description: '仕入先からの請求（買掛）を id か管理番号で読む。明細（勘定科目・売上原価か販管費か）・合計・支払済み・残高・支払期日と、どの支払がいくら充てられたかを返す。',
    inputSchema: { type: 'object', properties: { bill_id: { type: 'string' }, bill_no: { type: 'string', description: '管理番号' } }, additionalProperties: false },
    async run(ctx, a) {
      const st = await loadStateCached(ctx.pool)
      const id = safeId(a && a.bill_id), no = S(a && a.bill_no, 60).toUpperCase()
      if (!id && !no) throw new ToolError('bad-input', 'bill_id か bill_no のどちらかが必要です')
      const list: any[] = Array.isArray(st.bills) ? st.bills : []
      const b = id ? list.find(x => String(x.id) === id) : list.find(x => String(x.no || '').toUpperCase() === no)
      if (!b) throw new ToolError('not-found', 'その支払請求はありません')
      return R.billDetail(st, b)
    },
  },

  /* ══════ 証憑（添付ファイル）— 読むだけ（2026-09-16）══════ */
  {
    name: 'list_attachments', title: '伝票に付いた書類（証憑）の一覧', scope: '',
    description: '請求・入金・支払請求・支払・取引先・費目・物件の1件に付いているファイル（請求書PDF・振込明細・領収書・契約書など）を一覧する。' +
      '各ファイルの file_id・ファイル名・書類の種類（doc_type）・大きさと、その伝票の会社・月・金額（税込）を返す。中身は get_attachment で読む。',
    inputSchema: { type: 'object', properties: {
      screen: { type: 'string', enum: A.ATT_SCREEN_IDS, description: '伝票の表（invoices / payments / bills / payouts / companies / cost_items / properties など）' },
      id: { type: 'string', description: '伝票の id（search_records・list_unpaid_bills などが返す id）' },
    }, required: ['screen', 'id'], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    visible: (sc) => A.ATT_SCREENS.some(c => hasScope(sc, c.readScope)),
    scopeFor: (a) => { const d = A.attScreen(S(a && a.screen, 40)); return d ? d.readScope : 'invoices.read' },
    async run(ctx, a) {
      const def = A.attScreen(S(a && a.screen, 40))
      if (!def) throw new ToolError('bad-input', 'screen が不正です')
      const id = safeId(a && a.id)
      if (!id) throw new ToolError('bad-input', 'id が不正です')
      const st = await loadStateCached(ctx.pool)
      const out = await A.attachmentsOf(ctx.pool, st, def, id)
      if (!out) throw new ToolError('not-found', 'その伝票はありません')
      return out
    },
  },
  {
    name: 'get_attachment', title: '書類（証憑）ファイルを読む', scope: '',
    description: 'list_attachments が返した file_id のファイルを読む。PDF はファイルそのもの（resource）、画像は image として返す（5MB まで）。' +
      'Excel・Word は中身を返さず、書類の情報だけ返す。どの伝票（会社・月・金額）のファイルかも一緒に返す。',
    inputSchema: { type: 'object', properties: { file_id: { type: 'string' } }, required: ['file_id'], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    visible: (sc) => A.ATT_SCREENS.some(c => hasScope(sc, c.readScope)),
    scopeFor: () => null,                // どの表のファイルかは 読んでみるまで分からない → run の中で確かめる
    async run(ctx, a) {
      const id = safeId(a && a.file_id)
      if (!id) throw new ToolError('bad-input', 'file_id が不正です')
      const st = await loadStateCached(ctx.pool)
      const got = await A.attachmentFile(ctx.pool, st, id)
      /* スコープが無い表のファイルは「無い」と同じ答えにする（あるかどうかも教えない） */
      if (!got || !hasScope(ctx.scopes, got.def.readScope)) throw new ToolError('not-found', 'そのファイルはありません（または読む範囲の外です）')
      const f = got.file
      const out: any = { record: got.record, file: A.fileView(f) }
      const small = f.data.length <= 5 * 1024 * 1024
      if (small && (f.mime === 'application/pdf' || /^image\/(png|jpeg|gif|webp)$/.test(f.mime))) {
        out.content_included = true
        Object.defineProperty(out, '__embed', { value: { uri: 'attachment://' + f.id + '/' + encodeURIComponent(f.fileName), mime: f.mime, base64: f.data.toString('base64') }, enumerable: false })
      } else {
        out.content_included = false
        out.note = small ? 'この種類（' + f.kind + '）は中身を返しません。' : '5MB を超えるため中身は返しません。'
      }
      return out
    },
  },
  {
    name: 'list_missing_attachments', title: '証憑（ファイル）が付いていない伝票', scope: '',
    description: 'ファイルが要るのに1つも付いていない伝票を新しい順に返す。対象: 確定した支払請求・請求、取消していない入金・支払。' +
      '月（YYYY-MM）・取引先で絞れる。書類集めや月次の点検に使う。',
    inputSchema: { type: 'object', properties: {
      screen: { type: 'string', enum: A.MISSING_SCREENS, description: '省略すると 読める表すべて' },
      month_from: { type: 'string', description: 'YYYY-MM（計上月。入金・支払は日付の月）' },
      month_to: { type: 'string', description: 'YYYY-MM' },
      company_id: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
    }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    visible: (sc) => A.ATT_SCREENS.some(c => A.MISSING_SCREENS.includes(c.id) && hasScope(sc, c.readScope)),
    scopeFor: (a) => { const d = a && a.screen ? A.attScreen(S(a.screen, 40)) : null; return d ? d.readScope : null },
    async run(ctx, a) {
      const mo = (v: any, k: string) => { const s = S(v, 10); if (s && !/^\d{4}-\d{2}$/.test(s)) throw new ToolError('bad-input', k + ' は YYYY-MM で'); return s }
      const want = a && a.screen ? [S(a.screen, 40)] : A.MISSING_SCREENS
      const screens = want.filter(x => { const d = A.attScreen(x); return d && hasScope(ctx.scopes, d.readScope) })
      if (!screens.length) throw new ToolError('insufficient-scope', '読める表がありません')
      const st = await loadStateCached(ctx.pool)
      return A.missingAttachments(ctx.pool, st, screens, { monthFrom: mo(a && a.month_from, 'month_from'), monthTo: mo(a && a.month_to, 'month_to'),
        companyId: safeId(a && a.company_id) || undefined, limit: intIn(a && a.limit, 1, 200, 50) })
    },
  },

  /* ══════ 汎用ツール（どの画面でも同じ形で読む）══════ */
  {
    name: 'list_screens', title: '読める画面の一覧', scope: '',
    description: 'この接続で読める画面（表）を一覧する。各画面の id・名前・説明・件数・項目名を返す。search_records / get_record に渡す screen の値はここで確認する。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    visible: () => true,
    scopeFor: () => null,
    async run(ctx) {
      const st = await loadStateCached(ctx.pool)
      const items = COLLECTIONS.filter(c => hasScope(ctx.scopes, c.readScope)).map(c => {
        const rows = rowsOf(st, c)
        const keys = new Set<string>()
        for (const r of rows.slice(0, 50)) { const o = safeRow(c, r); if (o) for (const k of Object.keys(o)) keys.add(k) }
        return { screen: c.id, label: c.label, note: c.note || '', scope: c.readScope, count: rows.length, fields: Array.from(keys).slice(0, 80) }
      })
      const missing = COLLECTIONS.filter(c => !hasScope(ctx.scopes, c.readScope)).map(c => ({ screen: c.id, label: c.label, needs_scope: c.readScope }))
      return { screens: items, not_permitted: missing,
        hint: '合計の数字は get_yojitsu_summary / get_cash_forecast、回収は list_unpaid_invoices、支払は list_unpaid_bills が早いです。書き込みはできません。' }
    },
  },
  {
    name: 'search_records', title: '画面の中を探す', scope: '',
    description: 'どの画面（list_screens の screen）でも、行を探して読む。query はすべての項目値に対する部分一致（空なら新しい順）。updated_since で「その日以降に更新された行」だけに絞れる。最大100件。',
    inputSchema: { type: 'object', properties: {
      screen: { type: 'string', enum: SCREEN_IDS, description: 'list_screens が返す画面ID' },
      query: { type: 'string', description: '検索語（省略可・部分一致）' },
      updated_since: { type: 'string', description: 'YYYY-MM-DD。この日以降に更新された行だけ' },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    }, required: ['screen'], additionalProperties: false },
    visible: (sc) => COLLECTIONS.some(c => hasScope(sc, c.readScope)),
    scopeFor: (a) => { const d = collectionById(S(a && a.screen, 40)); return d ? d.readScope : 'invoices.read' },
    async run(ctx, a) {
      const def = screenArg(a)
      const limit = intIn(a && a.limit, 1, 100, 20)
      const q = norm(S(a && a.query, 80))
      const since = S(a && a.updated_since, 30)
      if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new ToolError('bad-input', 'updated_since は YYYY-MM-DD で')
      const st = await loadStateCached(ctx.pool)
      let rows = rowsOf(st, def).map(r => withRefs(st, safeRow(def, r))).filter(Boolean)
      if (since) rows = rows.filter(o => rowStamp(o).slice(0, 10) >= since)
      if (q) rows = rows.filter(o => norm(rowText(o)).includes(q))
      rows.sort((x, y) => String(rowStamp(y)).localeCompare(String(rowStamp(x))))
      return { screen: def.id, label: def.label, total: rows.length, returned: Math.min(rows.length, limit), items: rows.slice(0, limit) }
    },
  },
  {
    name: 'get_record', title: '画面の1行を読む', scope: '',
    description: 'どの画面でも、id を指定して1行を読む。search_records が返した id をそのまま渡す。',
    inputSchema: { type: 'object', properties: {
      screen: { type: 'string', enum: SCREEN_IDS, description: 'list_screens が返す画面ID' },
      id: { type: 'string', description: '行の id' },
    }, required: ['screen', 'id'], additionalProperties: false },
    visible: (sc) => COLLECTIONS.some(c => hasScope(sc, c.readScope)),
    scopeFor: (a) => { const d = collectionById(S(a && a.screen, 40)); return d ? d.readScope : 'invoices.read' },
    async run(ctx, a) {
      const def = screenArg(a)
      const id = safeId(a && a.id)
      if (!id) throw new ToolError('bad-input', 'id が不正です')
      const st = await loadStateCached(ctx.pool)
      const row = rowsOf(st, def).find((r: any) => String(r.id) === id)
      if (!row) throw new ToolError('not-found', 'この画面にその id の行はありません')
      return { screen: def.id, label: def.label, item: withRefs(st, safeRow(def, row)) }
    },
  },
]
export const toolByName = (n: string) => TOOLS.find(t => t.name === n) || null

/** 入力の形を JSON Schema の範囲で自前検証（外部ライブラリ無し）。 */
export function validateArgs(t: ToolDef, args: any): string | null {
  if (args === undefined || args === null) args = {}
  if (typeof args !== 'object' || Array.isArray(args)) return 'arguments はオブジェクトで'
  const sch = t.inputSchema
  const props = sch.properties || {}
  for (const k of Object.keys(args)) if (!(k in props)) return '不明な引数: ' + k
  for (const k of (sch.required || [])) if (args[k] === undefined || args[k] === null || args[k] === '') return '引数が足りません: ' + k
  for (const [k, v] of Object.entries(args)) {
    const p: any = props[k]
    if (v === undefined || v === null) continue
    if (p.type === 'string' && typeof v !== 'string') return k + ' は文字列で'
    if (p.type === 'string' && (v as string).length > 200) return k + ' が長すぎます'
    if (p.type === 'integer' && !(typeof v === 'number' && Number.isInteger(v))) return k + ' は整数で'
    if (p.type === 'boolean' && typeof v !== 'boolean') return k + ' は真偽値で'
    if (p.type === 'object' && (typeof v !== 'object' || Array.isArray(v))) return k + ' はオブジェクトで'
    if (Array.isArray(p.enum) && !p.enum.includes(v as any)) return k + ' に使えない値です（list_screens を見てください）'
  }
  return null
}
