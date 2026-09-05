/* ============================================================================
   AUTHZ — Lớp 2 & 3: quyền theo từng bảng dữ liệu + luật riêng của tiền.
   ----------------------------------------------------------------------------
   ★ File này là NGUỒN LUẬT DÙNG CHUNG với frontend (web/index.html khai báo y hệt
     trong khối PERM). Trước đây ở CRM có hai bản luật gần giống nhau, sửa một bên
     là bên kia lệch — không lặp lại lỗi đó.
   ========================================================================== */

/** Collection → trang (để tra quyền). Trang không khai ở đây = chỉ Admin đụng được. */
export const COLL_PAGE: Record<string, string> = {
  companies: 'companies', billingRules: 'companies', workers: 'workers',
  invoices: 'invoices', payments: 'receipts',
  bills: 'bills', payouts: 'payouts',
  expenses: 'expenses', costItems: 'expenses',
  budgets: 'yojitsu', forecasts: 'yojitsu', actualAdjust: 'yojitsu',
  accounts: 'settings', departments: 'settings',
  objectives: 'okr', keyResults: 'okr', checkins: 'okr',
}

/** Mặc định theo vai trò: c=tạo, e=sửa, d=xoá. Admin luôn đủ. */
const ROLE_DEFAULT: Record<string, Record<string, { c: boolean; e: boolean; d: boolean }>> = {
  Admin: {},   // tất cả true
  Manager: {
    yojitsu: { c: true, e: true, d: true },
    invoices: { c: true, e: true, d: false }, receipts: { c: true, e: true, d: false },
    bills: { c: true, e: true, d: false }, payouts: { c: true, e: true, d: false },
    expenses: { c: true, e: true, d: false },
    companies: { c: true, e: true, d: false }, okr: { c: true, e: true, d: true },
    settings: { c: true, e: true, d: false }, workers: { c: false, e: false, d: false },
  },
  Staff: {
    yojitsu: { c: true, e: true, d: false },
    invoices: { c: true, e: true, d: false }, receipts: { c: true, e: true, d: false },
    bills: { c: true, e: true, d: false }, payouts: { c: true, e: true, d: false },
    expenses: { c: true, e: true, d: false },
    companies: { c: true, e: true, d: false }, okr: { c: false, e: true, d: false },
    settings: { c: false, e: false, d: false }, workers: { c: false, e: false, d: false },
  },
  Viewer: {},  // tất cả false
}

/** Quyền hiệu lực của một người với một trang (có xét cấu hình riêng trong app_state). */
export function permOf(state: any, email: string, role: string, page: string) {
  if (role === 'Admin') return { c: true, e: true, d: true, v: true }
  const per = (state && state.userPerms && state.userPerms[String(email || '').toLowerCase()]) || null
  const own = per && per[page]
  const def = (ROLE_DEFAULT[role] || {})[page] || { c: false, e: false, d: false }
  return {
    c: own && 'c' in own ? !!own.c : def.c,
    e: own && 'e' in own ? !!own.e : def.e,
    d: own && 'd' in own ? !!own.d : def.d,
    v: own && 'v' in own ? !!own.v : true,
  }
}

/* ---------------------------------------------------------------------------
   Lớp 2 — kiểm quyền theo từng collection có trong gói ghi.
   --------------------------------------------------------------------------- */
export function checkCollections(state: any, role: string, email: string, changed: any, deleted: any) {
  for (const coll of Object.keys(changed || {})) {
    // Khoá cấu hình hệ thống: chỉ Admin. (Xử lý ở index.ts bằng cách BỎ khoá,
    // không trả 403 — 403 làm máy Staff kẹt vòng đồng bộ, xem công thức §9.)
    if (['userPerms', 'users', 'settings'].includes(coll)) continue
    const page = COLL_PAGE[coll]
    if (!page) { if (role !== 'Admin') return { ok: false, reason: 'unknown-collection', detail: { coll } } ; continue }

    const p = permOf(state, email, role, page)
    const base: any[] = Array.isArray(state?.[coll]) ? state[coll] : []
    const known = new Set(base.map((r: any) => String(r?.id)))
    const inc: any[] = Array.isArray(changed[coll]) ? changed[coll] : []

    for (const rec of inc) {
      const isNew = !known.has(String(rec?.id))
      if (isNew && !p.c) return { ok: false, reason: 'no-create', detail: { coll, page } }
      if (!isNew && !p.e) return { ok: false, reason: 'no-edit', detail: { coll, page } }
    }
    const del: string[] = Array.isArray(deleted?.[coll]) ? deleted[coll] : []
    if (del.length && !p.d) return { ok: false, reason: 'no-delete', detail: { coll, page, n: del.length } }
  }
  return { ok: true, reason: '' }
}

/* ---------------------------------------------------------------------------
   Lớp 3 — luật riêng của TIỀN. Hai luật, viết ra để không ai gỡ nhầm về sau:
     ① Chứng từ đã 確定 thì KHÔNG ai xoá được (kể cả Admin) — chỉ được 取消.
        Xoá một hoá đơn đã phát hành là mất dấu vết của một khoản tiền có thật.
     ② Sửa số tiền của chứng từ đã 確定 chỉ dành cho Manager/Admin, và luôn vào audit.
   --------------------------------------------------------------------------- */
const MONEY_DOCS = ['invoices', 'bills', 'payments', 'payouts']
const LOCKED_STATUS = ['確定', '請求済', '入金済', '一部入金', '支払済', '延滞']

export function checkMoneyRules(state: any, role: string, changed: any, deleted: any) {
  for (const coll of MONEY_DOCS) {
    const base: any[] = Array.isArray(state?.[coll]) ? state[coll] : []
    const byId = new Map(base.map((r: any) => [String(r?.id), r]))

    // ① không xoá chứng từ đã chốt
    for (const id of (deleted?.[coll] || [])) {
      const old: any = byId.get(String(id))
      if (old && (old.locked || LOCKED_STATUS.includes(String(old.status || '')))) {
        return { ok: false, reason: 'locked-doc-delete', detail: { coll, id, status: old.status } }
      }
    }
    // ② sửa số tiền chứng từ đã chốt: chỉ Manager/Admin
    if (role !== 'Admin' && role !== 'Manager') {
      for (const rec of (changed?.[coll] || [])) {
        const old: any = byId.get(String(rec?.id))
        if (!old) continue
        const wasLocked = old.locked || LOCKED_STATUS.includes(String(old.status || ''))
        const amountChanged = Number(old.total || 0) !== Number(rec.total || 0)
        if (wasLocked && amountChanged) {
          return { ok: false, reason: 'locked-doc-amount', detail: { coll, id: rec.id } }
        }
      }
    }
  }
  return { ok: true, reason: '' }
}
