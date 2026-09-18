/* ============================================================================
   MoneyForward → 予実 の取り込み規則（ここが唯一の置き場）
   ----------------------------------------------------------------------------
   ★ 2026-09-18 利用者の指示:
     ・BIGLIGHT が触るのは この システムだけ。会計の仕訳は 経理（外部）が MF 会計 で行う。
       → この システムからは「消込一覧」などの CSV を出して渡す。MF には一切書かない。
     ・取り込みの道は2本。どちらも 同じ規則・同じ結果（冪等）になること:
         ① API（MF 請求書 / MF 会計）  ② CSV（MF や銀行から出したファイル）
   ★ なぜ画面（web/index.html）ではなく ここに規則を置くか:
     毎朝の自動同期（cron）と 画面からの取り込みで 規則が2つに割れると、
     「画面では入ったのに 自動だと入らない」という説明できない差が生まれるため。
   ★ 純粋関数だけ。state（app_state の中身）を受け取り、新しい state と計画を返す。
     データベースにも MF にも、この中からは触りません（テストしやすさのため）。
   ========================================================================== */

/* ---------- 共通の小道具 ---------- */
export const num = (v: any) => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return isFinite(n) ? Math.round(n) : 0 }
export const ymOf = (d: any) => String(d || '').slice(0, 7)
export const dateOnly = (v: any) => String(v || '').slice(0, 10)
const arr = (state: any, k: string): any[] => (Array.isArray(state?.[k]) ? state[k] : [])
const newId = (p: string) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

/** 会社名の表記ゆれを畳む（株式会社・㈱・空白・全角半角） */
export const normName = (s: any) => String(s || '').normalize('NFKC')
  .replace(/株式会社|有限会社|合同会社|合資会社|合名会社|一般社団法人|一般財団法人|\(株\)|\(有\)|\(同\)|㈱|㈲|御中|様/g, '')
  .replace(/[\s　・,.，。]/g, '').toLowerCase()

/** 振込名義（カナ）の表記ゆれを畳む。半角カナ→全角、カ)・(カ・カブシキガイシャ などを落とす */
export const normPayer = (s: any) => {
  let t = String(s || '').normalize('NFKC')
  t = t.replace(/^(振込|フリコミ|ﾌﾘｺﾐ|入金|ATM|口座振替)[\s:：]*/u, '')
  t = t.replace(/カブシキガイシャ|ユウゲンガイシャ|ゴウドウガイシャ|カ\)|\(カ|ｶ\)|\(ｶ|ユ\)|\(ユ|ド\)|\(ド/g, '')
  return t.replace(/[\s　・,.，。\-ー－]/g, '').toLowerCase()
}

/* ---------- 締め（期のロック・settings.closedFy）----------
   ★ 締めた期（年度）の数字は、自動同期でも 人の操作でも 動かさない。
     会計事務所に渡したあとで数字が変わると、突合が永久に合わなくなるため。 */
export const FY_START_MONTH = 8
export function fyOfYm(ym: any): number | null {
  const t = String(ym || ''); if (!/^[0-9]{4}-[0-9]{2}/.test(t)) return null
  const y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7))
  return m >= FY_START_MONTH ? y : y - 1
}
export const closedFys = (state: any): number[] => ((state?.settings?.closedFy) || []).map(Number)
/** 締めた期に属する月か（画面の isClosedFy と同じ意味。authz.checkClosedPeriods とも揃えています） */
export const isClosedYm = (state: any, ym: any) => { const f = fyOfYm(ym); return f != null && closedFys(state).includes(f) }

/* ---------- 取引先の対応づけ ---------- */
export function matchCompany(state: any, b: { partnerId?: string; partnerName?: string }, map?: Record<string, string>) {
  const key = partnerKey(b)
  if (map && map[key]) return { companyId: map[key], how: 'manual' as const }
  const cos = arr(state, 'companies').filter((c: any) => !c._gone)
  if (b.partnerId) { const c = cos.find((x: any) => String(x.mfPartnerId || '') === String(b.partnerId)); if (c) return { companyId: String(c.id), how: 'id' as const } }
  const n = normName(b.partnerName)
  if (n) {
    const hits = cos.filter((x: any) => normName(x.mfPartnerName || x.name) === n)
    if (hits.length === 1) return { companyId: String(hits[0].id), how: 'name' as const }
  }
  return { companyId: '', how: 'none' as const }
}
export const partnerKey = (b: { partnerId?: string; partnerName?: string }) => b.partnerId ? 'id:' + b.partnerId : 'nm:' + normName(b.partnerName)

