/* ============================================================================
   添付ファイルの口を「本当に叩いて」確かめる — 役割ごとの 見る・付ける・消す
   実行:  node test/files-http.js
   ----------------------------------------------------------------------------
   費用の書類（家賃の契約書・請求書）は機微な情報なので、ここは
   「見せていない人には1バイトも出ない」ことを HTTP で確かめます。
   データベースはメモリの偽物、権限は本物（backend/src/authz.ts）を使います。
   ========================================================================== */
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const ts = require(path.join(ROOT, 'backend/node_modules/typescript'));
const cache = new Map();
function loadTs(file) {
  if (cache.has(file)) return cache.get(file);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  cache.set(file, mod.exports);
  const req = spec => spec.startsWith('.') ? loadTs(path.resolve(path.dirname(file), spec + '.ts'))
    : require(require.resolve(spec, { paths: [path.join(ROOT, 'backend', 'node_modules')] }));
  new Function('module', 'exports', 'require', js)(mod, mod.exports, req);
  cache.set(file, mod.exports);
  return mod.exports;
}
const FILES = loadTs(ROOT + '/backend/src/files.ts');
const AUTHZ = loadTs(ROOT + '/backend/src/authz.ts');
const express = require(require.resolve('express', { paths: [path.join(ROOT, 'backend', 'node_modules')] }));

let pass = 0, fail = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b);
  ok ? pass++ : fail++; console.log((ok ? '  ok  ' : '  NG  ') + name + (ok ? '' : `  → ${JSON.stringify(a)} (期待 ${JSON.stringify(b)})`)); };

/* ── 偽のデータベース（attachments だけ） ── */
const rows = [];
const AUDIT = [];
const pool = { query: async (sql, p) => {
  const q = String(sql).replace(/\s+/g, ' ').trim();
  const live = r => !r.deleted_at;
  if (q.startsWith('INSERT INTO attachments')) {
    rows.push({ id: p[0], entity: p[1], entity_id: p[2], file_name: p[3], mime: p[4], kind: p[5], size_bytes: p[6], sha256: p[7], data: p[8], uploaded_by: p[9], created_at: new Date().toISOString(), deleted_at: null });
    return { rows: [] };
  }
  if (q.startsWith('UPDATE attachments SET deleted_at')) { const r = rows.find(x => x.id === p[0]); if (r) { r.deleted_at = 'now'; r.deleted_by = p[1]; } return { rows: [] }; }
  if (q.includes('COUNT(*)')) {
    const m = {}; rows.filter(r => r.entity === p[0] && live(r)).forEach(r => { m[r.entity_id] = (m[r.entity_id] || 0) + 1; });
    return { rows: Object.keys(m).map(k => ({ entity_id: k, n: m[k] })) };
  }
  if (q.includes('WHERE entity=$1 AND entity_id=$2')) return { rows: rows.filter(r => r.entity === p[0] && r.entity_id === p[1] && live(r)) };
  if (q.startsWith('SELECT entity FROM attachments WHERE id=$1 AND deleted_at IS NULL')) return { rows: rows.filter(r => r.id === p[0] && live(r)) };
  if (q.startsWith('SELECT entity, entity_id, file_name')) return { rows: rows.filter(r => r.id === p[0] && live(r)) };
  if (q.includes('WHERE id=$1')) return { rows: rows.filter(r => r.id === p[0]) };
  throw new Error('偽DBが知らないSQL: ' + q.slice(0, 80));
} };

/* ── 人と権限 ── */
const USERS = {
  admin:   { email: 'admin@biglight.jp',   role: 'Admin',   status: 'active' },
  staff:   { email: 'staff@biglight.jp',   role: 'Staff',   status: 'active' },
  viewer:  { email: 'viewer@biglight.jp',  role: 'Viewer',  status: 'active' },
  hidden:  { email: 'hidden@biglight.jp',  role: 'Staff',   status: 'active' },   // 請求の画面を見せていない人
  pending: { email: 'new@biglight.jp',     role: 'Viewer',  status: 'pending' },
};
const STATE = {
  invoices: [{ id: 'INV1', no: 'INV-1', companyId: 'C1' }],
  properties: [{ id: 'PR1', name: 'A棟' }],
  userPerms: { 'hidden@biglight.jp': { invoices: { v: 0 } } },
};
const app = express();
app.use(express.json({ limit: '32mb' }));
app.use(FILES.filesRouter({
  pool,
  requireActive: async (req, res) => {
    const u = USERS[String(req.headers['x-test-user'] || '')];
    if (!u) { res.status(401).json({ error: 'unauthorized' }); return null; }
    if (u.status !== 'active') { res.status(403).json({ error: 'account-' + u.status }); return null; }
    return { email: u.email, role: u.role };
  },
  permOf: (st, email, role, page) => AUTHZ.permOf(st, email, role, page),
  loadState: async () => STATE,
  audit: async (email, action, id, detail) => { AUDIT.push({ email, action, id, detail }); },
}));

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(200, 0x20)]).toString('base64');
const MACRO = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('[Content_Types].xml xl/ xl/vbaProject.bin'), Buffer.alloc(100)]).toString('base64');

