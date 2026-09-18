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

/* ---------- 取り込んでよい期（2026-09-19 利用者の指示）----------
   ★「前の期のものを 絶対に 新しい期に入れない」。MF 会計 では新しい期をまだ開いていない。
     以前 自動同期を「前の期の初めから」にしたため 第5期の請求が全部入り、入金の無い 売掛残 として
     第6期に繰り越されて見えてしまった（データの誤り）。
   ★ 取り込むのは「計上月（入金なら入金日）が この期（今日の日本時間で決まる期）の初め 以降」だけ。
     settings.mfImportFrom（YYYY-MM）があれば そちらを使う。
     人が期間を選んでも、自動同期でも、CSV でも同じ（ここ1か所で決める）。 */
export function currentFy(now = Date.now()): number {
  const jst = new Date(now + 9 * 3600_000)
  return jst.getUTCMonth() + 1 >= FY_START_MONTH ? jst.getUTCFullYear() : jst.getUTCFullYear() - 1
}
export function importFromYm(state: any, now = Date.now()): string {
  const s = String(state?.settings?.mfImportFrom || '')
  if (/^\d{4}-\d{2}$/.test(s)) return s
  return currentFy(now) + '-' + String(FY_START_MONTH).padStart(2, '0')
}
export const isBeforeImport = (state: any, ym: any) => { const y = ymOf(ym); return !!y && y < importFromYm(state) }

/* ---------- 取引先の対応づけ ----------
   ★ 2026-09-18 利用者の指示（MF で作った新しいお客さんが 回収 に出てこない問題）:
     ① MF の取引先ID で当たる            → そのまま使う
     ② 名前（表記ゆれを畳んだもの）が 1社だけ同じ → 使う ＋ MF の取引先ID を覚える（次から ①）
     ③ 似た会社がある（名前が含み合う・法人番号・カナが同じ）→ 作らない。「取引先の確認」の待ち行列へ
     ④ 何も似ていない                     → 得意先 を自動で作る（source:'mf'・needsReview）→ 請求は 回収 にすぐ入る
   ★ CRM が 取引先 の正（master）。あとから CRM に同じ会社が来たら、自動で作った会社は CRM の会社になる
     （crmsync.adoptMfCompany）。 */
export type PartnerRef = { partnerId?: string; partnerName?: string; partnerKana?: string; corpNo?: string }
/** 会社の「名前として当ててよい表記」— 会社名・MF の取引先名・人が対応づけたときに覚えた別名 */
export const companyNames = (c: any): string[] =>
  [c?.name, c?.mfPartnerName, ...((Array.isArray(c?.mfAliases) ? c.mfAliases : []))].map(normName).filter(Boolean)
const liveCos = (state: any) => arr(state, 'companies').filter((c: any) => !c._gone)
/** 会社に結びついた MF の取引先ID（MF 側で同じ会社が2つに分かれていることがあるので 複数持てる） */
export const partnerIdsOf = (c: any): string[] =>
  [c?.mfPartnerId, ...(Array.isArray(c?.mfPartnerIds) ? c.mfPartnerIds : [])].map(x => String(x || '')).filter(Boolean)

export function matchCompany(state: any, b: PartnerRef, map?: Record<string, string>) {
  const key = partnerKey(b)
  if (map && map[key]) return { companyId: map[key], how: 'manual' as const, candidates: [] as string[] }
  const skipped = arr(state, 'mfPartnerQueue').find((q: any) => q.key === key && q.status === 'skipped')
  if (skipped) return { companyId: '__skip', how: 'manual' as const, candidates: [] as string[] }
  const cos = liveCos(state)
  if (b.partnerId) { const c = cos.find((x: any) => partnerIdsOf(x).includes(String(b.partnerId))); if (c) return { companyId: String(c.id), how: 'id' as const, candidates: [] as string[] } }
  const n = normName(b.partnerName)
  if (n) {
    const hits = cos.filter((x: any) => companyNames(x).includes(n)
      /* 別の MF 取引先に結びついている会社には、名前が同じでも当てない（1つの MF 取引先 ＝ 1社） */
      && !(b.partnerId && partnerIdsOf(x).length && !partnerIdsOf(x).includes(String(b.partnerId))))
    if (hits.length === 1) return { companyId: String(hits[0].id), how: 'name' as const, candidates: [] as string[] }
    if (hits.length > 1) return { companyId: '', how: 'similar' as const, candidates: hits.map((x: any) => String(x.id)) }
  }
  const sim = similarCompanies(state, b)
  if (sim.length) return { companyId: '', how: 'similar' as const, candidates: sim }
  return { companyId: '', how: 'none' as const, candidates: [] as string[] }
}
export const partnerKey = (b: { partnerId?: string; partnerName?: string }) => b.partnerId ? 'id:' + b.partnerId : 'nm:' + normName(b.partnerName)

/** 「同じ会社かもしれない」相手（自動で作ってはいけない）。
    名前が含み合う（2文字以上）・法人番号が同じ・カナが同じ。迷ったら「似ている」に倒す
    （似ていないのに待ち行列に入る損は 1クリック、似ているのに自動で作る損は 二重の取引先）。 */
export function similarCompanies(state: any, b: PartnerRef): string[] {
  const n = normName(b.partnerName), corp = String(b.corpNo || '').replace(/\D/g, ''), kana = normPayer(b.partnerKana)
  const out: string[] = []
  for (const c of liveCos(state)) {
    const names = companyNames(c)
    const byName = !!n && names.some(x => x.length >= 2 && n.length >= 2 && (x.includes(n) || n.includes(x)))
    const byCorp = corp.length === 13 && String(c.corpNo || '').replace(/\D/g, '') === corp
    const byKana = !!kana && kana.length >= 3 && normPayer(c.kana) === kana
    if (byName || byCorp || byKana) out.push(String(c.id))
  }
  return out
}

/** 1つの MF 取引先ID は 1社だけ。つけるときは ほかの会社から外す（_gone の古い会社に残っていることがある）。 */
export function setPartnerId(cos: any[], at: number, partnerId: string, partnerName: string, stamp: any) {
  let touched = false
  const pid = String(partnerId || '')
  if (pid) cos.forEach((c: any, i: number) => {
    if (i === at || !partnerIdsOf(c).includes(pid)) return
    cos[i] = { ...c, mfPartnerId: String(c.mfPartnerId || '') === pid ? '' : c.mfPartnerId, mfPartnerIds: (c.mfPartnerIds || []).filter((x: any) => String(x) !== pid), ...stamp }
    touched = true
  })
  const cur = cos[at]
  if (pid && partnerIdsOf(cur).includes(pid)) return touched
  if (pid && cur.mfPartnerId) {
    /* もう別の MF 取引先ID を持っている → 追加で持つ（上書きすると 前の ID の請求が迷子になる） */
    cos[at] = { ...cur, mfPartnerIds: [...(cur.mfPartnerIds || []), pid], ...stamp }
    return true
  }
  const nextId = pid || String(cur.mfPartnerId || ''), nextName = String(cur.mfPartnerName || partnerName || '')
  if (String(cur.mfPartnerId || '') === nextId && String(cur.mfPartnerName || '') === nextName) return touched
  cos[at] = { ...cur, mfPartnerId: nextId, mfPartnerName: nextName, ...stamp }
  return true
}