/* ---------- 請求書（MF 請求書 → invoices）----------
   鍵は MF の id（mfId）だけ。請求書番号は MF 側で重複することがあるので鍵にしない。 */
export type Billing = {
  mfId: string; number?: string; partnerId?: string; partnerName?: string; title?: string
  billingDate?: string; salesDate?: string; dueDate?: string
  subtotal?: number | null; tax?: number | null; total?: number
  mfStatus?: string; paymentStatus?: string; emailStatus?: string; postingStatus?: string
  isLocked?: boolean; isDownloaded?: boolean; updatedAt?: string
}
/** 下書き＝まだ出していない請求。売掛金にしてはいけない。 */
export function isDraft(b: Billing) {
  if (b.mfStatus) return String(b.mfStatus).includes('下書き')
  const sent = (b.emailStatus && b.emailStatus !== '未送信') || (b.postingStatus && b.postingStatus !== '未郵送')
  return !(b.isLocked || b.isDownloaded || sent || (b.number || '').trim())
}
export const billingYm = (b: Billing) => ymOf(b.salesDate || b.billingDate)

/** 請求ルールから「あるべき請求額（税込）」。合っていれば自動で確定してよい。 */
export function ruleAmountOf(state: any, companyId: string): number | null {
  const rules = arr(state, 'billingRules').filter((r: any) => String(r.companyId) === String(companyId) && r.active !== false && r.kind === 'fixed')
  if (!rules.length) return null
  const rate: Record<string, number> = { '課税10%': 0.1, '軽減8%': 0.08, '非課税': 0, '対象外': 0 }
  return rules.reduce((s: number, r: any) => s + Math.round(num(r.unitPrice) * (1 + (rate[r.taxCat || '課税10%'] ?? 0.1))), 0)
}

const INV_KEYS = ['companyId', 'bookMonth', 'issueDate', 'dueDate', 'total', 'subtotal', 'no', 'taxCat'] as const
export const TAX_RATE: Record<string, number> = { '課税10%': 0.10, '軽減8%': 0.08, '非課税': 0, '対象外': 0 }
/** MF の請求1件 → この システムの請求の中身。
    ★ 2026-09-16 の画面の規則をそのまま持ってきています（画面と同じ数字になるように）:
      税抜が来ていれば 税込との比で 税区分を決める（同じなら 非課税／対象外、1.10 なら 課税10%、1.08 なら 軽減8%、
      それ以外は 混在）。税抜が無い CSV は 取引先の税区分で税抜を出す（以前は いつも ÷1.1 でした）。 */
export function billingToRec(state: any, b: Billing, companyId: string) {
  const rec: any = {
    companyId, bookMonth: billingYm(b), issueDate: dateOnly(b.billingDate || b.salesDate), dueDate: dateOnly(b.dueDate),
    total: num(b.total), subtotal: null, no: String(b.number || ''), taxCat: '',
  }
  const c = arr(state, 'companies').find((x: any) => String(x.id) === String(companyId))
  if (b.subtotal != null && (b.subtotal as any) !== '') {
    rec.subtotal = num(b.subtotal)
    const t = rec.total, n = rec.subtotal
    if (t === n) rec.taxCat = (c && TAX_RATE[c.taxCat] === 0) ? c.taxCat : '対象外'
    else if (n && Math.abs(t - Math.floor(n * 1.10)) <= 1) rec.taxCat = '課税10%'
    else if (n && Math.abs(t - Math.floor(n * 1.08)) <= 1) rec.taxCat = '軽減8%'
    else rec.taxCat = '混在'
  } else {
    rec.taxCat = (c && TAX_RATE[c.taxCat] != null) ? c.taxCat : '課税10%'
    rec.subtotal = Math.round(rec.total / (1 + (TAX_RATE[rec.taxCat] || 0)))
  }
  return rec
}

export type BillingPlan = {
  create: any[]; update: any[]; diff: any[]; same: any[]
  unmapped: { key: string; partnerName: string; n: number; total: number }[]
  drafts: number; closed: any[]; dupWarn: any[]
}

