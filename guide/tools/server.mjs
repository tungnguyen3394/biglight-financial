/* ============================================================================
   server.mjs — máy chủ GIẢ để chụp màn hình (không có database, không chạm production)
   ----------------------------------------------------------------------------
   ・Phát web/index.html như máy thật.
   ・/api/me, /api/state trả về một người dùng Admin giả và dữ liệu RỖNG.
     Dữ liệu mẫu do chính app tạo ra bằng nút デモデータ (demoSeed) — giống hệt khi dùng thật.
   ・PUT /api/state-delta: nhận rồi bỏ (app giữ dữ liệu trong trình duyệt).
   ・Các API khác (tệp đính kèm, MF, users…) trả rỗng.
   ============================================================================ */
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WEB = path.resolve(HERE, '..', '..', 'web')
const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.js': 'text/javascript', '.css': 'text/css' }
export const ME = { email: 'tanaka@example.jp', name: '田中 花子', role: 'Admin', status: 'active', picture: '' }

export function startServer(port = 4790) {
  let rev = 1
  const srv = http.createServer((req, res) => {
    const u = req.url.split('?')[0]
    const json = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)) }
    if (u === '/api/me') return json(ME)
    if (u === '/api/state') return json({ data: {}, rev, epoch: 'guide' })
    if (u === '/api/state-delta') { let b = ''; req.on('data', c => b += c); req.on('end', () => json({ rev: ++rev, applied: {} })); return }
    if (u.startsWith('/api/state-diff')) return json({ rev, changed: {} })
    if (u === '/api/users') return json({ items: [
      { email: ME.email, name: ME.name, role: 'Admin', status: 'active', lastLogin: '2026-09-16 09:12' },
      { email: 'suzuki@example.jp', name: '鈴木 一郎', role: 'Manager', status: 'active', lastLogin: '2026-09-15 18:40' },
      { email: 'nguyen@example.jp', name: 'NGUYEN THI MAI', role: 'Staff', status: 'active', lastLogin: '2026-09-16 08:55' },
      { email: 'sato@example.jp', name: '佐藤 健', role: 'Viewer', status: 'pending', lastLogin: '' },
    ] })
    if (u.startsWith('/api/files/counts')) return json({ counts: {} })
    if (u.startsWith('/api/files')) return json({ items: [] })
    if (u.startsWith('/api/mf/status')) return json({ configured: true, connected: true, office: 'BIGLIGHT株式会社（見本）' })
    if (u.startsWith('/api/')) return json({})
    const f = path.join(WEB, u === '/' ? 'index.html' : u)
    if (!f.startsWith(WEB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      /* /expenses のような画面のURLも index.html を返す（本物と同じ） */
      res.writeHead(200, { 'content-type': TYPES['.html'] }); return res.end(fs.readFileSync(path.join(WEB, 'index.html')))
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' })
    res.end(fs.readFileSync(f))
  })
  return new Promise(ok => srv.listen(port, '127.0.0.1', () => ok(srv)))
}
