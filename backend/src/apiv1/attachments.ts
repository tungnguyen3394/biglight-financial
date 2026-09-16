/* ============================================================================
   API v1 / MCP — 添付ファイル（証憑）を「読むだけ」                 2026-09-16
   ----------------------------------------------------------------------------
   利用者の指示:「AI エージェントが仕事をしやすいように。AI は読むだけ」。

   決めごと:
     ・見える範囲は その伝票の表のスコープと同じ（bills.read が無い鍵には
       支払請求の請求書 PDF も見えない）。付ける・消す・書類の種類を変える口は外に無い。
     ・どのファイルにも「何の伝票の、どの会社の、何月の、いくらの」を添えて返す
       （AI が id だけ見て迷わないように）。
     ・「証憑なし」＝ ファイルが要るのに1つも付いていない伝票。
         支払請求・請求 … 作成中・取消 を除く（確定したもの）
         入金・支払     … 取消 を除く
       支払請求は 確定の関所（authz.ts billsNeedingFile）があるので、新しく出るのは 以前に確定した分だけ。
     ・中身（BYTEA）は 1ファイルを指定されたときだけ読む。一覧では読まない。
   ============================================================================ */
import { COLLECTIONS, CollectionDef } from './collections'
import { ATTACH_ENTITIES, attachmentCounts, listAttachments, readAttachment } from '../files'
import * as F from './finance'

type Q = { query: (sql: string, p?: any[]) => Promise<any> }

/** 添付が付く表（外での名前 = collections の id） */
export const ATT_SCREENS: CollectionDef[] = COLLECTIONS.filter(c => ATTACH_ENTITIES[c.crmKey])
export const ATT_SCREEN_IDS = ATT_SCREENS.map(c => c.id)
export const attScreen = (id: any) => ATT_SCREENS.find(c => c.id === String(id || '')) || null
export const attByEntity = (entity: any) => ATT_SCREENS.find(c => c.crmKey === String(entity || '')) || null

/** 証憑が要る表と、その判定 */
const NEEDS_FILE: Record<string, (r: any) => boolean> = {
  bills:    r => !['作成中', '取消'].includes(String(r.status || '作成中')),
  invoices: r => !['作成中', '取消'].includes(String(r.status || '作成中')),
  payments: r => String(r.status || '') !== '取消',
  payouts:  r => String(r.status || '') !== '取消',
}
export const MISSING_SCREENS = ATT_SCREENS.filter(c => NEEDS_FILE[c.crmKey]).map(c => c.id)

const rowsOf = (st: any, def: CollectionDef): any[] => Array.isArray(st && st[def.crmKey]) ? st[def.crmKey].filter((r: any) => r && r.id) : []
const monthOf = (entity: string, r: any) =>
  (entity === 'payments' || entity === 'payouts') ? String(r.date || '').slice(0, 7) : (F.ymOfDoc(r) || String(r.issueDate || r.recvDate || '').slice(0, 7))

/** 伝票1行を AI が読みやすい形に（金額は税込。請求は税区分と税抜も） */
export function recordSummary(st: any, def: CollectionDef, r: any) {
  const e = def.crmKey
  const o: any = { screen: def.id, id: String(r.id), label: def.label, status: r.status || null, month: monthOf(e, r) || null }
  if (r.no) o.no = r.no
  if (r.companyId) { o.company_id = String(r.companyId); o.company_name = F.companyName(st, r.companyId) }
  if (e === 'invoices' || e === 'bills') {
    o.amount_incl_tax = F.docTotal(r)
    o.amount_excl_tax = F.docNet(r, st)
    if (e === 'invoices' && !(r.items || []).length) o.tax_category = F.docTaxCat(r, st)
    if (r.dueDate) o.due_date = r.dueDate
  } else if (e === 'payments' || e === 'payouts') {
    o.date = r.date || null
    o.amount_paid = Number(r.amount || 0)
    if (r.fee) o.fee = Number(r.fee)
    if (r.method) o.method = r.method
  } else if (r.name) o.name = r.name
  return o
}
export const fileView = (f: any) => ({
  file_id: f.id, file_name: f.fileName, doc_type: f.docType, kind: f.kind, mime: f.mime, size_bytes: f.size,
  uploaded_by: f.uploadedBy, uploaded_at: f.createdAt, download_path: '/api/v1/attachments/file/' + encodeURIComponent(f.id),
})

/** 伝票1枚の添付一覧 */
export async function attachmentsOf(q: Q, st: any, def: CollectionDef, id: string) {
  const r = rowsOf(st, def).find(x => String(x.id) === id)
  if (!r) return null
  const files = await listAttachments(q, def.crmKey, id)
  return { record: recordSummary(st, def, r), files: files.map(fileView), file_count: files.length }
}

/** 1ファイル（中身つき）と、その伝票の表。消えた・無いときは null */
export async function attachmentFile(q: Q, st: any, fileId: string) {
  const f = await readAttachment(q, fileId)
  if (!f) return null
  const def = attByEntity(f.entity)
  if (!def) return null
  const r = rowsOf(st, def).find(x => String(x.id) === String(f.entityId))
  return { def, file: f, record: r ? recordSummary(st, def, r) : { screen: def.id, id: String(f.entityId), label: def.label } }
}

/** 証憑なしの伝票（新しい順）。screens は呼ぶ側がスコープで絞ってから渡す。 */
export async function missingAttachments(q: Q, st: any, screens: string[],
  opt: { monthFrom?: string; monthTo?: string; companyId?: string; limit?: number } = {}) {
  const limit = Math.max(1, Math.min(500, Number(opt.limit) || 100))
  const out: any[] = []
  const byScreen: Record<string, number> = {}
  for (const sid of screens) {
    const def = attScreen(sid)
    if (!def || !NEEDS_FILE[def.crmKey]) continue
    const cnt = await attachmentCounts(q, def.crmKey)
    const rows = rowsOf(st, def).filter(r => {
      if (r.demo) return false                       // デモデータは数えない
      if (!NEEDS_FILE[def.crmKey](r) || cnt[String(r.id)]) return false
      const m = monthOf(def.crmKey, r)
      if (opt.monthFrom && m && m < opt.monthFrom) return false
      if (opt.monthTo && m && m > opt.monthTo) return false
      if (opt.companyId && String(r.companyId) !== opt.companyId) return false
      return true
    })
    byScreen[def.id] = rows.length
    for (const r of rows) out.push(recordSummary(st, def, r))
  }
  out.sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')) || String(a.id).localeCompare(String(b.id)))
  return { total: out.length, by_screen: byScreen, returned: Math.min(out.length, limit), items: out.slice(0, limit) }
}
