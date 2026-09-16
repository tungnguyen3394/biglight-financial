/* ============================================================================
   お金の計算 — API v1 / MCP が返す数字の出どころ
   ----------------------------------------------------------------------------
   ★★ ここは web/index.html の「⑦ 計算エンジン」と同じ計算です。
      片方だけ直すと、画面と AI が違う数字を言い出します（公式 §16 の
      「二つの似た規則」）。直したら必ず両方直し、`node test/apiv1.js` を
      通してください。テストは index.html の関数と この関数を同じデータで
      突き合わせ、1円でもずれたら赤になります。

   会計の約束（THIET-KE-YOJITSU.md §4.2 と同じ）:
     ・bookMonth（計上月）が予実を決める。入金日・支払日ではない（発生主義）。
     ・入金／支払は P/L に影響しない。債権・債務の残高を減らすだけ。
     ・売上の実績は保存しない（請求書から毎回計算する）。費用の実績は 試算表から手で入れた actuals。
     ・予実の金額は税抜。消費税は預り金であって儲けではない。
   ============================================================================ */

/* ───────── 会計年度: 8/1〜翌7/31。月配列の index 0 は必ず「8月」 ───────── */
export const FY_START_MONTH = 8
export const FY_MONTH_LABELS = ['8月', '9月', '10月', '11月', '12月', '1月', '2月', '3月', '4月', '5月', '6月', '7月']

export const num = (v: any): number => {
  const n = Number(String(v == null ? '' : v).replace(/[^\d.-]/g, ''))
  return isFinite(n) ? n : 0
}
export const TAX_RATE: Record<string, number> = { '課税10%': 0.10, '軽減8%': 0.08, '非課税': 0, '対象外': 0 }
export const KIND_LABEL: Record<string, string> = { revenue: '収益', cogs: '売上原価', sga: '販管費', nonop: '営業外' }
export const INVOICE_OPEN = ['確定', '一部入金', '延滞']
export const BILL_OPEN = ['確定', '一部支払', '期日超過']

