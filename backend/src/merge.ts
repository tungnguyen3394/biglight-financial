/* ============================================================================
   MERGE — gộp thay đổi theo TỪNG BẢN GHI (không bao giờ thay cả collection).
   ----------------------------------------------------------------------------
   Client gửi lên: changed[key] = [những bản ghi đã đổi], deleted[key] = [id đã xoá].
   Server gộp vào bản đang có → hai người sửa hai dòng khác nhau không đè nhau.
   ========================================================================== */

export function isRecordArray(a: any): boolean {
  return Array.isArray(a) && a.length > 0 && typeof a[0] === 'object' && a[0] !== null && !Array.isArray(a[0])
}

export type MergeResult = { out: any[]; added: number; updated: number; removed: number }

export function mergeCollection(base: any[], incoming: any[], deleted: string[]): MergeResult {
  const out = Array.isArray(base) ? base.slice() : []
  const idx = new Map<string, number>()
  out.forEach((r, i) => { if (r && r.id != null) idx.set(String(r.id), i) })

  let added = 0, updated = 0, removed = 0

  for (const rec of (incoming || [])) {
    if (!rec || rec.id == null) continue
    const key = String(rec.id)
    const at = idx.get(key)
    if (at == null) { idx.set(key, out.length); out.push(rec); added++ }
    else { out[at] = rec; updated++ }
  }

  if (deleted && deleted.length) {
    const dead = new Set(deleted.map(String))
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i] && dead.has(String(out[i].id))) { out.splice(i, 1); removed++ }
    }
  }
  return { out, added, updated, removed }
}

/** Chốt chặn co ngót: 455 → 6 bị chặn, nhưng 455 → 455 (migration) vẫn qua. */
export function isSuspiciousShrink(before: number, after: number): boolean {
  if (before < 20) return false            // dữ liệu còn ít thì mọi thay đổi đều hợp lệ
  if (after >= before) return false
  return after < before * 0.7              // mất hơn 30% trong MỘT lần ghi = bất thường
}

/** So 2 bản ghi → { field: {old,new} }. Dùng cho audit_log (chỉ ghi cái đã đổi). */
export function diffRecord(oldRec: any, newRec: any): Record<string, { old: any; new: any }> {
  const out: Record<string, { old: any; new: any }> = {}
  const keys = new Set([...Object.keys(oldRec || {}), ...Object.keys(newRec || {})])
  for (const k of keys) {
    if (k === 'updatedAt' || k === 'updatedBy') continue
    const a = oldRec ? oldRec[k] : undefined
    const b = newRec ? newRec[k] : undefined
    const sa = typeof a === 'object' ? JSON.stringify(a) : String(a ?? '')
    const sb = typeof b === 'object' ? JSON.stringify(b) : String(b ?? '')
    if (sa !== sb) out[k] = { old: a ?? null, new: b ?? null }
  }
  return out
}
