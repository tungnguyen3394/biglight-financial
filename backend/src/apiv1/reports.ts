/* ============================================================================
   まとめの数字 — REST（/api/v1/reports/*）と MCP のツールが「同じ関数」を呼ぶ
   ----------------------------------------------------------------------------
   なぜ1か所にまとめるか: 同じ問いに二つの答えが出ないようにするため。
   「未回収はいくら？」を AI と Power Automate が別々に計算していたら、必ずいつか食い違う。
   計算そのものは finance.ts（= web/index.html ⑦ と同じ式）にある。ここは並べ方だけ。
   ============================================================================ */
import * as F from './finance'

const brief = (st: any, companyId: any) => ({ id: companyId || null, name: F.companyName(st, companyId) || null })

/* ───────── 予実（損益） ───────── */
export function plReport(st: any, fy: number) {
  const act = F.plBook(st, fy, 'actual'), bud = F.plBook(st, fy, 'budget'), fc = F.plBook(st, fy, 'forecast')
  const prev = F.plBook(st, fy - 1, 'actual')
  const i = F.lastActualIdx(st, fy)
  const keys: (keyof F.PlBook)[] = ['revenue', 'cogs', 'gross', 'sga', 'operating', 'nonop', 'ordinary']
  const LABEL: Record<string, string> = { revenue: '売上高', cogs: '売上原価', gross: '売上総利益', sga: '販管費', operating: '営業利益', nonop: '営業外収支', ordinary: '経常利益' }
  const lines = keys.map(k => ({
    key: k, label: LABEL[k],
    month_actual: act[k][i] || 0, month_budget: bud[k][i] || 0,
    ytd_actual: F.sumRange(act[k], 0, i), ytd_budget: F.sumRange(bud[k], 0, i), ytd_last_year: F.sumRange(prev[k], 0, i),
    year_budget: F.sum12(bud[k]), year_landing: F.landing(st, fy, k, i),
    monthly_actual: act[k], monthly_budget: bud[k], monthly_forecast: fc[k],
  }))
  const rate = (a: number, b: number) => b ? Math.round(a / b * 1000) / 10 : null
  const rev = lines.find(l => l.key === 'revenue')!
  return {
    fiscal_year: fy, fiscal_year_label: `${fy}年度（${fy}/8〜${fy + 1}/7）`,
    month_index: i, month_label: F.FY_MONTH_LABELS[i], month: F.fyMonths(fy)[i],
    quarter: F.quarterOfIdx(i),
    amounts_are: '税抜（消費税は預り金のため予実に入れない）',
    lines,
    rates: {
      gross_margin_ytd: rate(F.sumRange(act.gross, 0, i), F.sumRange(act.revenue, 0, i)),
      operating_margin_ytd: rate(F.sumRange(act.operating, 0, i), F.sumRange(act.revenue, 0, i)),
      budget_achievement_ytd: rate(F.sumRange(act.revenue, 0, i), F.sumRange(bud.revenue, 0, i)),
      vs_last_year_ytd: rate(F.sumRange(act.revenue, 0, i), F.sumRange(prev.revenue, 0, i)),
    },
    revenue_ytd: rev.ytd_actual,
    note: '売上の実績は請求書から毎回計算、費用の実績は会計事務所の試算表から手入力した数字（actuals）です。計上月（bookMonth）基準・発生主義。',
  }
}

/* ───────── 債権（回収）───────── */
export interface ArOpts { overdueOnly?: boolean; companyId?: string; limit?: number }
export function receivablesReport(st: any, o: ArOpts = {}) {
  const t = F.today()
  const limit = Math.max(1, Math.min(500, Number(o.limit) || 100))
  let open = F.openInvoices(st)
  if (o.companyId) open = open.filter((i: any) => String(i.companyId) === String(o.companyId))
  const overdue = open.filter((i: any) => F.isOverdue(st, i))
  const rows = (o.overdueOnly ? overdue : open)
    .map((i: any) => ({
      id: i.id, no: i.no || '', company: brief(st, i.companyId), book_month: i.bookMonth || null,
      issue_date: i.issueDate || null, due_date: i.dueDate || null,
      total: F.docTotal(i), paid: F.paidOfInvoice(st, i), balance: F.balanceOfInvoice(st, i),
      status: F.invoiceStatus(st, i), aging_bucket: F.agingBucket(i, st),
      effective_due_date: F.effDue(st, i) || null,
      days_overdue: i.dueDate ? F.daysOverdue(st, i) : null,
    }))
    .sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')))

  /* 年齢表（取引先ごと × 区分） */
  const byCo: Record<string, any> = {}
  for (const i of open) {
    const k = String(i.companyId || '-')
    if (!byCo[k]) byCo[k] = { company: brief(st, i.companyId), total: 0, buckets: Object.fromEntries(F.AGING_BUCKETS.map(b => [b, 0])), oldest_due_date: '' }
    const bal = F.balanceOfInvoice(st, i)
    byCo[k].total += bal
    byCo[k].buckets[F.agingBucket(i, st)] += bal
    if (i.dueDate && (!byCo[k].oldest_due_date || i.dueDate < byCo[k].oldest_due_date)) byCo[k].oldest_due_date = i.dueDate
  }
  const aging = Object.values(byCo).sort((a: any, b: any) => b.total - a.total)
  const totalsByBucket = Object.fromEntries(F.AGING_BUCKETS.map(b =>
    [b, open.filter((i: any) => F.agingBucket(i, st) === b).reduce((s: number, i: any) => s + F.balanceOfInvoice(st, i), 0)]))

  return {
    as_of: t,
    open_total: open.reduce((s: number, i: any) => s + F.balanceOfInvoice(st, i), 0), open_count: open.length,
    overdue_total: overdue.reduce((s: number, i: any) => s + F.balanceOfInvoice(st, i), 0), overdue_count: overdue.length,
    unapplied_payments: (Array.isArray(st.payments) ? st.payments : []).filter((p: any) => p.status !== '取消')
      .reduce((s: number, p: any) => s + Math.max(0, F.num(p.amount) - (p.allocations || []).reduce((t2: number, a: any) => t2 + F.num(a.amount), 0)), 0),
    aging_buckets: F.AGING_BUCKETS, aging_totals: totalsByBucket, aging_by_company: aging,
    returned: Math.min(rows.length, limit), total_rows: rows.length, items: rows.slice(0, limit),
    note: '入金は売上（予実）を動かしません。売掛金の残高が減るだけです。',
  }
}