export const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
export const thisMonth = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') }
export const fyOf = (ym: string): number | null => { if (!ym) return null; const [y, m] = String(ym).split('-').map(Number); return m >= FY_START_MONTH ? y : y - 1 }
export const fyMonths = (fy: number): string[] => Array.from({ length: 12 }, (_, i) => {
  const t = FY_START_MONTH + i, y = fy + Math.floor((t - 1) / 12), m = ((t - 1) % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}`
})
export const fyIndexOf = (ym: string): number => { const m = Number(String(ym).split('-')[1]); return (m - FY_START_MONTH + 12) % 12 }
export const quarterOfIdx = (i: number) => Math.floor(i / 3) + 1
export const addMonths = (ym: string, n: number) => { let [y, m] = ym.split('-').map(Number); m += n; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1; return y + '-' + String(m).padStart(2, '0') }
export const addDays = (ds: string, n: number) => { const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
export const daysBetween = (a: string, b: string) => Math.round((+new Date(b + 'T00:00:00') - +new Date(a + 'T00:00:00')) / 86400000)

/* ───────── 営業日（web/index.html と同じ式・テストで突き合わせ） ─────────
   期日が銀行の休業日（土日・祝日・12/31・1/2・1/3）に当たるとき、会社の設定
   （翌営業日／前営業日／そのまま）でずらした日で「遅れ」を判断する。 */
const _JP_HOL = new Map<number, Set<string>>()
const nthMonday = (y: number, m: number, n: number) => 1 + ((8 - new Date(y, m - 1, 1).getDay()) % 7) + (n - 1) * 7
export function jpHolidays(y: number): Set<string> {
  const hit = _JP_HOL.get(y); if (hit) return hit
  const base = new Set<string>()
  const add = (m: number, d: number) => base.add(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  add(1, 1); add(1, nthMonday(y, 1, 2)); add(2, 11)
  if (y >= 2020) add(2, 23)
  add(3, Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4)))
  add(4, 29); add(5, 3); add(5, 4); add(5, 5)
  if (y === 2020) { add(7, 23); add(7, 24); add(8, 10) }
  else if (y === 2021) { add(7, 22); add(7, 23); add(8, 8) }
  else { add(7, nthMonday(y, 7, 3)); add(8, 11); add(10, nthMonday(y, 10, 2)) }
  add(9, nthMonday(y, 9, 3))
  add(9, Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4)))
  add(11, 3); add(11, 23)
  const out = new Set(base)
  Array.from(base).sort().forEach(d => { if (base.has(addDays(d, 2)) && !base.has(addDays(d, 1))) out.add(addDays(d, 1)) })
  Array.from(out).sort().forEach(d => {
    if (new Date(d + 'T00:00:00').getDay() === 0) { let x = addDays(d, 1); while (out.has(x)) x = addDays(x, 1); out.add(x) }
  })
  _JP_HOL.set(y, out)
  return out
}
export function isBankHoliday(ds: string): boolean {
  if (!ds) return false
  const w = new Date(ds + 'T00:00:00').getDay()
  if (w === 0 || w === 6) return true
  const md = ds.slice(5)
  if (md === '12-31' || md === '01-02' || md === '01-03') return true
  return jpHolidays(Number(ds.slice(0, 4))).has(ds)
}
export function effDue(st: any, doc: any): string {
  const d = doc && doc.dueDate; if (!d) return ''
  const c = (Array.isArray(st && st.companies) ? st.companies : []).find((x: any) => String(x.id) === String(doc.companyId))
  const mode = (c && c.dueAdjust) || '翌営業日'
  if (mode === 'そのまま') return d
  const step = mode === '前営業日' ? -1 : 1
  let x = d, guard = 0
  while (isBankHoliday(x) && guard++ < 15) x = addDays(x, step)
  return x
}
export const isOverdue = (st: any, doc: any) => { const e = effDue(st, doc); return !!e && e < today() }
export const daysOverdue = (st: any, doc: any) => { const e = effDue(st, doc); return e ? Math.max(0, daysBetween(e, today())) : 0 }

/* ───────── 勘定科目 ───────── */
export const DEFAULT_ACCOUNTS = [
  { code: '4100', label: '支援委託料', kind: 'revenue' }, { code: '4200', label: '紹介料', kind: 'revenue' },
  { code: '4300', label: '申請・更新手数料', kind: 'revenue' }, { code: '4900', label: 'その他売上', kind: 'revenue' },
  { code: '5100', label: '外注費', kind: 'cogs' }, { code: '5200', label: '通訳・翻訳費', kind: 'cogs' }, { code: '5300', label: '支援業務費', kind: 'cogs' },
  { code: '6100', label: '役員報酬', kind: 'sga' }, { code: '6110', label: '給与手当', kind: 'sga' }, { code: '6120', label: '法定福利費', kind: 'sga' },
  { code: '6200', label: '地代家賃', kind: 'sga' }, { code: '6210', label: '水道光熱費', kind: 'sga' }, { code: '6220', label: '通信費', kind: 'sga' },
  { code: '6300', label: '旅費交通費', kind: 'sga' }, { code: '6310', label: '広告宣伝費', kind: 'sga' }, { code: '6320', label: '接待交際費', kind: 'sga' },
  { code: '6400', label: '支払手数料', kind: 'sga' }, { code: '6410', label: '消耗品費', kind: 'sga' }, { code: '6900', label: 'その他販管費', kind: 'sga' },
  { code: '7100', label: '営業外収益', kind: 'nonop' }, { code: '7200', label: '営業外費用', kind: 'nonop' },
]
export const accounts = (st: any) => (st && Array.isArray(st.accounts) && st.accounts.length) ? st.accounts : DEFAULT_ACCOUNTS
export const accountLabel = (st: any, code: any) => { const a = accounts(st).find((x: any) => x.code === code); return a ? a.label : (code || '-') }
export const accountKind = (st: any, code: any) => { const a = accounts(st).find((x: any) => x.code === code); return a ? a.kind : '' }

const arr = (st: any, k: string): any[] => Array.isArray(st && st[k]) ? st[k] : []
export const companyName = (st: any, id: any) => { const c = arr(st, 'companies').find((x: any) => String(x.id) === String(id)); return c ? String(c.name || '') : '' }

/* ───────── 明細 → 金額 ───────── */
export function itemAmount(it: any): number {
  if (!it) return 0
  if (it.amount != null && it.amount !== '') return num(it.amount)
  return Math.round(num(it.qty == null ? 1 : it.qty) * num(it.price || 0))
}
export const itemsSubtotal = (items: any[]) => (items || []).reduce((s, it) => s + itemAmount(it), 0)
export const itemsTax = (items: any[]) => (items || []).reduce((s, it) => s + Math.floor(itemAmount(it) * (TAX_RATE[it.taxCat || '課税10%'] || 0)), 0)
/** 税込合計 */
export function docTotal(doc: any): number {
  if (!doc) return 0
  if (Array.isArray(doc.items) && doc.items.length) return itemsSubtotal(doc.items) + itemsTax(doc.items)
  return num(doc.total)
}
/** 明細の無い伝票の税区分: 伝票に付いた税区分 → 取引先の税区分 → 課税10%（web/index.html の docTaxCat と同じ） */
export function docTaxCat(doc: any, st?: any): string {
  if (doc && TAX_RATE[doc.taxCat] != null) return String(doc.taxCat)
  const c = st && doc ? arr(st, 'companies').find((x: any) => String(x.id) === String(doc.companyId)) : null
  if (c && TAX_RATE[c.taxCat] != null) return String(c.taxCat)
  return '課税10%'
}
/** 税抜合計（予実はこちら） */
export function docNet(doc: any, st?: any): number {
  if (!doc) return 0
  if (Array.isArray(doc.items) && doc.items.length) return itemsSubtotal(doc.items)
  // Money Forward 等から取り込んだ請求は 税抜（subtotal）を持っている → それを使う（web/index.html と同じ式）
  if (doc.subtotal != null && doc.subtotal !== '') return num(doc.subtotal)
  /* ★ 2026-09-16: 以前は いつも ÷1.1。非課税・対象外の請求まで税を抜いていた → 税区分で割る */
  return Math.round(num(doc.total) / (1 + (TAX_RATE[docTaxCat(doc, st)] || 0)))
}
export const ymOfDoc = (d: any) => String((d && d.bookMonth) || '').slice(0, 7)

/* ───────── 債権（売掛金）— 回収 ───────── */
export function paidOfInvoice(st: any, inv: any): number {
  let s = 0
  arr(st, 'payments').forEach((p: any) => {
    if (p.status === '取消') return
    ;(p.allocations || []).forEach((a: any) => { if (String(a.invoiceId) === String(inv.id)) s += num(a.amount) })
  })
  return s
}
export const balanceOfInvoice = (st: any, inv: any) => docTotal(inv) - paidOfInvoice(st, inv)
/** 状態は保存された値ではなく事実から決める（押し忘れで実態とズレない） */
export function invoiceStatus(st: any, inv: any): string {
  if (inv.status === '取消' || inv.status === '作成中') return inv.status
  const bal = balanceOfInvoice(st, inv)
  if (bal <= 0) return '入金済'
  if (paidOfInvoice(st, inv) > 0) return '一部入金'
  if (isOverdue(st, inv)) return '延滞'
  return '確定'
}
export const openInvoices = (st: any) => arr(st, 'invoices').filter((i: any) => i.status !== '取消' && i.status !== '作成中' && balanceOfInvoice(st, i) > 0)
export const arBalanceOf = (st: any, companyId: any) => openInvoices(st).filter((i: any) => String(i.companyId) === String(companyId)).reduce((s, i) => s + balanceOfInvoice(st, i), 0)
export const arTotal = (st: any) => openInvoices(st).reduce((s, i) => s + balanceOfInvoice(st, i), 0)

export const AGING_BUCKETS = ['未到来', '1〜30日', '31〜60日', '61〜90日', '90日超']
export function agingBucket(inv: any, st?: any): string {
  const e = effDue(st || {}, inv)
  const d = e ? daysBetween(e, today()) : 0
  if (d <= 0) return '未到来'
  if (d <= 30) return '1〜30日'
  if (d <= 60) return '31〜60日'
  if (d <= 90) return '61〜90日'
  return '90日超'
}

/* ───────── 債務（買掛金）— 売上原価・費用の支払 ───────── */
export function paidOfBill(st: any, bill: any): number {
  let s = 0
  arr(st, 'payouts').forEach((p: any) => {
    if (p.status === '取消') return
    ;(p.allocations || []).forEach((a: any) => { if (String(a.billId) === String(bill.id)) s += num(a.amount) })
  })
  return s
}
export const balanceOfBill = (st: any, b: any) => docTotal(b) - paidOfBill(st, b)
export function billStatus(st: any, b: any): string {
  if (b.status === '取消' || b.status === '作成中') return b.status
  const bal = balanceOfBill(st, b)
  if (bal <= 0) return '支払済'
  if (paidOfBill(st, b) > 0) return '一部支払'
  if (isOverdue(st, b)) return '期日超過'
  return '確定'
}
export const openBills = (st: any) => arr(st, 'bills').filter((b: any) => b.status !== '取消' && b.status !== '作成中' && balanceOfBill(st, b) > 0)
export const apBalanceOf = (st: any, companyId: any) => openBills(st).filter((b: any) => String(b.companyId) === String(companyId)).reduce((s, b) => s + balanceOfBill(st, b), 0)
export const apTotal = (st: any) => openBills(st).reduce((s, b) => s + balanceOfBill(st, b), 0)

/* ───────── 予実 ───────── */
export function actualSeries(st: any, fy: number, kind: string): number[] {
  const months = fyMonths(fy)
  const idx: Record<string, number> = {}; months.forEach((m, i) => { idx[m] = i })
  const out = Array(12).fill(0)
  const addTo = (ym: string, amount: number) => { const i = idx[ym]; if (i != null) out[i] += amount }

  if (kind === 'revenue') {
    arr(st, 'invoices').forEach((inv: any) => {
      if (inv.status === '取消') return
      const ym = ymOfDoc(inv); if (idx[ym] == null) return
      ;(inv.items || []).forEach((it: any) => { if (accountKind(st, it.accountCode) === 'revenue') addTo(ym, itemAmount(it)) })
      if (!(inv.items || []).length) addTo(ym, docNet(inv, st))
    })
  } else {
    /* ★ 2026-09-16: 費用の実績は actuals（会計事務所の試算表からの手入力・税抜）だけ。
       支払請求（bills）・費用表（costPlans）は予定であって実績ではない。web/index.html の actualSeries と同じ。 */
    arr(st, 'actuals').forEach((a: any) => {
      if (Number(a.fy) !== Number(fy)) return
      if (accountKind(st, a.accountCode) !== kind) return
      const i = Number(a.mIndex); if (i >= 0 && i < 12) out[i] += num(a.amount)
    })
  }
  /* di sản: 2026-09-16 より前の「実績の調整」。入力はもうできないが、過去の数字を変えないため足し続ける */
  arr(st, 'actualAdjust').forEach((a: any) => {
    if (Number(a.fy) !== Number(fy)) return
    if (accountKind(st, a.accountCode) !== kind) return
    const i = Number(a.mIndex); if (i >= 0 && i < 12) out[i] += num(a.amount)
  })
  return out
}
export function planSeries(st: any, fy: number, kind: string, which: 'budget' | 'forecast'): number[] {
  const src = arr(st, which === 'forecast' ? 'forecasts' : 'budgets')
  const out = Array(12).fill(0)
  src.forEach((b: any) => {
    if (Number(b.fy) !== Number(fy)) return
    if (accountKind(st, b.accountCode) !== kind) return
    const i = Number(b.mIndex); if (i >= 0 && i < 12) out[i] += num(b.amount)
  })
  return out
}
export interface PlBook { revenue: number[]; cogs: number[]; gross: number[]; sga: number[]; operating: number[]; nonop: number[]; ordinary: number[] }
export function plBook(st: any, fy: number, source: 'actual' | 'budget' | 'forecast'): PlBook {
  const g = (k: string) => source === 'actual' ? actualSeries(st, fy, k) : planSeries(st, fy, k, source)
  const revenue = g('revenue'), cogs = g('cogs'), sga = g('sga'), nonop = g('nonop')
  const gross = revenue.map((v, i) => v - cogs[i])
  const operating = gross.map((v, i) => v - sga[i])
  const ordinary = operating.map((v, i) => v + nonop[i])
  return { revenue, cogs, gross, sga, operating, nonop, ordinary }
}
export const sumRange = (a: number[], s: number, e: number) => { let t = 0; for (let i = s; i <= e && i < a.length; i++) t += a[i] || 0; return t }
export const sum12 = (a: number[]) => sumRange(a, 0, 11)

/** 直近で実績のある月（無ければ今月） */
export function lastActualIdx(st: any, fy: number): number {
  const rev = actualSeries(st, fy, 'revenue')
  const cost = ['cogs', 'sga', 'nonop'].map(k => actualSeries(st, fy, k))
  let last = -1
  for (let i = 0; i < 12; i++) if ((rev[i] || 0) !== 0 || cost.some(a => (a[i] || 0) !== 0)) last = i
  if (last >= 0) return last
  const t = thisMonth()
  return fyOf(t) === fy ? fyIndexOf(t) : 0
}
/** 着地見込 = 実績累計 ＋ 残り月（見込があれば見込、無ければ予算） */
export function landing(st: any, fy: number, key: keyof PlBook, uptoIdx: number): number {
  const act = plBook(st, fy, 'actual')[key], bud = plBook(st, fy, 'budget')[key], fc = plBook(st, fy, 'forecast')[key]
  let t = sumRange(act, 0, uptoIdx)
  for (let i = uptoIdx + 1; i < 12; i++) t += (fc[i] || bud[i] || 0)
  return t
}

/* ───────── 資金繰り: 入金予定 − 支払予定 ───────── */
export function cashPlanByMonth(st: any, fromYm: string, months: number) {
  const out: any[] = []
  for (let k = 0; k < months; k++) {
    const ym = addMonths(fromYm, k)
    const inAmt = openInvoices(st).filter((i: any) => effDue(st, i).slice(0, 7) === ym).reduce((s, i) => s + balanceOfInvoice(st, i), 0)
    const outAmt = openBills(st).filter((b: any) => effDue(st, b).slice(0, 7) === ym).reduce((s, b) => s + balanceOfBill(st, b), 0)
    out.push({ ym, in: inAmt, out: outAmt, net: inAmt - outAmt })
  }
  return out
}
export function cashPlanByWeek(st: any, weeks: number) {
  const out: any[] = []
  let start = today()
  const dow = new Date(start + 'T00:00:00').getDay()
  start = addDays(start, -((dow + 6) % 7))   // 月曜起点
  for (let k = 0; k < weeks; k++) {
    const s = addDays(start, k * 7), e = addDays(s, 6)
    const inAmt = openInvoices(st).filter((i: any) => { const d = effDue(st, i); return d && d >= s && d <= e }).reduce((t, i) => t + balanceOfInvoice(st, i), 0)
    const outAmt = openBills(st).filter((b: any) => { const d = effDue(st, b); return d && d >= s && d <= e }).reduce((t, b) => t + balanceOfBill(st, b), 0)
    out.push({ s, e, in: inAmt, out: outAmt, net: inAmt - outAmt })
  }
  return out
}