/** MF の取引先から 得意先 を作る（自動のとき needsReview:true ＝「取引先の確認」に出す） */
export function newCompanyFromMf(p: { partnerId?: string; partnerName?: string }, opts: { actor: string; now: string; review: boolean }) {
  return {
    id: newId('CO'), name: String(p.partnerName || '').trim() || '（名前なし）', kind: '得意先', source: 'mf',
    mfPartnerId: p.partnerId || '', mfPartnerName: String(p.partnerName || ''),
    closingDay: 31, paySite: 1, payDay: 31, taxCat: '課税10%', overrides: {},
    needsReview: opts.review, autoCreatedAt: opts.review ? opts.now : '',
    createdAt: opts.now, createdBy: opts.actor, updatedAt: opts.now, updatedBy: opts.actor,
  }
}
/** 待ち行列の id（キーから毎回同じものを作る） */
export const queueId = (key: string) => {
  let h = 5381; for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0
  return 'MPQ-' + h.toString(36) + '-' + key.length.toString(36)
}

/* ---------- 請求書（MF 請求書 → invoices）----------
   鍵は MF の id（mfId）だけ。請求書番号は MF 側で重複することがあるので鍵にしない。 */
export type Billing = {
  mfId: string; number?: string; partnerId?: string; partnerName?: string; title?: string
  billingDate?: string; salesDate?: string; dueDate?: string
  subtotal?: number | null; tax?: number | null; total?: number
  mfStatus?: string; paymentStatus?: string; emailStatus?: string; postingStatus?: string
  isLocked?: boolean; isDownloaded?: boolean; updatedAt?: string
  pdfUrl?: string
  webUrl?: string
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

/** 取り込もうとしている MF の請求が、すでに入っている分より古いか */
export function isStale(b: Billing, ex: any) {
  const eu = Date.parse(String(ex?.mfUpdatedAt || '')), bu = Date.parse(String(b?.updatedAt || ''))
  if (!isFinite(eu)) return false                 // 今ある分に時刻が無い（CSV で入れた）→ 比べられないので 新しい方を採る
  if (!isFinite(bu)) return true                  // 時刻の無い CSV で、API から入った分を上書きしない
  return bu < eu
}
export type BillingPlan = {
  create: any[]; update: any[]; diff: any[]; same: any[]
  unmapped: { key: string; partnerId: string; partnerName: string; n: number; total: number; candidates: string[]; items: Billing[] }[]
  newPartners: { key: string; partnerId: string; partnerName: string; n: number; total: number }[]
  learn: { companyId: string; partnerId: string; partnerName: string }[]
  drafts: number; closed: any[]; dupWarn: any[]; stale: any[]; old: any[]; adopt: any[]
}

/** 取り込みの計画を立てる（画面の確認・cron・テストが同じものを見る）
    opts.autoCreate=false のときは、何も似ていない取引先も 待ち行列（unmapped）に回す。 */
export function planBillings(state: any, items: Billing[], map?: Record<string, string>, opts: { autoCreate?: boolean } = {}): BillingPlan {
  const autoCreate = opts.autoCreate !== false
  const out: BillingPlan = { create: [], update: [], diff: [], same: [], unmapped: [], newPartners: [], learn: [], drafts: 0, closed: [], dupWarn: [], stale: [], old: [], adopt: [] }
  const invoices = arr(state, 'invoices')
  const byMf = new Map(invoices.filter((i: any) => i.mfId).map((i: any) => [String(i.mfId), i]))
  const unmapped = new Map<string, BillingPlan['unmapped'][number]>()
  const fresh = new Map<string, BillingPlan['newPartners'][number]>()
  const learned = new Set<string>()
  const taken = new Set<string>()

  for (const b of items) {
    if (!b || !b.mfId) continue
    if (isDraft(b)) { out.drafts++; continue }
    /* 前の期の請求は 取引先を作る前に落とす（前の期にしか請求の無い会社を 自動で作らない） */
    if (isBeforeImport(state, billingYm(b))) { out.old.push(b); continue }
    const m = matchCompany(state, b, map)
    if (m.companyId === '__skip') continue
    if (!m.companyId) {
      const key = partnerKey(b)
      if (m.how === 'none' && autoCreate && normName(b.partnerName)) {
        const g = fresh.get(key) || { key, partnerId: String(b.partnerId || ''), partnerName: String(b.partnerName || ''), n: 0, total: 0 }
        g.n++; g.total += num(b.total); fresh.set(key, g)
        continue
      }
      const g = unmapped.get(key) || { key, partnerId: String(b.partnerId || ''), partnerName: String(b.partnerName || ''), n: 0, total: 0, candidates: m.candidates, items: [] }
      g.n++; g.total += num(b.total); g.items.push(b); unmapped.set(key, g)
      continue
    }
    if (m.how === 'name' && b.partnerId && !learned.has(m.companyId)) {
      learned.add(m.companyId); out.learn.push({ companyId: m.companyId, partnerId: String(b.partnerId), partnerName: String(b.partnerName || '') })
    }
    const rec = billingToRec(state, b, m.companyId)
    const ex: any = byMf.get(String(b.mfId))
    if (isClosedYm(state, rec.bookMonth) && (!ex || String(ex.bookMonth) !== rec.bookMonth)) { out.closed.push({ b, rec }); continue }
    if (!ex) {
      /* ★ 2026-09-19: 以前 CSV で入れた請求（mfId が csv:…）と 同じもの（取引先・計上月・金額、番号があれば番号も同じ）を
         API が持ってきたら、新しく作らずに その行を API の id に付け替える（同じ請求が2つになって 売掛金が倍にならないように）。 */
      const twin = invoices.find((i: any) => /^csv/.test(String(i.mfId || '')) && i.status !== '取消' && !taken.has(String(i.id))
        && String(i.companyId) === m.companyId && ymOf(i.bookMonth) === rec.bookMonth && num(i.total) === rec.total
        && (!i.no || !rec.no || String(i.no) === String(rec.no)))
      if (twin && !/^csv/.test(String(b.mfId))) { taken.add(String(twin.id)); out.adopt.push({ b, rec, ex: twin }); continue }
      const ruleAmt = ruleAmountOf(state, m.companyId)
      const auto = ruleAmt == null || ruleAmt === rec.total
      /* 二重の疑い: 同じ取引先・同じ計上月に この システムで作った（MF 以外の）請求がある */
      const dupOf = invoices.filter((i: any) => !i.mfId && i.status !== '取消' && i.status !== '作成中'
        && String(i.companyId) === m.companyId && ymOf(i.bookMonth) === rec.bookMonth).map((i: any) => String(i.id))
      out.create.push({ b, rec, auto, dupOf })
      if (dupOf.length) out.dupWarn.push({ b, rec, dupOf })
      continue
    }
    if (isClosedYm(state, ex.bookMonth)) { out.closed.push({ b, rec, ex }); continue }
    const changed = INV_KEYS.filter(k => String(ex[k] ?? '') !== String((rec as any)[k] ?? ''))
    if (!changed.length) { out.same.push({ b, rec, ex }); continue }
    /* ★ 2026-09-18 利用者の指示: 「新しいデータを優先。MF で変わったものは変わったと見せる。変わらないものは触らない」
       以前は 確定済み を上書きせず mfDiff に差を残すだけだった。MF の請求はほぼ自動で確定になるため、
       MF で直しても こちらの数字がずっと古いままになっていた。いまは:
         ・MF の更新時刻が 今ある分より新しい → 上書きし、前後の値を mfChanges に残す（画面に「MFで変更」）
         ・MF の更新時刻が 古い／時刻の無い CSV で API の分を上書きしようとした → 見送り（古いデータで新しいデータを消さない）
         ・締めた期 → 上の closed（動かさない） */
    if (isStale(b, ex)) { out.stale.push({ b, rec, ex, changed }); continue }
    out.update.push({ b, rec, ex, changed })
  }
  out.unmapped = [...unmapped.values()].sort((a, b) => b.total - a.total)
  out.newPartners = [...fresh.values()].sort((a, b) => b.total - a.total)
  return out
}

/** 計画どおりに state を書き換える（冪等: 同じ入力を何度流しても同じ結果）
    ① 何も似ていない取引先は 得意先 を作る → ② 請求を入れる → ③ 似ている取引先は 待ち行列（mfPartnerQueue）に置く */
export function applyBillings(state: any, items: Billing[], opts: { map?: Record<string, string>; actor?: string; source?: string; autoCreate?: boolean } = {}) {
  const now = new Date().toISOString(), actor = opts.actor || 'mf-sync'
  const stamp = { updatedAt: now, updatedBy: actor }
  let base = state
  /* ① 自動で作る取引先（作ってから計画を立て直すと、その会社に 取引先ID で当たる） */
  const first = planBillings(state, items, opts.map, { autoCreate: opts.autoCreate })
  const made: any[] = first.newPartners.map(g => newCompanyFromMf(g, { actor, now, review: true }))
  if (made.length) base = { ...state, companies: arr(state, 'companies').concat(made) }
  const plan = made.length ? planBillings(base, items, opts.map, { autoCreate: false }) : first
  const out = { ...base, invoices: arr(base, 'invoices').slice() }
  const byId = new Map<string, number>(out.invoices.map((r: any, i: number) => [String(r.id), i] as [string, number]))

  for (const c of plan.create) {
    const b: Billing = c.b
    out.invoices.push({
      id: newId('INV'), ...c.rec, items: [], status: '確定', locked: true,
      source: 'mf', mfId: String(b.mfId), mfPartnerId: b.partnerId || '', mfUpdatedAt: b.updatedAt || '',
      mfStatus: b.mfStatus || '', mfPdfUrl: b.pdfUrl || '', mfWebUrl: b.webUrl || '', note: b.title || '', mfDiff: null,
      dupOf: c.dupOf && c.dupOf.length ? c.dupOf : undefined,
      confirmStatus: c.auto ? '確定' : '未確認', confirmedAt: c.auto ? now : '', confirmedBy: c.auto ? actor : '',
      createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor,
    })
  }
  for (const a of plan.adopt) {
    const i = byId.get(String(a.ex.id)); if (i == null) continue
    out.invoices[i] = { ...out.invoices[i], mfId: String(a.b.mfId), source: 'mf', mfUpdatedAt: a.b.updatedAt || '', mfStatus: a.b.mfStatus || '',
      mfPdfUrl: a.b.pdfUrl || '', mfWebUrl: a.b.webUrl || '', mfPartnerId: a.b.partnerId || '', csvMfId: out.invoices[i].mfId, updatedAt: now, updatedBy: actor }
  }
  let overPaid = 0
  for (const u of plan.update) {
    const i = byId.get(String(u.ex.id)); if (i == null) continue
    const cur = out.invoices[i]
    const fields: any = {}
    for (const k of u.changed) fields[k] = { before: cur[k] ?? null, after: (u.rec as any)[k] ?? null }
    const next: any = { ...cur, ...u.rec, mfUpdatedAt: u.b.updatedAt || '', mfStatus: u.b.mfStatus || '', mfPdfUrl: u.b.pdfUrl || cur.mfPdfUrl || '', mfWebUrl: u.b.webUrl || cur.mfWebUrl || '', mfDiff: null,
      mfChanges: [...(Array.isArray(cur.mfChanges) ? cur.mfChanges : []), { at: now, by: actor, fields }].slice(-10),
      mfChangedAt: now, mfChangeSeen: false, mfChangeWarn: '', updatedAt: now, updatedBy: actor }
    /* 金額が下がって、もう充てた入金の方が多くなった → 知らせる（入金の充当は人が直す） */
    if (u.changed.includes('total') && invoiceBalance(base, next) < 0) { next.mfChangeWarn = '充てた入金が 新しい請求額を超えています'; overPaid++ }
    out.invoices[i] = next
  }
  /* 変更なしでも PDF の場所が無い古い取り込み分には補う（金額には触らない） */
  for (const x of plan.same) {
    const i = byId.get(String(x.ex.id)); if (i == null) continue
    if (x.b.pdfUrl && !out.invoices[i].mfPdfUrl) out.invoices[i] = { ...out.invoices[i], mfPdfUrl: x.b.pdfUrl }
    if (x.b.webUrl && !out.invoices[i].mfWebUrl) out.invoices[i] = { ...out.invoices[i], mfWebUrl: x.b.webUrl }
  }
  for (const d of plan.diff) {
    const i = byId.get(String(d.ex.id)); if (i == null) continue
    const detail: any = {}
    for (const k of d.changed) detail[k] = { finance: d.ex[k] ?? null, mf: (d.rec as any)[k] ?? null }
    out.invoices[i] = { ...out.invoices[i], mfDiff: { at: now, fields: detail }, mfUpdatedAt: d.b.updatedAt || '', updatedAt: now, updatedBy: actor }
  }
  /* 取引先の対応を覚える（次から 取引先ID で自動で当たる）: 人が選んだ分 ＋ 名前で当たった分 */
  {
    const cos = arr(out, 'companies').slice()
    let touched = false
    const remember = (cid: string, pid: string, pname: string) => {
      const at = cos.findIndex((c: any) => String(c.id) === String(cid)); if (at < 0) return
      if (setPartnerId(cos, at, pid, pname, stamp)) touched = true
      /* ID の無い CSV でも 次から当たるよう、MF の名前を別名として覚える */
      const n = normName(pname)
      if (!pid && n && !companyNames(cos[at]).includes(n)) { cos[at] = { ...cos[at], mfAliases: [...(cos[at].mfAliases || []), pname], ...stamp }; touched = true }
    }
    if (opts.map) for (const b of items) {
      const cid = opts.map[partnerKey(b)]
      if (cid && cid !== '__skip' && cid !== '__new') remember(cid, String(b.partnerId || ''), String(b.partnerName || ''))
    }
    for (const l of plan.learn) remember(l.companyId, l.partnerId, l.partnerName)
    if (touched) out.companies = cos
  }
  /* 似ている取引先 → 待ち行列（人が 統合／新規／取り込まない を選ぶまで、請求はここで待つ） */
  {
    const q = arr(out, 'mfPartnerQueue').slice()
    let touched = false
    for (const g of plan.unmapped) {
      const id = queueId(g.key), at = q.findIndex((x: any) => x.id === id)
      const prev: any = at >= 0 ? q[at] : null
      const keep = new Map<string, Billing>(((prev?.items) || []).map((b: Billing) => [String(b.mfId), b]))
      g.items.forEach(b => keep.set(String(b.mfId), b))
      const list = [...keep.values()]
      const next = { id, key: g.key, partnerId: g.partnerId, partnerName: g.partnerName, candidates: g.candidates,
        n: list.length, total: list.reduce((s, b) => s + num(b.total), 0), items: list, status: prev?.status || 'open',
        firstAt: prev?.firstAt || now, updatedAt: now }
      if (prev && JSON.stringify({ ...prev, updatedAt: '' }) === JSON.stringify({ ...next, updatedAt: '' })) continue
      if (at >= 0) q[at] = next; else q.push(next)
      touched = true
    }
    /* 対応がついた（または ほかで入った）ものは 行列から消す */
    const done = new Set<string>()
    for (const b of items) { if (plan.unmapped.some(g => g.key === partnerKey(b))) continue; done.add(queueId(partnerKey(b))) }
    const kept = q.filter((x: any) => !(done.has(x.id) && x.status !== 'skipped'))
    if (kept.length !== q.length) touched = true
    if (touched) out.mfPartnerQueue = kept
  }
  const stats = { 新規: plan.create.length, 更新: plan.update.length, 変更なし: plan.same.length, MF差異: plan.diff.length,
    古いデータで見送り: plan.stale.length, 入金が請求額を超過: overPaid, 前の期で見送り: plan.old.length, CSVの請求と同じ: plan.adopt.length,
    取引先を自動作成: made.length, 取引先未対応: plan.unmapped.reduce((s, g) => s + g.n, 0), 二重の疑い: plan.dupWarn.length,
    下書き除外: plan.drafts, 締め済みで見送り: plan.closed.length }
  return { state: out, plan, made, stats }
}

/* ---------- 入金（MF 会計の入出金明細 / 銀行CSV → payments）---------- */
export type Txn = { extId: string; date: string; amount: number; payerName?: string; raw?: any; side?: string }

/** 入金の「指紋」＝ 入金日 ＋ 金額 ＋ 振込名義。
    ★ 2026-09-18: 同じ入金が MF 会計（API・取引ID あり）と 銀行 CSV（ID なし）の両方から来ても 二重にしないため。
      同じ日に 同じ名義・同じ金額が本当に2回ある（二重振込）こともあるので、「同じ指紋が いま何件あるか」で数える:
      すでに2件あるなら 3件目から入れる。 */
export const payFingerprint = (date: any, amount: any, payer: any) => dateOnly(date) + '|' + num(amount) + '|' + normPayer(payer)

export function planTransactions(state: any, txns: Txn[]) {
  const pays = arr(state, 'payments').filter((p: any) => p.status !== '取消')
  const seen = new Set(arr(state, 'payments').filter((p: any) => p.extId).map((p: any) => String(p.extId)))
  const have = new Map<string, number>()
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) || 0) + 1)
  for (const p of pays) if (normPayer(p.payerName)) bump(have, payFingerprint(p.date, p.amount, p.payerName))
  /* 手で入れた入金（振込名義なし）は 入金日・金額・取引先 で数える */
  const manual = new Map<string, number>()
  for (const p of pays) if (!normPayer(p.payerName) && p.companyId) bump(manual, dateOnly(p.date) + '|' + num(p.amount) + '|' + p.companyId)
  const create: Txn[] = [], dup: Txn[] = [], closed: Txn[] = [], fingerprint: Txn[] = [], old: Txn[] = []
  for (const t of txns) {
    if (!t || !t.extId || !t.date || !num(t.amount)) continue
    const fp = payFingerprint(t.date, t.amount, t.payerName)
    /* すでに入っている明細は、その1件ぶん 指紋の数を使い切る（本当の二重振込の2件目を 取りこぼさないため） */
    if (seen.has(String(t.extId))) { dup.push(t); if ((have.get(fp) || 0) > 0) have.set(fp, have.get(fp)! - 1); continue }
    if (isClosedYm(state, ymOf(t.date))) { closed.push(t); continue }
    if (isBeforeImport(state, ymOf(t.date))) { old.push(t); continue }
    if (normPayer(t.payerName) && (have.get(fp) || 0) > 0) { have.set(fp, have.get(fp)! - 1); fingerprint.push(t); continue }
    const cid = matchCompanyByPayer(state, t.payerName).companyId
    const mk = dateOnly(t.date) + '|' + num(t.amount) + '|' + cid
    if (cid && (manual.get(mk) || 0) > 0) { manual.set(mk, manual.get(mk)! - 1); fingerprint.push(t); continue }
    seen.add(String(t.extId)); create.push(t)
  }
  return { create, dup, closed, fingerprint, old }
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
  return { state: out, plan, stats: { 新規: plan.create.length, 取込済み: plan.dup.length + plan.fingerprint.length, 同じ入金が別の道で入り済み: plan.fingerprint.length, 締め済みで見送り: plan.closed.length, 前の期で見送り: plan.old.length } }
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