/** 取り込みの計画を立てる（画面の確認・cron・テストが同じものを見る） */
export function planBillings(state: any, items: Billing[], map?: Record<string, string>): BillingPlan {
  const out: BillingPlan = { create: [], update: [], diff: [], same: [], unmapped: [], drafts: 0, closed: [], dupWarn: [] }
  const invoices = arr(state, 'invoices')
  const byMf = new Map(invoices.filter((i: any) => i.mfId).map((i: any) => [String(i.mfId), i]))
  const unmapped = new Map<string, { key: string; partnerName: string; n: number; total: number }>()

  for (const b of items) {
    if (!b || !b.mfId) continue
    if (isDraft(b)) { out.drafts++; continue }
    const m = matchCompany(state, b, map)
    if (m.companyId === '__skip') continue
    if (!m.companyId) {
      const key = partnerKey(b)
      const g = unmapped.get(key) || { key, partnerName: String(b.partnerName || ''), n: 0, total: 0 }
      g.n++; g.total += num(b.total); unmapped.set(key, g)
      continue
    }
    const rec = billingToRec(state, b, m.companyId)
    const ex: any = byMf.get(String(b.mfId))
    if (isClosedYm(state, rec.bookMonth) && (!ex || String(ex.bookMonth) !== rec.bookMonth)) { out.closed.push({ b, rec }); continue }
    if (!ex) {
      const ruleAmt = ruleAmountOf(state, m.companyId)
      const auto = ruleAmt == null || ruleAmt === rec.total
      out.create.push({ b, rec, auto })
      if (invoices.some((i: any) => !i.mfId && i.status !== '取消' && i.status !== '作成中'
        && String(i.companyId) === m.companyId && ymOf(i.bookMonth) === rec.bookMonth)) out.dupWarn.push({ b, rec })
      continue
    }
    if (isClosedYm(state, ex.bookMonth)) { out.closed.push({ b, rec, ex }); continue }
    const changed = INV_KEYS.filter(k => String(ex[k] ?? '') !== String((rec as any)[k] ?? ''))
    if (!changed.length) { out.same.push({ b, rec, ex }); continue }
    if (ex.confirmStatus === '確定') out.diff.push({ b, rec, ex, changed })
    else out.update.push({ b, rec, ex, changed })
  }
  out.unmapped = [...unmapped.values()].sort((a, b) => b.total - a.total)
  return out
}

/** 計画どおりに state を書き換える（冪等: 同じ入力を何度流しても同じ結果） */
export function applyBillings(state: any, items: Billing[], opts: { map?: Record<string, string>; actor?: string; source?: string } = {}) {
  const plan = planBillings(state, items, opts.map)
  const out = { ...state, invoices: arr(state, 'invoices').slice() }
  const now = new Date().toISOString(), actor = opts.actor || 'mf-sync'
  const byId = new Map<string, number>(out.invoices.map((r: any, i: number) => [String(r.id), i] as [string, number]))

  for (const c of plan.create) {
    const b: Billing = c.b
    out.invoices.push({
      id: newId('INV'), ...c.rec, items: [], status: '確定', locked: true,
      source: 'mf', mfId: String(b.mfId), mfPartnerId: b.partnerId || '', mfUpdatedAt: b.updatedAt || '',
      mfStatus: b.mfStatus || '', note: b.title || '', mfDiff: null,
      confirmStatus: c.auto ? '確定' : '未確認', confirmedAt: c.auto ? now : '', confirmedBy: c.auto ? actor : '',
      createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor,
    })
  }
  for (const u of plan.update) {
    const i = byId.get(String(u.ex.id)); if (i == null) continue
    out.invoices[i] = { ...out.invoices[i], ...u.rec, mfUpdatedAt: u.b.updatedAt || '', mfStatus: u.b.mfStatus || '', mfDiff: null, updatedAt: now, updatedBy: actor }
  }
  for (const d of plan.diff) {
    const i = byId.get(String(d.ex.id)); if (i == null) continue
    const detail: any = {}
    for (const k of d.changed) detail[k] = { finance: d.ex[k] ?? null, mf: (d.rec as any)[k] ?? null }
    out.invoices[i] = { ...out.invoices[i], mfDiff: { at: now, fields: detail }, mfUpdatedAt: d.b.updatedAt || '', updatedAt: now, updatedBy: actor }
  }
  /* 取引先の対応を覚える（次から自動で当たる） */
  if (opts.map) {
    const cos = arr(state, 'companies').slice()
    let touched = false
    for (const b of items) {
      const key = partnerKey(b), cid = opts.map[key]
      if (!cid || cid === '__skip' || !b.partnerId) continue
      const at = cos.findIndex((c: any) => String(c.id) === String(cid))
      if (at < 0) continue
      if (String(cos[at].mfPartnerId || '') !== String(b.partnerId) || String(cos[at].mfPartnerName || '') !== String(b.partnerName || '')) {
        cos[at] = { ...cos[at], mfPartnerId: b.partnerId, mfPartnerName: b.partnerName || '', updatedAt: now, updatedBy: actor }; touched = true
      }
    }
    if (touched) out.companies = cos
  }
  const stats = { 新規: plan.create.length, 更新: plan.update.length, 変更なし: plan.same.length, MF差異: plan.diff.length,
    取引先未対応: plan.unmapped.reduce((s, g) => s + g.n, 0), 下書き除外: plan.drafts, 締め済みで見送り: plan.closed.length }
  return { state: out, plan, stats }
}

