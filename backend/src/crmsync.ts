/* ============================================================================
   CRM連携 — kéo 所属機関情報 / 特定技能者情報 từ crm.biglight.jp về 予実.
   ----------------------------------------------------------------------------
   MỘT CHIỀU: CRM → 予実. Không bao giờ ghi ngược lại CRM.

   Ba trường dữ liệu được mirror:
     companies   ← 所属機関情報   (chỉ các trường CRM sở hữu; phần 会計 do 予実 giữ)
     workers     ← 特定技能者情報 (chỉ đọc)
     assignments ← 雇用管理       (ai · công ty nào · từ ngày nào · đến ngày nào)
                   ↑ đây mới là thứ tính ra tiền: 支援委託料 tính theo NGƯỜI TẠI CHỖ.

   Luật giữ dữ liệu 予実 (xem THIET-KE-YOJITSU.md §2):
     · Trường CRM  → ghi đè mỗi lần đồng bộ.
     · Trường 会計 (支払サイト, 締日, 銀行口座…) → KHÔNG bao giờ đụng tới.
     · overrides{} → giữ nguyên; nếu CRM đổi giá trị đang bị override thì gắn cờ
       _crmDiff để người dùng tự quyết. Máy không tự quyết thay người.
     · Bản ghi CRM biến mất → đánh dấu _gone, KHÔNG xoá (hoá đơn cũ phải tra được).
   ========================================================================== */
import { pool } from './db'

// Trường do CRM sở hữu — đúng danh sách này, không hơn.
const CRM_COMPANY_FIELDS = ['code', 'name', 'kana', 'corpNo', 'zip', 'address', 'phone', 'fax',
  'email', 'website', 'field', 'bizType', 'repName', 'staffName', 'staffEmail', 'contractStatus']
const CRM_WORKER_FIELDS = ['code', 'name', 'kana', 'nationality', 'visaStatus', 'visaExp', 'dob', 'gender']
const CRM_ASSIGN_FIELDS = ['workerCrmId', 'companyCrmId', 'joinDate', 'exitDate', 'status']

export type CrmPayload = {
  at?: string
  companies?: any[]
  workers?: any[]
  assignments?: any[]
}

/** Gọi API CRM. Trả về payload hoặc ném lỗi có thông điệp đọc được. */
export async function fetchFromCrm(): Promise<CrmPayload> {
  const base = process.env.CRM_API_BASE
  const key = process.env.CRM_EXPORT_KEY
  if (!base) throw new Error('CRM_API_BASE chưa cấu hình')
  if (!key) throw new Error('CRM_EXPORT_KEY chưa cấu hình')
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 30_000)
  try {
    const r = await fetch(base.replace(/\/$/, '') + '/export/master', {
      headers: { 'x-export-key': key, 'accept': 'application/json' },
      signal: ctl.signal,
    })
    if (!r.ok) throw new Error(`CRM trả về HTTP ${r.status}`)
    const d = await r.json() as CrmPayload
    if (!d || (!Array.isArray(d.companies) && !Array.isArray(d.workers))) {
      throw new Error('CRM trả về dữ liệu không đúng dạng')
    }
    return d
  } finally { clearTimeout(timer) }
}

const pick = (src: any, fields: string[]) => {
  const o: any = {}
  for (const f of fields) if (src[f] !== undefined) o[f] = src[f]
  return o
}
const newId = (p: string) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

