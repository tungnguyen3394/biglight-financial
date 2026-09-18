/* ============================================================================
   MF 会計 の 試算表（損益）→ 予実の実績（actuals）
   ----------------------------------------------------------------------------
   ★ 2026-09-19 利用者の指示: 予実管理 も 全部の期の「正しい数字」を MF 会計 から取る（売上から費用まで、合計で）。
     四半期ごとの利益が 会計と同じになること。見込 は手で入れる。
   ★ 公式仕様 v3 /reports/trial_balance_pl（start_date / end_date）:
       columns: opening_balance / debit_amount / credit_amount / closing_balance / ratio
       rows: 区分（financial_statement_item・売上高合計 / 売上原価 / 販売費及び一般管理費 / 営業外収益 …）
             › 科目（account, values[]）
     ある月の金額 ＝ closing − opening（closing は期首からの累計なので）。
   ★ MF の科目名 → この システムの勘定科目: 名前が同じ科目があればそれ、無ければ その区分の下に 自動で作る（source:'mf'）。
     一度作った科目は mfNames に MF の名前を覚えるので、こちらで名前を直しても次から同じ科目に入る。
   ★ MF の数字が来た月は、その月の実績は MF だけ（手で入れた実績は置き換える）。MF が正。
   ★ 純粋関数だけ（index.ts が state を読み書きする）。
   ========================================================================== */
export type PlRow = { section: string; name: string; opening: number; debit: number; credit: number; closing: number; amount: number }
const money = (v: any) => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return isFinite(n) ? Math.round(n) : 0 }
const arr = (state: any, k: string): any[] => (Array.isArray(state?.[k]) ? state[k] : [])
const newId = (p: string) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
export const normLabel = (s: any) => String(s || '').normalize('NFKC').replace(/[\s　・,.，。()（）]/g, '').toLowerCase()

/** 試算表（損益）の返り → 科目の行（区分つき） */
export function parsePlReport(j: any): PlRow[] {
  const cols: string[] = (Array.isArray(j?.columns) ? j.columns : []).map((c: any) => String(typeof c === 'string' ? c : (c?.key ?? c?.name ?? '')))
  const at = (vals: any[], key: string, fallback: number) => { const i = cols.findIndex(c => c.includes(key)); const v = vals?.[i >= 0 ? i : fallback]; return money(typeof v === 'object' ? v?.value ?? v?.amount : v) }
  const out: PlRow[] = []
  const walk = (r: any, section: string) => {
    if (!r || typeof r !== 'object') return
    const name = String(r.name ?? r.account_name ?? '')
    const kids = r.rows ?? r.children ?? r.accounts
    const isAccount = r.type === 'account' || (!Array.isArray(kids) && r.type !== 'financial_statement_item')
    if (isAccount && name) {
      const vals = r.values ?? r.amounts ?? []
      const opening = r.opening_balance != null ? money(r.opening_balance) : at(vals, 'opening', 0)
      const debit = r.debit_amount != null ? money(r.debit_amount) : at(vals, 'debit', 1)
      const credit = r.credit_amount != null ? money(r.credit_amount) : at(vals, 'credit', 2)
      const closing = r.closing_balance != null ? money(r.closing_balance) : at(vals, 'closing', 3)
      out.push({ section, name, opening, debit, credit, closing, amount: closing - opening })
    }
    if (Array.isArray(kids)) kids.forEach((k: any) => walk(k, section || name))
  }
  const top = Array.isArray(j?.rows) ? j.rows : (Array.isArray(j?.data) ? j.data : [])
  top.forEach((r: any) => walk(r, ''))
  return out
}
/** 区分名 → この システムの区分。営業外・特別・税金 は「営業外収支」に（費用は マイナス） */
export function sectionKind(section: string, name = ''): { kind: 'revenue' | 'cogs' | 'sga' | 'nonop' | ''; sign: 1 | -1 } {
  const s = section + ' ' + name
  if (/売上高|売上合計|営業収益/.test(section)) return { kind: 'revenue', sign: 1 }
  if (/売上原価|製造原価|仕入/.test(section)) return { kind: 'cogs', sign: 1 }
  if (/販売費|一般管理|販管/.test(section)) return { kind: 'sga', sign: 1 }
  if (/営業外収益|特別利益/.test(section)) return { kind: 'nonop', sign: 1 }
  if (/営業外費用|特別損失|法人税|税等/.test(section)) return { kind: 'nonop', sign: -1 }
  if (/利益|損失|所得/.test(s)) return { kind: '', sign: 1 }     // 合計行（営業利益 など）は科目ではない
  return { kind: '', sign: 1 }
}
const KIND_PREFIX: Record<string, string> = { revenue: '4', cogs: '5', sga: '6', nonop: '7' }
const kindOf = (accounts: any[], a: any): string => {
  let cur = a, guard = 0
  while (cur && !cur.kind && cur.parentId && guard++ < 12) cur = accounts.find(x => String(x.id) === String(cur.parentId))
  return cur && cur.kind ? String(cur.kind) : ''
}
/** MF の科目名 → 勘定科目コード。無ければ作る（accounts を書き換えて返す） */
export function mapAccount(accounts: any[], kind: string, name: string, stamp: any): { code: string; created: boolean } {
  const n = normLabel(name)
  /* 末端の科目を先に（大分類「売上高」と 科目「売上高」が同じ名前のことがある。数字は末端に入れる） */
  const isLeaf = (a: any) => !accounts.some(x => x && String(x.parentId || '') === String(a.id))
  const live = accounts.filter(a => a && a.active !== false).sort((a, b) => Number(isLeaf(b)) - Number(isLeaf(a)))
  const hit = live.find(a => (a.mfNames || []).some((x: any) => normLabel(x) === n))
    || live.find(a => normLabel(a.label) === n && (!kindOf(accounts, a) || kindOf(accounts, a) === kind))
    || live.find(a => normLabel(a.label) === n)
  if (hit) {
    if (!(hit.mfNames || []).some((x: any) => normLabel(x) === n)) { const i = accounts.indexOf(hit); accounts[i] = { ...hit, mfNames: [...(hit.mfNames || []), name], ...stamp } }
    return { code: String(hit.code), created: false }
  }
  const root = live.find(a => !a.parentId && String(a.kind) === kind)
  const used = new Set(accounts.map(a => String(a.code)))
  let code = ''
  for (let n2 = 800; n2 < 1000 && !code; n2++) { const c = KIND_PREFIX[kind] + String(n2).padStart(3, '0'); if (!used.has(c)) code = c }
  if (!code) code = KIND_PREFIX[kind] + 'x' + Date.now().toString(36).slice(-4)
  const order = 800 + accounts.filter(a => kindOf(accounts, a) === kind).length
  accounts.push({ id: newId('AC'), code, label: name, kind: root ? '' : kind, parentId: root ? String(root.id) : '', source: 'mf', mfNames: [name],
    active: true, order, createdAt: stamp.updatedAt, createdBy: stamp.updatedBy, ...stamp })
  return { code, created: true }
}
export const FY_START_MONTH = 8
const fyOfYm = (ym: string) => { const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)); return m >= FY_START_MONTH ? y : y - 1 }
const mIndexOf = (ym: string) => (Number(ym.slice(5, 7)) - FY_START_MONTH + 12) % 12