/* ---------- 入金（MF 会計の入出金明細 / 銀行CSV → payments）---------- */
export type Txn = { extId: string; date: string; amount: number; payerName?: string; raw?: any; side?: string }

export function planTransactions(state: any, txns: Txn[]) {
  const pays = arr(state, 'payments')
  const seen = new Set(pays.filter((p: any) => p.extId).map((p: any) => String(p.extId)))
  const create: Txn[] = [], dup: Txn[] = [], closed: Txn[] = []
  for (const t of txns) {
    if (!t || !t.extId || !t.date || !num(t.amount)) continue
    if (seen.has(String(t.extId))) { dup.push(t); continue }
    if (isClosedYm(state, ymOf(t.date))) { closed.push(t); continue }
    seen.add(String(t.extId)); create.push(t)
  }
  return { create, dup, closed }
}
export function applyTransactions(state: any, txns: Txn[], opts: { actor?: string; source?: string } = {}) {
  const plan = planTransactions(state, txns)
  const out = { ...state, payments: arr(state, 'payments').slice() }
  const now = new Date().toISOString(), actor = opts.actor || 'mf-sync'
  for (const t of plan.create) {
    const m = matchCompanyByPayer(state, t.payerName)
    out.payments.push({
      id: newId('PAY'), companyId: m.companyId || '', date: dateOnly(t.date), amount: num(t.amount), fee: 0,
      method: '銀行振込', note: '', allocations: [], status: '確定',
      source: opts.source || 'mf', extId: String(t.extId), payerName: String(t.payerName || ''), raw: t.raw || null,
      matchType: '', createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor,
    })
  }
  return { state: out, plan, stats: { 新規: plan.create.length, 取込済み: plan.dup.length, 締め済みで見送り: plan.closed.length } }
}

/** 振込名義 → 取引先。companies.bankPayerNames[] に覚えた名義、無ければ会社名で当てる */
export function matchCompanyByPayer(state: any, payerName: any) {
  const p = normPayer(payerName)
  if (!p) return { companyId: '', how: 'none' as const }
  const cos = arr(state, 'companies').filter((c: any) => !c._gone)
  const byName = cos.filter((c: any) => (c.bankPayerNames || []).some((x: any) => normPayer(x) === p))
  if (byName.length === 1) return { companyId: String(byName[0].id), how: 'payer' as const }
  if (byName.length > 1) return { companyId: '', how: 'ambiguous' as const }
  const hits = cos.filter((c: any) => { const n = normPayer(c.kana || c.name); return !!n && (n === p || (p.length >= 4 && (n.startsWith(p) || p.startsWith(n)))) })
  if (hits.length === 1) return { companyId: String(hits[0].id), how: 'name' as const }
  return { companyId: '', how: hits.length ? 'ambiguous' as const : 'none' as const }
}

/* ---------- 自動消込 ----------
   ★ 迷ったら「消さない」。当てずっぽうで消し込むと、あとで誰も追えなくなる。 */
export const FEE_CANDIDATES = [550, 660, 770, 880, 990, 440, 330, 220, 110]
const DUE_BEFORE = 45, DUE_AFTER = 15      // 期日が入金日の −45日〜+15日 のものを候補にする