(async () => {
  const server = app.listen(0); await new Promise(r => server.once('listening', r));
  const B = 'http://127.0.0.1:' + server.address().port;
  const call = (who, method, url, body) => fetch(B + url, { method, headers: Object.assign({ 'content-type': 'application/json' }, who ? { 'x-test-user': who } : {}), body: body ? JSON.stringify(body) : undefined });
  const up = (who, entityId, name, data, entity) => call(who, 'POST', '/files', { entity: entity || 'invoices', entityId, fileName: name, dataBase64: data });

  console.log('\n― 入れない人 ―');
  eq('ログインしていない → 401', (await call(null, 'GET', '/files?entity=invoices&id=INV1')).status, 401);
  eq('承認待ち → 403（1行も出さない）', (await call('pending', 'GET', '/files?entity=invoices&id=INV1')).status, 403);
  eq('添付できない台帳 → 400', (await call('admin', 'GET', '/files?entity=budgets&id=X')).status, 400);

  console.log('\n― 付ける ―');
  const r1 = await up('staff', 'INV1', '請求書_9月.pdf', PDF);
  eq('経理（編集できる）は付けられる', r1.status, 201);
  const f1 = (await r1.json()).item;
  eq('種類は中身から PDF', f1.kind, 'PDF');
  eq('日本語のファイル名がそのまま', f1.fileName, '請求書_9月.pdf');
  eq('閲覧のみは付けられない → 403', (await up('viewer', 'INV1', 'x.pdf', PDF)).status, 403);
  eq('画面を見せていない人は付けられない → 403', (await up('hidden', 'INV1', 'x.pdf', PDF)).status, 403);
  eq('無い伝票には付けられない → 404', (await up('admin', 'NOPE', 'x.pdf', PDF)).status, 404);
  eq('マクロ入りは断る → 415', (await up('admin', 'INV1', 'a.xlsx', MACRO)).status, 415);
  eq('10MB を超えると断る → 413', (await up('admin', 'INV1', 'big.pdf', Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(10 * 1024 * 1024 + 10)]).toString('base64'))).status, 413);
  eq('付けた記録が監査に残る', AUDIT.some(a => a.action === 'upload' && a.detail.fileName === '請求書_9月.pdf'), true);

  console.log('\n― 見る ―');
  const l1 = await call('viewer', 'GET', '/files?entity=invoices&id=INV1');
  eq('閲覧のみは一覧を見られる', l1.status, 200);
  eq('一覧に中身（data）は入らない', JSON.stringify(await l1.json()).includes('"data"'), false);
  eq('画面を見せていない人は一覧も見られない → 403', (await call('hidden', 'GET', '/files?entity=invoices&id=INV1')).status, 403);
  eq('画面を見せていない人は件数も見られない → 403', (await call('hidden', 'GET', '/files/counts?entity=invoices')).status, 403);
  const c1 = await (await call('staff', 'GET', '/files/counts?entity=invoices')).json();
  eq('件数', c1.counts, { INV1: 1 });
  const d1 = await call('viewer', 'GET', '/files/' + f1.id);
  eq('閲覧のみはダウンロードできる', d1.status, 200);
  eq('Content-Type は中身から決めたもの', d1.headers.get('content-type'), 'application/pdf');
  eq('ブラウザに中身を推測させない', d1.headers.get('x-content-type-options'), 'nosniff');
  eq('ファイル名は UTF-8 で安全に', (d1.headers.get('content-disposition') || '').includes("filename*=UTF-8''" + encodeURIComponent('請求書_9月.pdf')), true);
  eq('画面を見せていない人はダウンロードできない → 403', (await call('hidden', 'GET', '/files/' + f1.id)).status, 403);
  eq('無いIDは、本人確認のあとで 404', (await call('admin', 'GET', '/files/NOPE')).status, 404);
  eq('無いIDでも、ログインしていなければ 401（IDの有無を教えない）', (await call(null, 'GET', '/files/NOPE')).status, 401);

  console.log('\n― 消す ―');
  eq('閲覧のみは消せない → 403', (await call('viewer', 'DELETE', '/files/' + f1.id)).status, 403);
  eq('経理も（既定では）削除権限が無い → 403', (await call('staff', 'DELETE', '/files/' + f1.id)).status, 403);
  eq('管理者は消せる', (await call('admin', 'DELETE', '/files/' + f1.id)).status, 200);
  eq('消した記録（ファイル名つき）が監査に残る', AUDIT.some(a => a.action === 'delete' && a.detail.fileName === '請求書_9月.pdf'), true);
  eq('消したら一覧から消える', (await (await call('admin', 'GET', '/files?entity=invoices&id=INV1')).json()).items.length, 0);
  eq('消したら件数も0', (await (await call('admin', 'GET', '/files/counts?entity=invoices')).json()).counts, {});
  eq('消したファイルはダウンロードできない → 404', (await call('admin', 'GET', '/files/' + f1.id)).status, 404);
  eq('行は残っている（消した印だけ）', rows.find(r => r.id === f1.id).deleted_by, 'admin@biglight.jp');

  console.log('\n― 伝票の書き込みも同じ決まり（/state-delta の権限チェック） ―');
  /* 画面を見せていない人が、画面を通さずに請求書を書き込もうとしても止まる */
  const g1 = AUTHZ.checkCollections(STATE, 'Staff', 'hidden@biglight.jp', { invoices:[{ id:'INV1', no:'改ざん' }] }, {});
  eq('見せていない画面の伝票は直せない', g1.ok, false);
  const g2 = AUTHZ.checkCollections(STATE, 'Staff', 'hidden@biglight.jp', { invoices:[{ id:'NEW1' }] }, {});
  eq('見せていない画面に伝票は作れない', g2.ok, false);
  const g3 = AUTHZ.checkCollections(STATE, 'Staff', 'staff@biglight.jp', { invoices:[{ id:'INV1', no:'修正' }] }, {});
  eq('見せている経理は直せる', g3.ok, true);

  server.close();
  console.log(`\n結果: ${pass} 件成功 / ${fail} 件失敗`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('テストが落ちました:', e); process.exit(1); });