/* ───────── 債務（売上原価・費用の支払）───────── */
export interface ApOpts { dueWithinDays?: number; overdueOnly?: boolean; companyId?: string; limit?: number }
export function payablesReport(st: any, o: ApOpts = {}) {
  const t = F.today()
  const limit = Math.max(1, Math.min(500, Number(o.limit) || 100))
  const within = o.dueWithinDays == null ? 30 : Math.max(0, Math.min(365, Number(o.dueWithinDays)))
  const until = F.addDays(t, within)
  let open = F.openBills(st)
  if (o.companyId) open = open.filter((b: any) => String(b.companyId) === String(o.companyId))
  const overdue = open.filter((b: any) => F.isOverdue(st, b))
  const rows = open
    .filter((b: any) => o.overdueOnly ? F.isOverdue(st, b) : (!b.dueDate || F.effDue(st, b) <= until))
    .map((b: any) => ({
      id: b.id, no: b.no || '', company: brief(st, b.companyId), book_month: b.bookMonth || null,
      received_date: b.recvDate || null, due_date: b.dueDate || null,
      total: F.docTotal(b), paid: F.paidOfBill(st, b), balance: F.balanceOfBill(st, b),
      status: F.billStatus(st, b),
      effective_due_date: F.effDue(st, b) || null,
      days_overdue: F.daysOverdue(st, b),
      accounts: (b.items || []).map((it: any) => ({ code: it.accountCode || null, label: F.accountLabel(st, it.accountCode), kind: F.accountKind(st, it.accountCode), amount: F.itemAmount(it) })),
    }))
    .sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')))

  /* 「売上原価（cogs）」だけの合計 — 売って払う原価がいくら残っているか */
  const cogsOpen = open.reduce((s: number, b: any) =>
    s + (b.items || []).filter((it: any) => F.accountKind(st, it.accountCode) === 'cogs').reduce((t2: number, it: any) => t2 + F.itemAmount(it), 0), 0)

  return {
    as_of: t,
    open_total: open.reduce((s: number, b: any) => s + F.balanceOfBill(st, b), 0), open_count: open.length,
    overdue_total: overdue.reduce((s: number, b: any) => s + F.balanceOfBill(st, b), 0), overdue_count: overdue.length,
    due_within_days: within,
    due_soon_total: open.filter((b: any) => { const d = F.effDue(st, b); return d && d >= t && d <= until }).reduce((s: number, b: any) => s + F.balanceOfBill(st, b), 0),
    cost_of_sales_in_open_bills: cogsOpen,
    returned: Math.min(rows.length, limit), total_rows: rows.length, items: rows.slice(0, limit),
    note: '支払は費用（予実）を動かしません。買掛金の残高が減るだけです。費用に効くのは計上月です。',
  }
}

/* ───────── 資金繰り ───────── */
export function cashflowReport(st: any, mode: 'week' | 'month', periods: number) {
  const n = Math.max(1, Math.min(52, Number(periods) || 12))
  const start = F.num(st && st.settings && st.settings.cashStart)
  const rows = mode === 'month' ? F.cashPlanByMonth(st, F.thisMonth(), n) : F.cashPlanByWeek(st, n)
  let run = start
  const items = rows.map((r: any) => {
    run += r.net
    return Object.assign({}, r, { running_balance: run })
  })
  return { mode, periods: n, starting_balance: start, items,
    lowest_balance: items.reduce((m: number, x: any) => Math.min(m, x.running_balance), start),
    note: '入るお金＝未回収の請求の入金期日、出るお金＝未払の支払期日。通帳の開始残高は 設定 で入れます。' }
}