const addDays = (ds: string, n: number) => { const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
export const invoiceBalance = (state: any, inv: any) => {
  const total = num(inv.total)
  const paid = arr(state, 'payments').filter((p: any) => p.status !== '取消')
    .reduce((s: number, p: any) => s + (p.allocations || []).filter((a: any) => String(a.invoiceId) === String(inv.id)).reduce((t: number, a: any) => t + num(a.amount), 0), 0)
  return total - paid
}

export type MatchResult = { paymentId: string; companyId: string; matchType: 'exact' | 'fee' | 'multi' | 'none'
  allocations: { invoiceId: string; amount: number }[]; fee: number; reason: string }

export function reconcile(state: any, opts: { paymentIds?: string[] } = {}) {
  const invoices = arr(state, 'invoices').filter((i: any) => i.status !== '取消' && i.status !== '作成中' && i.confirmStatus !== '未確認')
  const results: MatchResult[] = []
  const unknownPayer: any[] = []
  const pays = arr(state, 'payments').filter((p: any) => p.status !== '取消'
    && (!opts.paymentIds || opts.paymentIds.includes(String(p.id))))
  /* この計算の中だけで使う残高表（同じ請求書を2件の入金で二重に消さないため） */
  const bal = new Map<string, number>()
  for (const inv of invoices) bal.set(String(inv.id), invoiceBalance(state, inv))

  for (const p of pays) {
    const already = (p.allocations || []).reduce((s: number, a: any) => s + num(a.amount), 0)
    if (already > 0) continue                                    // すでに充ててある入金は触らない
    const companyId = String(p.companyId || '') || matchCompanyByPayer(state, p.payerName).companyId
    if (!companyId) { unknownPayer.push({ paymentId: String(p.id), payerName: p.payerName || '', date: p.date, amount: num(p.amount) }); continue }
    const amount = num(p.amount) + num(p.fee)
    const cands = invoices.filter((i: any) => String(i.companyId) === companyId && (bal.get(String(i.id)) || 0) > 0
      && (!i.dueDate || (i.dueDate >= addDays(dateOnly(p.date), -DUE_BEFORE) && i.dueDate <= addDays(dateOnly(p.date), DUE_AFTER))))
      .sort((a: any, b: any) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')))
    const take = (list: any[], fee = 0): MatchResult => ({
      paymentId: String(p.id), companyId, matchType: fee ? 'fee' : (list.length > 1 ? 'multi' : 'exact'), fee,
      allocations: list.map((i: any) => ({ invoiceId: String(i.id), amount: bal.get(String(i.id)) || 0 })), reason: '',
    })
    // ① 1件ぴったり
    const exact = cands.filter((i: any) => (bal.get(String(i.id)) || 0) === amount)
    if (exact.length === 1) { results.push(take([exact[0]])); bal.set(String(exact[0].id), 0); continue }
    // ② 1件・振込手数料ぶんだけ不足
    const fee = cands.map((i: any) => ({ i, d: (bal.get(String(i.id)) || 0) - amount })).filter(x => FEE_CANDIDATES.includes(x.d))
    if (exact.length === 0 && fee.length === 1) {
      const r = take([fee[0].i], fee[0].d); r.allocations = [{ invoiceId: String(fee[0].i.id), amount }]
      results.push(r); bal.set(String(fee[0].i.id), (bal.get(String(fee[0].i.id)) || 0) - amount); continue
    }
    // ③ 同じ会社の複数（最大4件）の合計がぴったり
    const multi = subsetSum(cands.map((i: any) => ({ id: String(i.id), v: bal.get(String(i.id)) || 0 })), amount, 4)
    if (exact.length === 0 && fee.length === 0 && multi) {
      const list = multi.map(id => cands.find((i: any) => String(i.id) === id))
      results.push(take(list)); multi.forEach(id => bal.set(id, 0)); continue
    }
    results.push({ paymentId: String(p.id), companyId, matchType: 'none', allocations: [], fee: 0,
      reason: exact.length > 1 ? '同じ金額の請求書が複数あります' : (cands.length ? '金額が請求書と一致しません' : '期日が近い未回収の請求書がありません') })
  }
  return { results, matched: results.filter(r => r.matchType !== 'none'), none: results.filter(r => r.matchType === 'none'), unknownPayer }
}
/** 合計がぴったりになる組み合わせ（小さい方から・最大 max 件）。無ければ null */
function subsetSum(items: { id: string; v: number }[], target: number, max: number): string[] | null {
  const list = items.filter(x => x.v > 0 && x.v <= target).slice(0, 12)
  const found: string[][] = []
  const walk = (start: number, rest: number, pick: string[]) => {
    if (found.length) return
    if (rest === 0 && pick.length > 1) { found.push(pick.slice()); return }
    if (pick.length >= max || rest < 0) return
    for (let i = start; i < list.length; i++) { pick.push(list[i].id); walk(i + 1, rest - list[i].v, pick); pick.pop(); if (found.length) return }
  }
  walk(0, target, [])
  return found[0] || null
}

export function applyReconcile(state: any, res: { results: MatchResult[] }, opts: { actor?: string } = {}) {
  const out = { ...state, payments: arr(state, 'payments').slice() }
  const now = new Date().toISOString(), actor = opts.actor || 'mf-sync'
  const byId = new Map<string, number>(out.payments.map((p: any, i: number) => [String(p.id), i] as [string, number]))
  let n = 0
  for (const r of res.results) {
    if (r.matchType === 'none' || !r.allocations.length) continue
    const i = byId.get(r.paymentId); if (i == null) continue
    out.payments[i] = { ...out.payments[i], companyId: out.payments[i].companyId || r.companyId,
      allocations: r.allocations, fee: r.fee ? num(out.payments[i].fee) + r.fee : num(out.payments[i].fee),
      matchType: r.matchType, matchedAt: now, updatedAt: now, updatedBy: actor }
    n++
  }
  return { state: out, stats: { 自動消込: n, 要確認: res.results.filter(r => r.matchType === 'none').length } }
}

/* ---------- 突合（Finance の売掛残高 ⇔ MF 会計の試算表）---------- */
export function arBalanceAt(state: any, ym: string) {
  const end = ym + '-99'
  const billed = arr(state, 'invoices').filter((i: any) => i.status !== '取消' && i.status !== '作成中' && ymOf(i.bookMonth) <= ym)
    .reduce((s: number, i: any) => s + num(i.total), 0)
  const recv = arr(state, 'payments').filter((p: any) => p.status !== '取消' && dateOnly(p.date) <= end)
    .reduce((s: number, p: any) => s + num(p.amount) + num(p.fee), 0)
  return billed - recv
}
export function reconciliation(state: any, ym: string, mfAr: number | null) {
  const finance = arBalanceAt(state, ym)
  const invs = arr(state, 'invoices').filter((i: any) => i.status !== '取消' && i.status !== '作成中' && ymOf(i.bookMonth) <= ym)
  const suspects = {
    未確認: invs.filter((i: any) => i.confirmStatus === '未確認').map(slim),
    MF差異: invs.filter((i: any) => i.mfDiff).map(slim),
    取引先未設定: invs.filter((i: any) => !i.companyId).map(slim),
    未消込の入金: arr(state, 'payments').filter((p: any) => p.status !== '取消' && ymOf(p.date) <= ym
      && !(p.allocations || []).length).map((p: any) => ({ id: p.id, date: p.date, amount: num(p.amount), payerName: p.payerName || '' })),
  }
  return { ym, finance, mf: mfAr, diff: mfAr == null ? null : finance - mfAr, ok: mfAr != null && finance - mfAr === 0, suspects }
}
const slim = (i: any) => ({ id: i.id, no: i.no || '', companyId: i.companyId || '', bookMonth: i.bookMonth, total: num(i.total), confirmStatus: i.confirmStatus || '' })

/* ---------- 経理へ渡す「消込一覧」 ---------- */
export function settlementRows(state: any, ym: string) {
  const inv = new Map(arr(state, 'invoices').map((i: any) => [String(i.id), i]))
  const co = new Map(arr(state, 'companies').map((c: any) => [String(c.id), c]))
  const rows: any[][] = [['入金日', '振込名義', '入金額', '振込手数料', 'MF取引ID', '取引先', '請求書番号', '請求日', '請求額', '充当額', '消込方法', '備考']]
  for (const p of arr(state, 'payments').filter((p: any) => p.status !== '取消' && ymOf(p.date) === ym)
    .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)))) {
    const als = (p.allocations || [])
    if (!als.length) { rows.push([p.date, p.payerName || '', num(p.amount), num(p.fee), p.extId || '', co.get(String(p.companyId))?.name || '', '', '', '', '', '未消込', p.note || '']); continue }
    als.forEach((a: any, k: number) => {
      const i: any = inv.get(String(a.invoiceId)) || {}
      rows.push([k ? '' : p.date, k ? '' : (p.payerName || ''), k ? '' : num(p.amount), k ? '' : num(p.fee), k ? '' : (p.extId || ''),
        co.get(String(i.companyId || p.companyId))?.name || '', i.no || '', i.issueDate || '', num(i.total), num(a.amount),
        k ? '' : (p.matchType || '手動'), k ? '' : (p.note || '')])
    })
  }
  return rows
}

