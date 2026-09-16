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

/* 添付ファイル — メモリの中だけ（本物と同じ口・同じ形。書類の種類つき） */
const FILES = []
const kindOf = m => m === 'application/pdf' ? 'PDF' : (/^image\//.test(m) ? '画像' : 'その他')
const mimeOf = b => b.slice(0, 5).toString('latin1') === '%PDF-' ? 'application/pdf' : (b[0] === 0x89 ? 'image/png' : 'application/octet-stream')
const fileRow = f => ({ id: f.id, entity: f.entity, entityId: f.entityId, fileName: f.fileName, mime: f.mime, kind: f.kind,
  docType: f.docType || 'その他', size: f.data.length, uploadedBy: f.by, createdAt: f.at })

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
    const qs = new URL(req.url, 'http://x').searchParams
    const body = () => new Promise(ok => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { ok(JSON.parse(b || '{}')) } catch { ok({}) } }) })
    if (u === '/api/files/counts') {
      const out = {}; FILES.filter(f => f.entity === qs.get('entity') && !f.gone).forEach(f => { out[f.entityId] = (out[f.entityId] || 0) + 1 })
      return json({ counts: out })
    }
    if (u === '/api/files' && req.method === 'GET')
      return json({ items: FILES.filter(f => f.entity === qs.get('entity') && f.entityId === qs.get('id') && !f.gone).map(fileRow) })
    if (u === '/api/files' && req.method === 'POST') {
      body().then(b => {
        const data = Buffer.from(String(b.dataBase64 || ''), 'base64'), mime = mimeOf(data)
        const f = { id: 'F' + (FILES.length + 1), entity: b.entity, entityId: b.entityId, fileName: b.fileName, mime, kind: kindOf(mime),
          docType: b.docType || 'その他', data, by: ME.email, at: '2026-09-16T10:00:00.000Z' }
        FILES.push(f); json({ item: fileRow(f) }, 201)
      }); return
    }
    const fm = /^\/api\/files\/([^/]+)$/.exec(u)
    if (fm) {
      const f = FILES.find(x => x.id === decodeURIComponent(fm[1]) && !x.gone)
      if (!f) return json({ error: 'not-found' }, 404)
      if (req.method === 'PATCH') { body().then(b => { f.docType = b.docType || 'その他'; json({ ok: true, docType: f.docType }) }); return }
      if (req.method === 'DELETE') { f.gone = true; return json({ ok: true }) }
      res.writeHead(200, { 'content-type': f.mime }); return res.end(f.data)
    }
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