/** Gộp payload CRM vào state. Trả state mới + thống kê. KHÔNG tự ghi database. */
export function applyCrmPayload(state: any, payload: CrmPayload) {
  const stats: any = {}
  const out = { ...state }

  /* ---------- 所属機関 → companies ---------- */
  {
    const base: any[] = Array.isArray(out.companies) ? out.companies.slice() : []
    const byCrm = new Map(base.map((c, i) => [String(c?.crmId ?? ''), i]))
    let added = 0, updated = 0, diff = 0
    const seen = new Set<string>()

    for (const src of (payload.companies || [])) {
      const crmId = String(src.crmId ?? src.id ?? '')
      if (!crmId) continue
      seen.add(crmId)
      const incoming = pick(src, CRM_COMPANY_FIELDS)
      const at = byCrm.get(crmId)
      if (at == null) {
        base.push({
          id: newId('CO'), crmId, source: 'crm', kind: '得意先',
          ...incoming, overrides: {}, crmSyncAt: new Date().toISOString(), _gone: false,
        })
        added++
      } else {
        const cur = base[at]
        // Cảnh báo khi CRM đổi đúng trường đang bị override → người dùng tự quyết
        const ov = cur.overrides || {}
        const conflicts = Object.keys(ov).filter(f =>
          incoming[f] !== undefined && String(incoming[f] ?? '') !== String(cur[f] ?? ''))
        base[at] = {
          ...cur, ...incoming, source: 'crm', crmId,
          crmSyncAt: new Date().toISOString(), _gone: false,
          _crmDiff: conflicts.length ? conflicts : undefined,
        }
        if (conflicts.length) diff++
        updated++
      }
    }
    // Biến mất khỏi CRM → đánh dấu, không xoá
    let gone = 0
    for (const c of base) {
      if (c?.source === 'crm' && c.crmId && !seen.has(String(c.crmId)) && !c._gone) { c._gone = true; gone++ }
    }
    out.companies = base
    stats.companies = `+${added} ~${updated}${gone ? ` 消失${gone}` : ''}${diff ? ` ⚠相違${diff}` : ''}`
  }

  /* ---------- 特定技能者 → workers (chỉ đọc) ---------- */
  {
    const base: any[] = Array.isArray(out.workers) ? out.workers.slice() : []
    const byCrm = new Map(base.map((w, i) => [String(w?.crmId ?? ''), i]))
    let added = 0, updated = 0
    const seen = new Set<string>()
    for (const src of (payload.workers || [])) {
      const crmId = String(src.crmId ?? src.id ?? '')
      if (!crmId) continue
      seen.add(crmId)
      const incoming = pick(src, CRM_WORKER_FIELDS)
      const at = byCrm.get(crmId)
      if (at == null) { base.push({ id: newId('WK'), crmId, source: 'crm', ...incoming, _gone: false }); added++ }
      else { base[at] = { ...base[at], ...incoming, source: 'crm', crmId, _gone: false }; updated++ }
    }
    let gone = 0
    for (const w of base) if (w?.crmId && !seen.has(String(w.crmId)) && !w._gone) { w._gone = true; gone++ }
    out.workers = base
    stats.workers = `+${added} ~${updated}${gone ? ` 消失${gone}` : ''}`
  }

  /* ---------- 雇用 → assignments (nền để tính 支援委託料) ---------- */
  if (Array.isArray(payload.assignments)) {
    const coByCrm = new Map((out.companies || []).map((c: any) => [String(c.crmId ?? ''), c.id]))
    const wkByCrm = new Map((out.workers || []).map((w: any) => [String(w.crmId ?? ''), w.id]))
    const base: any[] = Array.isArray(out.assignments) ? out.assignments.slice() : []
    const byCrm = new Map(base.map((a, i) => [String(a?.crmId ?? ''), i]))
    let added = 0, updated = 0
    const seen = new Set<string>()
    for (const src of payload.assignments) {
      const crmId = String(src.crmId ?? src.id ?? '')
      if (!crmId) continue
      seen.add(crmId)
      const rec = {
        ...pick(src, CRM_ASSIGN_FIELDS),
        crmId, source: 'crm',
        companyId: coByCrm.get(String(src.companyCrmId ?? '')) || '',
        workerId: wkByCrm.get(String(src.workerCrmId ?? '')) || '',
      }
      const at = byCrm.get(crmId)
      if (at == null) { base.push({ id: newId('AS'), ...rec, _gone: false }); added++ }
      else { base[at] = { ...base[at], ...rec, _gone: false }; updated++ }
    }
    let gone = 0
    for (const a of base) if (a?.crmId && !seen.has(String(a.crmId)) && !a._gone) { a._gone = true; gone++ }
    out.assignments = base
    stats.assignments = `+${added} ~${updated}${gone ? ` 消失${gone}` : ''}`
  }

  return { state: out, stats }
}

export async function logCrmSync(source: string, actor: string, ok: boolean, stats: any, message: string) {
  try {
    await pool.query(
      'INSERT INTO crm_sync_log(source, actor, ok, stats, message) VALUES($1,$2,$3,$4::jsonb,$5)',
      [source, actor, ok, JSON.stringify(stats || {}), (message || '').slice(0, 500)])
  } catch { /* nhật ký hỏng không được làm hỏng việc chính */ }
}

/* ---------------------------------------------------------------------------
   CSV dự phòng — dùng khi API CRM hỏng hoặc CRM đổi cấu trúc.
   Cột nhận biết theo TIÊU ĐỀ, không theo thứ tự (xuất từ Excel thứ tự hay đổi).
   --------------------------------------------------------------------------- */
export function parseCsv(text: string): any[] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  const s = text.replace(/^﻿/, '')          // bỏ BOM của Excel
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (ch !== '\r') cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  if (!rows.length) return []
  const head = rows[0].map(h => h.trim())
  return rows.slice(1).filter(r => r.some(c => String(c).trim() !== ''))
    .map(r => { const o: any = {}; head.forEach((h, i) => o[h] = (r[i] ?? '').trim()); return o })
}

/** Tiêu đề tiếng Nhật của CSV xuất từ CRM → tên trường của 予実. */
export const CSV_MAP_COMPANY: Record<string, string> = {
  'ID': 'crmId', 'ID番号': 'code', '所属機関名': 'name', 'フリガナ': 'kana', '法人番号': 'corpNo',
  '郵便番号': 'zip', '住所': 'address', '電話番号': 'phone', 'FAX': 'fax', 'メール': 'email',
  'Website': 'website', '分野': 'field', '業務区分': 'bizType', '代表者': 'repName',
  '担当者氏名': 'staffName', '担当者メール': 'staffEmail', '取引状況': 'contractStatus',
}
export const CSV_MAP_WORKER: Record<string, string> = {
  'ID': 'crmId', 'ID番号': 'code', '特定技能者名': 'name', 'カタカナ': 'kana', '生年月日': 'dob',
  '性別': 'gender', '国籍': 'nationality', '在留資格': 'visaStatus', '在留期限': 'visaExp',
}
export const CSV_MAP_ASSIGN: Record<string, string> = {
  'ID': 'crmId', '特定技能者': 'workerCrmId', '所属機関': 'companyCrmId',
  '入社日': 'joinDate', '退職日': 'exitDate', '雇用状況': 'status',
}

export function csvToRecords(rows: any[], map: Record<string, string>): any[] {
  return rows.map(r => {
    const o: any = {}
    for (const [head, field] of Object.entries(map)) if (r[head] !== undefined) o[field] = r[head]
    return o
  }).filter(o => o.crmId || o.code || o.name)
}