/* ---------- 試算表（MF 会計）----------
   ★ 予実の実績は今までどおり 伝票から計算します。試算表は「突合のための外の数字」として
     別に置くだけ（trialBalance）。二重計上を避けるため、費用を上書きしません。 */
export type TbRow = { code?: string; name: string; amount: number; kind?: string }
export function applyTrialBalance(state: any, ym: string, rows: TbRow[], opts: { actor?: string; source?: string } = {}) {
  const now = new Date().toISOString(), actor = opts.actor || 'mf-sync'
  const keep = arr(state, 'trialBalance').filter((r: any) => String(r.ym) !== String(ym))
  const add = rows.filter(r => r && (r.name || r.code)).map(r => ({
    id: newId('TB'), ym, code: String(r.code || ''), name: String(r.name || ''), amount: num(r.amount), kind: r.kind || '',
    source: opts.source || 'mf', createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor,
  }))
  return { state: { ...state, trialBalance: keep.concat(add) }, stats: { 科目: add.length, 対象月: ym } }
}
export function tbArAmount(state: any, ym: string): number | null {
  const rows = arr(state, 'trialBalance').filter((r: any) => String(r.ym) === String(ym))
  const hit = rows.find((r: any) => String(r.name).includes('売掛金') || String(r.code) === '1130' || String(r.code) === '135')
  return hit ? num(hit.amount) : null
}