/* ───────── 取引先1社の口座（売掛・買掛の両方）───────── */
export function companyAccount(st: any, companyId: string) {
  const c = (Array.isArray(st.companies) ? st.companies : []).find((x: any) => String(x.id) === String(companyId))
  if (!c) return null
  const inv = (Array.isArray(st.invoices) ? st.invoices : []).filter((i: any) => String(i.companyId) === String(companyId))
  const bills = (Array.isArray(st.bills) ? st.bills : []).filter((b: any) => String(b.companyId) === String(companyId))
  const pays = (Array.isArray(st.payments) ? st.payments : []).filter((p: any) => String(p.companyId) === String(companyId))
  const outs = (Array.isArray(st.payouts) ? st.payouts : []).filter((p: any) => String(p.companyId) === String(companyId))
  return {
    company: { id: c.id, name: c.name || '', kind: c.kind || null, closing_day: c.closingDay ?? null, pay_site_months: c.paySite ?? null, pay_day: c.payDay ?? null },
    ar_balance: F.arBalanceOf(st, companyId), ap_balance: F.apBalanceOf(st, companyId),
    open_invoices: F.openInvoices(st).filter((i: any) => String(i.companyId) === String(companyId))
      .map((i: any) => ({ id: i.id, no: i.no || '', due_date: i.dueDate || null, balance: F.balanceOfInvoice(st, i), status: F.invoiceStatus(st, i), aging_bucket: F.agingBucket(i, st) })),
    open_bills: F.openBills(st).filter((b: any) => String(b.companyId) === String(companyId))
      .map((b: any) => ({ id: b.id, no: b.no || '', due_date: b.dueDate || null, balance: F.balanceOfBill(st, b), status: F.billStatus(st, b) })),
    recent_payments: pays.slice(-10).reverse().map((p: any) => ({ id: p.id, date: p.date || null, amount: F.num(p.amount), fee: F.num(p.fee), method: p.method || null, applied_to: (p.allocations || []).length })),
    recent_payouts: outs.slice(-10).reverse().map((p: any) => ({ id: p.id, date: p.date || null, amount: F.num(p.amount), method: p.method || null, applied_to: (p.allocations || []).length })),
    invoice_count: inv.length, bill_count: bills.length,
  }
}

/* ───────── 請求書1枚（入金の明細つき）───────── */
export function invoiceDetail(st: any, inv: any) {
  const pays: any[] = []
  for (const p of (Array.isArray(st.payments) ? st.payments : [])) {
    if (p.status === '取消') continue
    for (const a of (p.allocations || [])) {
      if (String(a.invoiceId) !== String(inv.id)) continue
      pays.push({ payment_id: p.id, date: p.date || null, applied_amount: F.num(a.amount), payment_amount: F.num(p.amount), fee: F.num(p.fee), method: p.method || null })
    }
  }
  return {
    id: inv.id, no: inv.no || '', company: brief(st, inv.companyId), book_month: inv.bookMonth || null,
    issue_date: inv.issueDate || null, due_date: inv.dueDate || null,
    total: F.docTotal(inv), net: F.docNet(inv, st), tax_category: (inv.items || []).length ? null : F.docTaxCat(inv, st), paid: F.paidOfInvoice(st, inv), balance: F.balanceOfInvoice(st, inv),
    status: F.invoiceStatus(st, inv), aging_bucket: F.agingBucket(inv, st),
    items: (inv.items || []).map((it: any) => ({ account_code: it.accountCode || null, account_label: F.accountLabel(st, it.accountCode), name: it.name || '', qty: it.qty ?? null, price: it.price ?? null, amount: F.itemAmount(it), tax_category: it.taxCat || null })),
    payments: pays, note: inv.note || null, updated_at: inv.updatedAt || null,
  }
}

/* ───────── 支払請求1枚（支払の明細つき）───────── */
export function billDetail(st: any, bill: any) {
  const outs: any[] = []
  for (const p of (Array.isArray(st.payouts) ? st.payouts : [])) {
    if (p.status === '取消') continue
    for (const a of (p.allocations || [])) {
      if (String(a.billId) !== String(bill.id)) continue
      outs.push({ payout_id: p.id, date: p.date || null, applied_amount: F.num(a.amount), payout_amount: F.num(p.amount), method: p.method || null })
    }
  }
  return {
    id: bill.id, no: bill.no || '', company: brief(st, bill.companyId), book_month: bill.bookMonth || null,
    received_date: bill.recvDate || null, due_date: bill.dueDate || null,
    total: F.docTotal(bill), net: F.docNet(bill, st), paid: F.paidOfBill(st, bill), balance: F.balanceOfBill(st, bill),
    status: F.billStatus(st, bill),
    items: (bill.items || []).map((it: any) => ({ account_code: it.accountCode || null, account_label: F.accountLabel(st, it.accountCode), kind: F.accountKind(st, it.accountCode), name: it.name || '', amount: F.itemAmount(it), tax_category: it.taxCat || null })),
    payouts: outs, note: bill.note || null, updated_at: bill.updatedAt || null,
  }
}
