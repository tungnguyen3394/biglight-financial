/* session.mjs — mở app trên máy chủ giả, đăng nhập giả, nạp dữ liệu mẫu (デモデータ) của chính app. */
import { chromium } from 'playwright'
import { startServer, ME } from './server.mjs'

export const W = 1440, H = 900

export async function openApp({ dark = false } = {}) {
  const srv = await startServer()
  const browser = await chromium.launch()
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
  const close = async () => { await browser.close(); srv.close() }
  return { page, ctx, browser, errors, close }
}