/** ある月の試算表を 実績（actuals）に写す。その月の実績は MF だけになる。 */
export function applyPl(state: any, ym: string, rows: PlRow[], opts: { actor?: string } = {}) {
  const now = new Date().toISOString(), actor = opts.actor || 'mf-sync', stamp = { updatedAt: now, updatedBy: actor }
  const fy = fyOfYm(ym), mi = mIndexOf(ym)
  const accounts = arr(state, 'accounts').slice()
  const hadTree = accounts.length > 0
  const created: string[] = [], skipped: string[] = []
  const sums = new Map<string, number>()
  for (const r of rows) {
    const k = sectionKind(r.section, r.name)
    if (!k.kind) { if (r.amount) skipped.push(r.section + '/' + r.name); continue }
    if (!r.amount) continue
    const { code, created: c } = mapAccount(accounts, k.kind, r.name, stamp)
    if (c) created.push(r.name)
    sums.set(code, (sums.get(code) || 0) + r.amount * k.sign)
  }
  const before = arr(state, 'actuals')
  const keep = before.filter((a: any) => !(Number(a.fy) === fy && Number(a.mIndex) === mi))
  const replacedManual = before.length - keep.length - before.filter((a: any) => Number(a.fy) === fy && Number(a.mIndex) === mi && a.source === 'mf').length
  const prevById = new Map(before.filter((a: any) => Number(a.fy) === fy && Number(a.mIndex) === mi && a.source === 'mf').map((a: any) => [String(a.accountCode), a]))
  const add: any[] = []
  for (const [code, amount] of sums) {
    const prev: any = prevById.get(code)
    if (prev && Number(prev.amount) === amount) { add.push(prev); continue }
    add.push({ id: prev ? prev.id : newId('AT'), fy, mIndex: mi, ym, accountCode: code, amount, source: 'mf', createdAt: prev ? prev.createdAt : now, createdBy: prev ? prev.createdBy : actor, ...stamp })
  }
  const revenue = [...sums.entries()].filter(([c]) => kindOf(accounts, accounts.find(a => String(a.code) === c)) === 'revenue').reduce((s, [, v]) => s + v, 0)
  const cost = [...sums.values()].reduce((s, v) => s + v, 0) - revenue
  return {
    state: { ...state, actuals: keep.concat(add), ...(hadTree || created.length ? { accounts } : {}) },
    stats: { 対象月: ym, 科目: sums.size, 売上: revenue, 費用: cost, 新しい科目: created.length, 手入力を置き換え: Math.max(0, replacedManual), 読まない行: skipped.length },
    created, skipped,
  }
}
