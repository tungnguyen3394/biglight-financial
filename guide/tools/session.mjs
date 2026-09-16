/* session.mjs — mở app trên máy chủ giả, đăng nhập giả, nạp dữ liệu mẫu (デモデータ) của chính app. */
import { chromium } from 'playwright'
import { startServer, ME } from './server.mjs'

export const W = 1440, H = 900

export async function openApp({ dark = false, withFiles = true } = {}) {
  const srv = await startServer()
  /* channel: 'chromium' = 本物の Chromium（PDF をその場で表示できる）。headless shell では PDF が白くなる */
  const browser = await chromium.launch({ channel: 'chromium' })
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1.6, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })
  await ctx.addInitScript({ content: `
    try{ localStorage.setItem('bl_yj_gtoken','guide'); localStorage.setItem('bl_yj_session_v1', ${JSON.stringify(JSON.stringify(ME))});
         ${dark ? "localStorage.setItem('bl_yj_theme','dark');" : "localStorage.setItem('bl_yj_theme','light');"} }catch(e){}
    window.EventSource=function(){ return { addEventListener(){}, close(){} }; };
    window.google={ accounts:{ id:{ initialize(){}, renderButton(){}, prompt(){} } } };` })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('dialog', d => d.accept().catch(() => {}))
  await page.goto('http://127.0.0.1:4790/#dashboard', { waitUntil: 'load' })
  await page.waitForFunction(() => typeof demoSeed === 'function' && typeof DB !== 'undefined' && DB)
  await page.evaluate(() => demoSeed())
  await page.waitForFunction(() => demoCount() > 100, null, { timeout: 30000 })
  await page.waitForTimeout(800)
  if (withFiles) await attachSamples(browser, page)
  const close = async () => { await browser.close(); srv.close() }
  return { page, ctx, browser, errors, close }
}

/* 見本の請求書 PDF を作って、デモの伝票に付ける（最新の月は わざと付けない → 「証憑なし」が見える） */
async function samplePdf(browser, { title, to, from, no, date, amount, note }) {
  const pg = await browser.newPage()
  const yen = n => '¥' + Number(n).toLocaleString('ja-JP')
  await pg.setContent(`<html><body style="font-family:'Hiragino Sans',sans-serif;padding:48px;color:#1b2430">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div><div style="font-size:30px;font-weight:800;letter-spacing:.3em">${title}</div>
        <div style="margin-top:28px;font-size:18px;border-bottom:1px solid #333;padding-bottom:4px">${to} 御中</div></div>
      <div style="text-align:right;font-size:12px;line-height:1.8">No. ${no}<br>発行日 ${date}<br><b>${from}</b><br>【見本】デモ用のファイル</div></div>
    <div style="margin:36px 0 18px;font-size:14px">下記のとおりご請求申し上げます。</div>
    <div style="display:flex;gap:16px;align-items:center;background:#f1f5fb;padding:14px 18px;border-radius:8px">
      <span>ご請求金額（税込）</span><b style="font-size:26px">${yen(amount)}</b></div>
    <table style="width:100%;border-collapse:collapse;margin-top:26px;font-size:13px">
      <tr style="background:#eef2f7"><th style="text-align:left;padding:8px;border:1px solid #ccd">内容</th><th style="text-align:right;padding:8px;border:1px solid #ccd">金額（税込）</th></tr>
      <tr><td style="padding:8px;border:1px solid #ccd">${note}</td><td style="text-align:right;padding:8px;border:1px solid #ccd">${yen(amount)}</td></tr>
    </table>
    <div style="margin-top:40px;font-size:11px;color:#667">これは使い方ガイド用の見本です。実在の取引ではありません。</div>
  </body></html>`)
  const buf = await pg.pdf({ format: 'A4', printBackground: true })
  await pg.close()
  return buf.toString('base64')
}
async function attachSamples(browser, page) {
  const plan = await page.evaluate(() => {
    const pick = (name) => (DB.companies || []).find(c => String(c.name || '').includes(name))
    const out = []
    const ar = pick('東和フーズ'), ap = pick('登録支援パートナーズ')
    const latest = arr => arr.map(x => x.ym).sort().pop()
    if (ar) {
      const f = arFacts(ar.id), last = latest(f.bills)
      f.bills.filter(b => b.ym !== last).forEach(b => out.push({ entity: 'invoices', id: b.doc.id, kind: '請求書', to: ar.name, from: 'BIGLIGHT株式会社', no: b.doc.no || b.doc.id, date: b.doc.issueDate || b.ym, amount: b.amount, note: '登録支援業務委託料 ' + b.ym }))
      f.pays.filter(x => x.ym !== last).forEach(x => out.push({ entity: 'payments', id: x.doc.id, kind: '振込明細', to: 'BIGLIGHT株式会社', from: ar.name, no: 'FURIKOMI-' + x.date, date: x.date, amount: x.amount, note: '振込（' + ar.name + '）' }))
    }
    if (ap) {
      const f = apFacts(ap.id), last = latest(f.bills)
      f.bills.filter(b => b.ym !== last).forEach(b => out.push({ entity: 'bills', id: b.doc.id, kind: '請求書', to: 'BIGLIGHT株式会社', from: ap.name, no: b.doc.no, date: b.ym + '-28', amount: b.amount, note: '支援業務の外注 ' + b.ym }))
      f.pays.filter(x => x.ym !== last).forEach(x => out.push({ entity: 'payouts', id: x.doc.id, kind: '振込明細', to: ap.name, from: 'BIGLIGHT株式会社', no: 'OUT-' + x.date, date: x.date, amount: x.amount, note: '振込（支払）' }))
    }
    /* この2社の伝票だけ「デモの印」を外す — 本物と同じく「証憑なし」が画面に出るように（見本の中だけの話） */
    ;[ar, ap].filter(Boolean).forEach(c => ['invoices', 'payments', 'bills', 'payouts'].forEach(k =>
      (DB[k] || []).forEach(r => { if (String(r.companyId) === String(c.id)) delete r.demo })))
    return out
  })
  for (const d of plan) {
    const b64 = await samplePdf(browser, { title: d.kind === '振込明細' ? '振込明細' : '請求書', ...d })
    await page.evaluate(async x => {
      await fetch(API_BASE + '/files', { method: 'POST', headers: headers(), body: JSON.stringify({ entity: x.entity, entityId: x.id,
        fileName: (x.kind === '振込明細' ? '振込明細_' : '請求書_') + x.no + '.pdf', dataBase64: x.b64, docType: x.kind }) })
    }, { ...d, b64 })
  }
  await page.evaluate(() => { ATT_COUNTS = {} })
}