export type MatchResult = { paymentId: string; companyId: string; matchType: 'exact' | 'fee' | 'multi' | 'fifo' | 'none'
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
    // ④ 仕訳から来た入金（取引先は MF で確定している）→ 期日の古い順に充てる（残りは 過入金 として残る）
    if (p.source === 'mfj') {
      const all = invoices.filter((i: any) => String(i.companyId) === companyId && (bal.get(String(i.id)) || 0) > 0)
        .sort((a: any, b: any) => String(a.dueDate || a.bookMonth || '').localeCompare(String(b.dueDate || b.bookMonth || '')))
      let rest = amount; const als: { invoiceId: string; amount: number }[] = []
      for (const i of all) { if (rest <= 0) break; const b = bal.get(String(i.id)) || 0; const take = Math.min(b, rest); als.push({ invoiceId: String(i.id), amount: take }); bal.set(String(i.id), b - take); rest -= take }
      if (als.length) { results.push({ paymentId: String(p.id), companyId, matchType: 'fifo', fee: 0, allocations: als, reason: rest > 0 ? '過入金 ' + rest : '' }); continue }
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
  const occ = new Map<string, number>()
  rows.slice(1).forEach((r, k) => {
    const date = jpDate(v(r, C.date)); if (!date) return
    let amount = C.income >= 0 ? num(v(r, C.income)) : num(v(r, C.amount))
    const side = v(r, C.side)
    if (C.income < 0 && side && /出金|支出|EXPENSE/i.test(side)) return
    if (amount < 0) return                                   // 出金の行（マイナス）は入金ではない
    if (!amount) return
    const payerName = v(r, C.content)
    /* ID の無い CSV: 日付・金額・名義 で鍵を作る。同じファイルに同じ行が2つあれば（二重振込）2つ目は #2 */
    let extId = v(r, C.id)
    if (!extId) {
      const base = `csv:${date}:${amount}:${normPayer(payerName) || k}`
      const n = (occ.get(base) || 0) + 1; occ.set(base, n)
      extId = n > 1 ? base + '#' + n : base
    }
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

/* ---------- 取引先の確認（待ち行列・自動で作った会社・統合）----------
   ★ 2026-09-18 利用者の指示: 自動で作った取引先と、似た会社があって止めている取引先は
     「取引先 › 取引先の確認」に並べ、人が 統合 か このまま を選ぶ。 */

/** 待ち行列の1件を片づける。
    action: 'map'（既存の会社に結びつける）/ 'new'（新しい得意先を作る）/ 'skip'（取り込まない。次からも入れない）/ 'reopen'（skip を戻す） */
export function resolvePartnerQueue(state: any, qid: string, action: string, companyId: string, actor: string) {
  const now = new Date().toISOString()
  const q = arr(state, 'mfPartnerQueue').find((x: any) => x.id === qid)
  if (!q) throw new Error('この取引先は もう確認済みです（画面を読み直してください）。')
  if (action === 'reopen') {
    return { state: { ...state, mfPartnerQueue: arr(state, 'mfPartnerQueue').map((x: any) => x.id === qid ? { ...x, status: 'open', updatedAt: now } : x) }, stats: { 戻す: 1 } }
  }
  if (action === 'skip') {
    return { state: { ...state, mfPartnerQueue: arr(state, 'mfPartnerQueue').map((x: any) => x.id === qid ? { ...x, status: 'skipped', updatedAt: now, resolvedBy: actor } : x) },
      stats: { 取り込まない: q.n } }
  }
  let st = state, cid = companyId
  if (action === 'new') {
    const co = newCompanyFromMf(q, { actor, now, review: false })
    st = { ...st, companies: arr(st, 'companies').concat([co]) }; cid = co.id
  } else if (action === 'map') {
    if (!arr(st, 'companies').some((c: any) => String(c.id) === String(cid) && !c._gone)) throw new Error('結びつける取引先が見つかりません。')
  } else throw new Error('bad-action')
  const r = applyBillings(st, q.items || [], { map: { [q.key]: cid }, actor, autoCreate: false })
  return { state: { ...r.state, mfPartnerQueue: arr(r.state, 'mfPartnerQueue').filter((x: any) => x.id !== qid) }, stats: { ...r.stats, 取引先: cid } }
}

/** 自動で作った会社を「このままでよい」にする */
export function markCompanyReviewed(state: any, id: string, actor: string) {
  const now = new Date().toISOString()
  const cos = arr(state, 'companies')
  if (!cos.some((c: any) => String(c.id) === String(id))) throw new Error('取引先が見つかりません。')
  return { state: { ...state, companies: cos.map((c: any) => String(c.id) === String(id) ? { ...c, needsReview: false, reviewedAt: now, reviewedBy: actor, updatedAt: now, updatedBy: actor } : c) }, stats: { 確認済み: 1 } }
}

/** 統合: from の 請求・入金・請求ルール など（companyId を持つもの すべて）を to に付け替えて、from を消す。
    MF の取引先ID・名前・振込名義 は to に引き継ぐ（次からは to に当たる）。
    ★ CRM から来た会社は消さない（CRM が正。消しても次の同期で戻ってくる）。 */
export function mergeCompanies(state: any, fromId: string, toId: string, actor: string) {
  const now = new Date().toISOString(), stamp = { updatedAt: now, updatedBy: actor }
  if (!fromId || !toId || String(fromId) === String(toId)) throw new Error('統合する2社を選んでください。')
  const cos = arr(state, 'companies').slice()
  const fi = cos.findIndex((c: any) => String(c.id) === String(fromId)), ti = cos.findIndex((c: any) => String(c.id) === String(toId))
  if (fi < 0 || ti < 0) throw new Error('取引先が見つかりません。')
  const from = cos[fi]
  if (from.source === 'crm' && from.crmId && !from._gone) throw new Error('CRM から来た取引先は 統合で消せません（CRM が正です）。反対向きに統合してください。')
  let to = { ...cos[ti], ...stamp }
  for (const pid of partnerIdsOf(from)) {
    if (!to.mfPartnerId) to.mfPartnerId = pid
    else if (!partnerIdsOf(to).includes(pid)) to.mfPartnerIds = [...(to.mfPartnerIds || []), pid]
  }
  const aliases = new Set<string>((to.mfAliases || []).map(String))
  for (const n of [from.name, from.mfPartnerName, ...(from.mfAliases || [])]) if (n && !companyNames(to).includes(normName(n))) aliases.add(String(n))
  if (aliases.size) to.mfAliases = [...aliases]
  const payers = new Set<string>([...(to.bankPayerNames || []), ...(from.bankPayerNames || [])].map(String))
  if (payers.size) to.bankPayerNames = [...payers]
  if (to.kind && from.kind && to.kind !== from.kind && to.kind !== '両方') to.kind = '両方'
  to.needsReview = false
  cos[ti] = to
  const out: any = { ...state, companies: cos.filter((_: any, i: number) => i !== fi) }
  const moved: Record<string, number> = {}
  for (const k of Object.keys(state)) {
    if (k === 'companies' || !Array.isArray(state[k])) continue
    if (!state[k].some((r: any) => r && String(r.companyId ?? '') === String(fromId))) continue
    out[k] = state[k].map((r: any) => {
      if (!r || String(r.companyId ?? '') !== String(fromId)) return r
      moved[k] = (moved[k] || 0) + 1
      return { ...r, companyId: String(toId), ...stamp }
    })
  }
  /* 待ち行列の候補からも消す */
  if (arr(out, 'mfPartnerQueue').length) out.mfPartnerQueue = arr(out, 'mfPartnerQueue').map((q: any) =>
    (q.candidates || []).includes(String(fromId)) ? { ...q, candidates: q.candidates.filter((x: string) => x !== String(fromId)) } : q)
  return { state: out, stats: { 統合: 1, ...moved } }
}

/** 二重の疑い（MF の請求と この システムで作った請求が 同じ取引先・同じ月）を片づける。
    'replace' ＝ 手で作った請求を 取消 にして MF の請求を残す（充てた入金は MF の請求へ付け替え）
    'separate'＝ 別物（両方残す） */
export function resolveDuplicate(state: any, invoiceId: string, action: string, actor: string) {
  const now = new Date().toISOString(), stamp = { updatedAt: now, updatedBy: actor }
  const invs = arr(state, 'invoices')
  const inv = invs.find((i: any) => String(i.id) === String(invoiceId))
  if (!inv || !(inv.dupOf || []).length) throw new Error('この請求に 二重の疑い はありません。')
  if (action === 'separate') {
    return { state: { ...state, invoices: invs.map((i: any) => i === inv ? { ...i, dupOf: undefined, dupChecked: 'separate', ...stamp } : i) }, stats: { 別物: 1 } }
  }
  if (action !== 'replace') throw new Error('bad-action')
  const olds = new Set<string>((inv.dupOf || []).map(String))
  for (const i of invs) if (olds.has(String(i.id)) && isClosedYm(state, i.bookMonth)) throw new Error('締めた期の請求は 取消にできません。')
  const outInv = invs.map((i: any) => {
    if (i === inv) return { ...i, dupOf: undefined, dupChecked: 'replace', ...stamp }
    if (olds.has(String(i.id)) && i.status !== '取消') return { ...i, status: '取消', cancelNote: 'MF の請求（' + (inv.no || inv.mfId) + '）に置き換え', ...stamp }
    return i
  })
  let movedPays = 0
  const pays = arr(state, 'payments').map((p: any) => {
    if (!(p.allocations || []).some((a: any) => olds.has(String(a.invoiceId)))) return p
    movedPays++
    return { ...p, allocations: p.allocations.map((a: any) => olds.has(String(a.invoiceId)) ? { ...a, invoiceId: String(inv.id) } : a), ...stamp }
  })
  return { state: { ...state, invoices: outInv, payments: pays }, stats: { 取消: olds.size, 入金を付け替え: movedPays } }
}

/* ---------- MF の取引先の「行き先」（2026-09-18 利用者の指示: 「奥田スチール が 取引先 に無いのはなぜ?」に画面で答える）----------
   取り込みのたびに、MF の取引先ごとに 何件来て どこへ行ったかを残す。
   result: 'matched'（既存の会社に当たった）/ 'created'（自動で作った）/ 'queued'（似た会社があり 取引先の確認 で待ち）
           / 'skipped'（取り込まない にした）/ 'draft'（下書きしか無い＝取り込まない） */
export function partnerReport(state: any, items: Billing[], map?: Record<string, string>) {
  const g = new Map<string, any>()
  const cos = new Map(arr(state, 'companies').map((c: any) => [String(c.id), c]))
  for (const b of items) {
    if (!b || !b.mfId) continue
    const key = partnerKey(b)
    const r = g.get(key) || { key, partnerId: String(b.partnerId || ''), partnerName: String(b.partnerName || ''), n: 0, drafts: 0, total: 0, first: '', last: '', result: '', companyId: '', companyName: '' }
    const d = dateOnly(b.billingDate || b.salesDate)
    if (d && (!r.first || d < r.first)) r.first = d
    if (d && d > r.last) r.last = d
    if (isDraft(b)) { r.drafts++; g.set(key, r); continue }
    if (isBeforeImport(state, billingYm(b))) { r.old = (r.old || 0) + 1; g.set(key, r); continue }
    r.n++; r.total += num(b.total)
    if (!r.result) {
      const m = matchCompany(state, b, map)
      if (m.companyId === '__skip') r.result = 'skipped'
      else if (m.companyId) {
        const c: any = cos.get(String(m.companyId))
        r.companyId = String(m.companyId); r.companyName = String(c?.name || '')
        r.result = c && c.source === 'mf' && c.needsReview ? 'created' : 'matched'
      } else r.result = 'queued'
    }
    g.set(key, r)
  }
  for (const r of g.values()) if (!r.result) r.result = r.old ? 'old' : 'draft'
  return [...g.values()].sort((a, b) => String(a.partnerName).localeCompare(String(b.partnerName), 'ja'))
}

/* ---------- 取り込みの片づけ（2026-09-19 利用者の指示）----------
   ① 前の期: 第6期（2026/8/1〜2027/7/31）の 売上計上日 のものだけを認める。
      MF・CSV から取り込んだ請求で 計上月が 取り込んでよい期より前 → 消す（いつ取り込んだかは問わない。since を渡せば その日以降だけ）
      入金も同じ（MF・CSV 由来＝extId あり で、入金日が 前）
   ② 重複: 取り込んだ請求で「同じ取引先・同じ計上月・同じ金額・同じ請求番号（片方が番号なし なら番号は見ない）」が
      2つ以上 → 1つだけ残す（入金を充てたもの ＞ MF の本当の id ＞ 先に入ったもの）
      入金も「同じ日・同じ金額・同じ振込名義」で CSV と API の両方から入っていたら CSV の方を消す
   ★ 絶対に消さない: 人が手で入れたもの（mfId / extId なし）・入金を充てたもの・締めた期
   ★ 取引先: MF から自動で作った会社で、上を消したら 何も残らない → 消す
   消した行は 操作履歴（audit_log）に 丸ごと残る（戻せる）。 */
export function cleanupBeforeImport(state: any, opts: { since?: string; actor?: string } = {}) {
  const since = String(opts.since || '')
  const from = importFromYm(state)
  const allocated = new Set<string>()
  for (const p of arr(state, 'payments')) if (p.status !== '取消') for (const a of (p.allocations || [])) if (num(a.amount)) allocated.add(String(a.invoiceId))
  const newer = (r: any) => !since || String(r.createdAt || '') >= since
  const imported = (i: any) => !!i.mfId && (i.source === 'mf' || i.source === 'csv' || /^csv/.test(String(i.mfId)))
  const live = (i: any) => i.status !== '取消' && !isClosedYm(state, i.bookMonth)
  const invs = arr(state, 'invoices')

  /* ① 前の期 */
  const oldInv = invs.filter((i: any) => imported(i) && live(i) && isBeforeImport(state, i.bookMonth) && newer(i))
  const kill = new Map<string, string>()      // id → 理由
  const keptPaid: any[] = []
  for (const i of oldInv) { if (allocated.has(String(i.id))) keptPaid.push(i); else kill.set(String(i.id), '前の期') }

  /* ② 重複（前の期で消すもの以外で） */
  const groups = new Map<string, any[]>()
  for (const i of invs) {
    if (!imported(i) || !live(i) || kill.has(String(i.id)) || isBeforeImport(state, i.bookMonth)) continue   // 前の期は ① だけで扱う
    const k = [i.companyId || '', ymOf(i.bookMonth), num(i.total)].join('|')
    const g = groups.get(k) || []; g.push(i); groups.set(k, g)
  }
  const rank = (i: any) => (allocated.has(String(i.id)) ? 0 : 10) + (/^csv/.test(String(i.mfId)) ? 5 : 0)
  let dupN = 0
  for (const g of groups.values()) {
    if (g.length < 2) continue
    /* 番号で分ける。番号の無いもの（CSV）は どの番号のものとも同じとみなす */
    const byNo = new Map<string, any[]>()
    for (const i of g) { const no = String(i.no || '').trim(); const l = byNo.get(no) || []; l.push(i); byNo.set(no, l) }
    const numbered = [...byNo.entries()].filter(([no]) => no)
    const blank = byNo.get('') || []
    const sets: any[][] = numbered.map(([, l]) => l.slice())
    if (blank.length) { if (sets.length) sets[0].push(...blank); else sets.push(blank) }
    for (const set of sets) {
      if (set.length < 2) continue
      set.sort((a, b) => rank(a) - rank(b) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
      for (const i of set.slice(1)) { if (allocated.has(String(i.id))) continue; kill.set(String(i.id), '重複（' + (set[0].no || set[0].mfId) + ' と同じ）'); dupN++ }
    }
  }

  /* 入金: 前の期 ＋ CSV と API の二重 */
  const pays = arr(state, 'payments')
  const payKill = new Map<string, string>()
  for (const p of pays) if (p.extId && p.status !== '取消' && !(p.allocations || []).length && isBeforeImport(state, ymOf(p.date)) && newer(p)) payKill.set(String(p.id), '前の期')
  const fp = new Map<string, any[]>()
  for (const p of pays) {
    if (!p.extId || p.status === '取消' || payKill.has(String(p.id)) || !normPayer(p.payerName)) continue
    const k = payFingerprint(p.date, p.amount, p.payerName); const l = fp.get(k) || []; l.push(p); fp.set(k, l)
  }
  for (const l of fp.values()) {
    const api = l.filter((p: any) => !/^csv/.test(String(p.extId))), csv = l.filter((p: any) => /^csv/.test(String(p.extId)) && !(p.allocations || []).length)
    for (const p of csv.slice(0, Math.min(api.length, csv.length))) payKill.set(String(p.id), '重複（MF 会計 と CSV）')
  }

  const invoices = invs.filter((i: any) => !kill.has(String(i.id)))
  const payments = pays.filter((p: any) => !payKill.has(String(p.id)))
  const used = new Set<string>()
  for (const k of Object.keys(state)) {
    if (k === 'companies' || !Array.isArray(state[k])) continue
    const list = k === 'invoices' ? invoices : k === 'payments' ? payments : state[k]
    for (const r of list) if (r && r.companyId) used.add(String(r.companyId))
  }
  const coDel = new Set(arr(state, 'companies').filter((c: any) => c.source === 'mf' && !c.crmId && !used.has(String(c.id))).map((c: any) => String(c.id)))
  const queue = arr(state, 'mfPartnerQueue').map((q: any) => {
    const items = (q.items || []).filter((b: Billing) => !isBeforeImport(state, billingYm(b)))
    return { ...q, items, n: items.length, total: items.reduce((s: number, b: Billing) => s + num(b.total), 0) }
  }).filter((q: any) => q.items.length || q.status === 'skipped')
  const sample = invs.filter((i: any) => kill.has(String(i.id))).concat(keptPaid).slice(0, 400)
    .sort((a: any, b: any) => String(a.companyId).localeCompare(String(b.companyId)) || String(a.bookMonth).localeCompare(String(b.bookMonth)))
    .map((i: any) => ({ id: i.id, companyId: i.companyId, bookMonth: i.bookMonth, total: num(i.total), no: i.no || '', createdAt: i.createdAt || '',
      why: kill.get(String(i.id)) || '前の期（入金を充ててあるので残す）', kept: !kill.has(String(i.id)) }))
  const killed = invs.filter((i: any) => kill.has(String(i.id)))
  return {
    state: { ...state, invoices, payments, companies: arr(state, 'companies').filter((c: any) => !coDel.has(String(c.id))), mfPartnerQueue: queue },
    stats: { 取り込んでよい期の初め: from, 前の期の請求を消す: killed.length - dupN, 重複の請求を消す: dupN,
      消す請求の合計: killed.reduce((s: number, i: any) => s + num(i.total), 0),
      入金が充ててあり残す: keptPaid.length, 入金を消す: payKill.size, 取引先を消す: coDel.size },
    sample, companies: [...coDel].map(id => String((arr(state, 'companies').find((c: any) => String(c.id) === id) || {}).name || id)),
  }
}

/* ---------- 入金（MF 会計 の 仕訳 → payments）----------
   ★ 2026-09-19 利用者の指示: MF 会計 が唯一の正。取引先の当て方も 経理（または AI）が MF で決めたものを使う。
     ここは 仕訳の 売掛金（貸方）を 1行＝入金1件 として写すだけ。
     ・鍵は 仕訳ID＋行番号（extId 'j:…'）。何度流しても増えない
     ・取引先は 仕訳の trade_partner_code → 会社（mfTradeCode）、無ければ 名前（表記ゆれを畳む）。当たらなければ 未対応 のまま入れる
     ・以前 入出金明細（銀行の生データ）から入った同じ入金（同じ会社・日・金額、または同じ日・金額で会社なし）があれば
       新しく作らず その行を 仕訳 に付け替える（充てた入金を失わない・二重にしない）
     ・MF で仕訳を直したら（金額・日付）: 充当が無ければ そのまま直す、有れば 直したうえで 警告
     ・前の期・締めた期 は入れない */
export type JPay = { extId: string; journalId?: string; number?: string; date: string; amount: number; fee?: number
  partnerCode?: string; partnerName?: string; remark?: string; updatedAt?: string; against?: string }

export function matchCompanyByTrade(state: any, p: { partnerCode?: string; partnerName?: string }) {
  const cos = liveCos(state)
  if (p.partnerCode) { const c = cos.find((x: any) => String(x.mfTradeCode || '') === String(p.partnerCode)); if (c) return { companyId: String(c.id), how: 'code' as const } }
  const n = normName(p.partnerName)
  if (n) { const hits = cos.filter((x: any) => companyNames(x).includes(n)); if (hits.length === 1) return { companyId: String(hits[0].id), how: 'name' as const } }
  return { companyId: '', how: 'none' as const }
}
export function planJournals(state: any, items: JPay[]) {
  const pays = arr(state, 'payments')
  const byExt = new Map(pays.filter((p: any) => p.extId).map((p: any) => [String(p.extId), p]))
  const taken = new Set<string>()
  const out = { create: [] as any[], adopt: [] as any[], update: [] as any[], same: [] as any[], old: [] as any[], closed: [] as any[], unmapped: [] as any[], learn: [] as any[] }
  const learned = new Set<string>()
  for (const j of items) {
    if (!j || !j.extId || !j.date || !num(j.amount)) continue
    const ym = ymOf(j.date)
    if (isBeforeImport(state, ym)) { out.old.push(j); continue }
    const m = matchCompanyByTrade(state, j)
    if (!m.companyId) out.unmapped.push(j)
    else if (m.how === 'name' && j.partnerCode && !learned.has(m.companyId)) { learned.add(m.companyId); out.learn.push({ companyId: m.companyId, code: j.partnerCode, name: j.partnerName || '' }) }
    const ex: any = byExt.get(String(j.extId))
    if (ex) {
      if (isClosedYm(state, ymOf(ex.date))) { out.closed.push(j); continue }
      const changed = dateOnly(ex.date) !== dateOnly(j.date) || num(ex.amount) !== num(j.amount) || num(ex.fee) !== num(j.fee || 0) || (!ex.companyId && m.companyId)
      if (changed) out.update.push({ j, ex, companyId: ex.companyId || m.companyId }); else out.same.push(j)
      continue
    }
    if (isClosedYm(state, ym)) { out.closed.push(j); continue }
    /* 入出金明細（銀行）から先に入っていた同じ入金 → 付け替え */
    const twin = pays.find((p: any) => p.status !== '取消' && !taken.has(String(p.id)) && !/^j:/.test(String(p.extId || '')) && (p.extId || p.source === 'mf' || p.source === 'csv')
      && dateOnly(p.date) === dateOnly(j.date) && num(p.amount) === num(j.amount)
      && (!p.companyId || !m.companyId || String(p.companyId) === m.companyId))
    if (twin) { taken.add(String(twin.id)); out.adopt.push({ j, ex: twin, companyId: twin.companyId || m.companyId }); continue }
    out.create.push({ j, companyId: m.companyId })
  }
  return out
}
export function applyJournals(state: any, items: JPay[], opts: { actor?: string } = {}) {
  const plan = planJournals(state, items)
  const now = new Date().toISOString(), actor = opts.actor || 'mf-sync', stamp = { updatedAt: now, updatedBy: actor }
  const out: any = { ...state, payments: arr(state, 'payments').slice() }
  const byId = new Map<string, number>(out.payments.map((p: any, i: number) => [String(p.id), i] as [string, number]))
  const base = (j: JPay) => ({ mfJournalId: j.journalId || '', mfJournalNo: j.number || '', mfTradeCode: j.partnerCode || '', mfTradeName: j.partnerName || '',
    mfAgainst: j.against || '', mfUpdatedAt: j.updatedAt || '', source: 'mfj', extId: String(j.extId) })
  for (const c of plan.create) out.payments.push({
    id: newId('PAY'), companyId: c.companyId || '', date: dateOnly(c.j.date), amount: num(c.j.amount), fee: num(c.j.fee || 0),
    method: '銀行振込', note: c.j.remark || '', allocations: [], status: '確定', payerName: c.j.partnerName || '', matchType: '',
    ...base(c.j), createdAt: now, createdBy: actor, ...stamp,
  })
  for (const a of plan.adopt) { const i = byId.get(String(a.ex.id)); if (i == null) continue
    out.payments[i] = { ...out.payments[i], companyId: a.companyId || '', fee: num(a.j.fee || 0) || num(out.payments[i].fee), bankExtId: out.payments[i].extId || '', ...base(a.j), ...stamp } }
  let warn = 0
  for (const u of plan.update) { const i = byId.get(String(u.ex.id)); if (i == null) continue
    const cur = out.payments[i], hasAlloc = (cur.allocations || []).some((x: any) => num(x.amount))
    const next = { ...cur, companyId: u.companyId || '', date: dateOnly(u.j.date), amount: num(u.j.amount), fee: num(u.j.fee || 0), ...base(u.j),
      mfChanges: [...(cur.mfChanges || []), { at: now, fields: { date: [cur.date, dateOnly(u.j.date)], amount: [num(cur.amount), num(u.j.amount)] } }].slice(-10), ...stamp }
    if (hasAlloc && (num(cur.amount) !== num(u.j.amount) || String(cur.companyId) !== String(u.companyId))) { (next as any).mfChangeWarn = 'MF で仕訳が直されました。充当を確かめてください'; warn++ }
    out.payments[i] = next }
  if (plan.learn.length) {
    const cos = arr(out, 'companies').slice(); let touched = false
    for (const l of plan.learn) { const at = cos.findIndex((c: any) => String(c.id) === l.companyId); if (at < 0 || cos[at].mfTradeCode === l.code) continue
      cos[at] = { ...cos[at], mfTradeCode: l.code, mfTradeName: l.name, ...stamp }; touched = true }
    if (touched) out.companies = cos
  }
  const stats = { 新規: plan.create.length, 銀行明細から付け替え: plan.adopt.length, 更新: plan.update.length, 変更なし: plan.same.length,
    取引先未対応: plan.unmapped.length, 前の期で見送り: plan.old.length, 締め済みで見送り: plan.closed.length, 充当の確認: warn }
  return { state: out, plan, stats }
}
