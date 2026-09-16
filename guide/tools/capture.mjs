/* ============================================================================
   capture.mjs — chụp màn hình finance.biglight.jp (bản máy tính) + đo vị trí khung cam
   ----------------------------------------------------------------------------
   node tools/capture.mjs vi             → chụp hết
   node tools/capture.mjs vi home ar     → chỉ chụp lại vài ảnh

   ・Không cần database, không chạm production: tools/server.mjs là máy chủ giả,
     dữ liệu là デモデータ do chính app tạo (demoSeed) — giống hệt bấm nút ở 設定 › 基本設定.
   ・<bản>/chup.mjs mô tả từng ảnh: làm gì trước khi chụp (run), khung nào cần đo (marks).
     Vị trí khung đo NGAY LÚC CHỤP → giao diện đổi chỗ thì chụp lại là khung tự theo.
     Không thấy khung → báo ⚠, không im lặng ra PDF sai.
   ・Ảnh lưu JPEG (nhẹ hơn PNG nhiều lần, chữ vẫn nét ở DPR 1.6 — A4 in ra khoảng 300dpi).
   ============================================================================ */
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { openApp, W, H } from './session.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const [slug, ...only] = process.argv.slice(2)
if (!slug) { console.error('Cách dùng: node tools/capture.mjs vi [tên ảnh...]'); process.exit(1) }
const dir = path.join(ROOT, slug)
const C = (await import(pathToFileURL(path.join(dir, 'chup.mjs')).href)).default
const outDir = path.join(dir, 'shots')
fs.mkdirSync(outDir, { recursive: true })

const { page, errors, close } = await openApp()
let fail = 0

/* Trước mỗi ảnh: đóng hộp thoại, đóng menu, về đầu trang, trả các chế độ xem về mặc định */
const RESET = `(() => {
  try { closeModal(); closeModal2(); } catch (e) {}
  try { arPopClose(); } catch (e) {}
  document.querySelectorAll('details[open]').forEach(d => d.open = false);
  document.getElementById('notif')?.classList.remove('open');
  document.getElementById('acctMenu')?.classList.remove('open');
  const q = document.getElementById('quickSearch'); if (q) { q.value = ''; globalSearch(''); }
  try { BOOK_VIEW = { per: 'month', cum: false }; YJ_TAB = 'pl'; YJ_VIEW = 'compare'; } catch (e) {}
  try { setFY(${C.fy ?? 'CUR_FY'}); document.getElementById('fyPick').value = String(CUR_FY); } catch (e) {}
  window.scrollTo(0, 0); document.querySelectorAll('.table-wrap').forEach(t => t.scrollLeft = 0);
})()`

for (const [name, spec] of Object.entries(C.shots)) {
  if (only.length && !only.includes(name)) continue
  try {
    await page.setViewportSize({ width: W, height: spec.height || H })
    await page.evaluate(RESET)
    if (spec.page) { await page.evaluate(p => goto(p), spec.page); await page.waitForTimeout(350) }
    if (spec.run) await spec.run(page)
    await page.waitForTimeout(spec.settle ?? 450)
    await page.addStyleTag({ content: '::-webkit-scrollbar{display:none} *{caret-color:transparent!important} #toast{display:none!important}' })

    /* clip: chỉ chụp một phần (vd. hộp thoại). Toạ độ khung tính theo phần đã cắt. */
    let clip = null
    if (spec.clip) {
      /* clip: một selector, hoặc nhiều selector → lấy hình chữ nhật bao tất cả */
      let b = null
      for (const sel of [].concat(spec.clip)) {
        const r = await page.locator(sel).filter({ visible: true }).first().boundingBox()
        if (!r) throw new Error('không thấy vùng cắt ' + sel)
        b = b ? { x: Math.min(b.x, r.x), y: Math.min(b.y, r.y), width: Math.max(b.x + b.width, r.x + r.width) - Math.min(b.x, r.x), height: Math.max(b.y + b.height, r.y + r.height) - Math.min(b.y, r.y) } : r
      }
      const pad = spec.clipPad ?? 10
      clip = { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: Math.min(W - Math.max(0, b.x - pad), b.width + pad * 2), height: b.height + pad * 2 }
    }
    const marks = {}
    for (const [m, sel] of Object.entries(spec.marks || {})) {
      const loc = page.locator(sel).filter({ visible: true }).first()
      const b = await loc.boundingBox({ timeout: 1500 }).catch(() => null)
      if (!b) { console.warn(`  ⚠ ${name}: không thấy khung "${m}" (${sel})`); fail++; continue }
      const ox = clip ? clip.x : 0, oy = clip ? clip.y : 0
      marks[m] = { x: Math.round(b.x - ox), y: Math.round(b.y - oy), w: Math.round(b.width), h: Math.round(b.height) }
    }
    await page.screenshot({ path: path.join(outDir, name + '.jpg'), type: 'jpeg', quality: 82, ...(clip ? { clip } : {}) })
    fs.writeFileSync(path.join(outDir, name + '.json'), JSON.stringify({
      width: Math.round(clip ? clip.width : W), height: Math.round(clip ? clip.height : (spec.height || H)), marks }, null, 1))
    console.log(`✔ ${name}` + (errors.length ? `  (lỗi JS: ${errors.splice(0).join(' / ')})` : ''))
  } catch (e) {
    console.error(`✘ ${name}: ${e.message.split('\n')[0]}`); fail++
  }
}
await close()
if (fail) { console.log(`\n${fail} chỗ cần xem lại (xem ⚠/✘ ở trên)`); process.exitCode = 1 }