/* ---------- CSV ----------
   見出しで列を決める（出力の設定で順番が変わるため）。Shift_JIS は呼ぶ側で直してから渡す。 */
export function csvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', q = false
  const s = String(text || '').replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) { if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++ } else if (ch === '"') q = false; else cell += ch }
    else if (ch === '"') q = true
    else if (ch === ',' || ch === '\t') { row.push(cell); cell = '' }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (ch !== '\r') cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(c => String(c).trim() !== ''))
}
const colOf = (head: string[], names: string[]) => {
  for (const n of names) { const i = head.findIndex(h => h === n.normalize('NFKC')); if (i >= 0) return i }
  for (const n of names) { const i = head.findIndex(h => h.includes(n.normalize('NFKC'))); if (i >= 0) return i }
  return -1
}
const jpDate = (v: any) => { const m = String(v || '').trim().match(/^(\d{4})[\/\-年.](\d{1,2})[\/\-月.](\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '' }

/** MF 請求書の一覧 CSV → Billing[] */
export function parseBillingCsv(text: string): { items?: Billing[]; error?: string } {
  const rows = csvRows(text); if (rows.length < 2) return { error: 'CSV に行がありません。' }
  const head = rows[0].map(h => String(h).trim().normalize('NFKC'))
  const C = {
    id: colOf(head, ['ID', '請求書ID', 'id']), number: colOf(head, ['請求書番号', '請求番号', 'billing_number']),
    partnerId: colOf(head, ['取引先ID', 'partner_id']), partner: colOf(head, ['取引先名', '取引先', '請求先', 'partner_name']),
    billingDate: colOf(head, ['請求日', '発行日', 'billing_date']), salesDate: colOf(head, ['売上計上日', '計上日', 'sales_date']),
    dueDate: colOf(head, ['お支払期限', '支払期限', '入金期日', '支払期日', 'due_date']),
    total: colOf(head, ['合計金額', '請求金額', '合計', '税込金額', 'total_price']),
    subtotal: colOf(head, ['小計', '小計金額', '税抜金額', 'subtotal_price']),
    status: colOf(head, ['ステータス', '状態', 'status']),
  }
  const miss = [['取引先名', C.partner], ['請求日', C.billingDate], ['合計金額', C.total]].filter(x => (x[1] as number) < 0).map(x => x[0])
  if (miss.length) return { error: `CSV に必要な列が見つかりません：${miss.join('・')}（見つかった見出し：${head.slice(0, 12).join(' / ')}）` }
  const v = (r: string[], i: number) => i >= 0 ? String(r[i] ?? '').trim() : ''
  const items = rows.slice(1).map(r => ({
    mfId: v(r, C.id), number: v(r, C.number), partnerId: v(r, C.partnerId), partnerName: v(r, C.partner),
    billingDate: jpDate(v(r, C.billingDate)), salesDate: jpDate(v(r, C.salesDate)), dueDate: jpDate(v(r, C.dueDate)),
    total: num(v(r, C.total)), subtotal: C.subtotal >= 0 && v(r, C.subtotal) !== '' ? num(v(r, C.subtotal)) : null,
    mfStatus: v(r, C.status), isLocked: /ロック中/.test(v(r, C.status)),
  } as Billing)).filter(x => x.partnerName && (x.billingDate || x.salesDate) && x.total)
  items.forEach(x => { if (!x.mfId) x.mfId = x.number ? 'csvno:' + normName(x.partnerName) + ':' + x.number : `csv:${normName(x.partnerName)}:${x.billingDate}:${x.total}` })
  return items.length ? { items } : { error: '取り込める行がありませんでした（取引先名・請求日・合計金額 が要ります）。' }
}

/** 銀行 / MF 会計 の入出金明細 CSV → Txn[]（入金だけ） */
export function parseBankCsv(text: string): { items?: Txn[]; error?: string } {
  const rows = csvRows(text); if (rows.length < 2) return { error: 'CSV に行がありません。' }
  const head = rows[0].map(h => String(h).trim().normalize('NFKC'))
  const C = {
    id: colOf(head, ['ID', '取引ID', 'transaction_id', '明細ID']),
    date: colOf(head, ['取引日', '日付', '入金日', '振込日', 'transaction_date', '日時']),
    content: colOf(head, ['内容', '摘要', '取引内容', '振込依頼人', '振込人名', 'content', '備考']),
    income: colOf(head, ['入金金額', 'お預り金額', '入金', '預入金額', '入金額', '金額(円)']),
    amount: colOf(head, ['金額', 'value', 'amount']),
    side: colOf(head, ['入出金区分', 'side', '区分']),
  }
  const miss = [['日付', C.date], ['金額', C.income >= 0 ? C.income : C.amount]].filter(x => (x[1] as number) < 0).map(x => x[0])
  if (miss.length) return { error: `CSV に必要な列が見つかりません：${miss.join('・')}（見つかった見出し：${head.slice(0, 12).join(' / ')}）` }
  const v = (r: string[], i: number) => i >= 0 ? String(r[i] ?? '').trim() : ''
  const items: Txn[] = []
  rows.slice(1).forEach((r, k) => {
    const date = jpDate(v(r, C.date)); if (!date) return
    let amount = C.income >= 0 ? num(v(r, C.income)) : num(v(r, C.amount))
    const side = v(r, C.side)
    if (C.income < 0 && side && /出金|支出|EXPENSE/i.test(side)) return
    if (amount < 0) return                                   // 出金の行（マイナス）は入金ではない
    if (!amount) return
    const payerName = v(r, C.content)
    const extId = v(r, C.id) || `csv:${date}:${amount}:${normPayer(payerName) || k}`
    items.push({ extId, date, amount, payerName, side: 'INCOME', raw: null })
  })
  return items.length ? { items } : { error: '入金の行が見つかりませんでした（日付・入金金額の列をご確認ください）。' }
}

/** MF 会計 の試算表 CSV → TbRow[] */
export function parseTrialBalanceCsv(text: string): { items?: TbRow[]; error?: string } {
  const rows = csvRows(text); if (rows.length < 2) return { error: 'CSV に行がありません。' }
  const head = rows[0].map(h => String(h).trim().normalize('NFKC'))
  const C = { code: colOf(head, ['勘定科目コード', '科目コード', 'code']), name: colOf(head, ['勘定科目', '科目', '勘定科目名', 'name']),
    amount: colOf(head, ['期末残高', '残高', '当月残高', '金額', 'amount', '合計']) }
  if (C.name < 0 || C.amount < 0) return { error: `CSV に「勘定科目」と「残高（金額）」の列が要ります（見つかった見出し：${head.slice(0, 12).join(' / ')}）` }
  const v = (r: string[], i: number) => i >= 0 ? String(r[i] ?? '').trim() : ''
  const items = rows.slice(1).map(r => ({ code: v(r, C.code), name: v(r, C.name), amount: num(v(r, C.amount)) })).filter(x => x.name)
  return items.length ? { items } : { error: '取り込める行がありませんでした。' }
}
