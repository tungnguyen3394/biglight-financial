/* ============================================================================
   証憑（添付ファイル）・支払請求の確定の関所・請求の税区分 のテスト（2026-09-16）
   実行:  node test/attachments.js
   ----------------------------------------------------------------------------
   ・支払請求は ファイルが無いと 確定できない（authz.ts billsNeedingFile）
   ・AI / API は 読むだけ・鍵の範囲のファイルだけ（apiv1/attachments.ts・mcp/tools.ts）
   ・税抜の式は 画面（web/index.html）と backend（finance.ts）で1円も違わない
   データベースはメモリの偽物。
   ========================================================================== */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b);
  ok ? pass++ : fail++; console.log((ok ? '  ok  ' : '  NG  ') + name + (ok ? '' : `  → ${JSON.stringify(a)} (期待 ${JSON.stringify(b)})`)); };

/* ── backend の TypeScript をその場で読む ── */
const ts = require(path.join(ROOT, 'backend/node_modules/typescript'));
const cache = new Map();
function loadTs(file) {
  const abs = path.resolve(file);
  if (cache.has(abs)) return cache.get(abs);
  const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  cache.set(abs, mod.exports);
  const req = spec => spec.startsWith('.') ? loadTs(path.resolve(path.dirname(abs), spec + '.ts'))
    : require(require.resolve(spec, { paths: [path.join(ROOT, 'backend', 'node_modules')] }));
  new Function('module', 'exports', 'require', '__filename', '__dirname', js)(mod, mod.exports, req, abs, path.dirname(abs));
  cache.set(abs, mod.exports);
  return mod.exports;
}
const AUTHZ = loadTs(ROOT + '/backend/src/authz.ts');
const FILES = loadTs(ROOT + '/backend/src/files.ts');
const FIN = loadTs(ROOT + '/backend/src/apiv1/finance.ts');
const A = loadTs(ROOT + '/backend/src/apiv1/attachments.ts');
const T = loadTs(ROOT + '/backend/src/mcp/tools.ts');
const SRV = loadTs(ROOT + '/backend/src/mcp/server.ts');
const RT = loadTs(ROOT + '/backend/src/apiv1/router.ts');
const K = loadTs(ROOT + '/backend/src/apiv1/keys.ts');
const STC = loadTs(ROOT + '/backend/src/statecache.ts');

/* ══════ ① 支払請求の確定の関所 ══════ */
console.log('\n■ 支払請求は ファイルが無いと 確定できない（どれを数えるか）');
{
  const st = { bills: [
    { id: 'B1', status: '作成中' }, { id: 'B2', status: '確定' }, { id: 'B3', status: '取消' }, { id: 'B4', status: '作成中', demo: true },
  ] };
  const need = ch => AUTHZ.billsNeedingFile(st, { bills: ch });
  eq('作成中 → 確定 は要る', need([{ id: 'B1', status: '確定' }]), ['B1']);
  eq('作成中のまま保存は要らない', need([{ id: 'B1', status: '作成中', note: 'x' }]), []);
  eq('新しく いきなり確定 は要る', need([{ id: 'BN', status: '確定' }]), ['BN']);
  eq('新しく 作成中 は要らない', need([{ id: 'BN', status: '作成中' }]), []);
  eq('前から確定していた伝票は止めない（備考の修正・支払済への変化）', need([{ id: 'B2', status: '支払済' }, { id: 'B2', status: '確定', note: 'y' }]), []);
  eq('取消 → 確定（生き返らせる）は要る', need([{ id: 'B3', status: '確定' }]), ['B3']);
  eq('一部支払 に飛ばしても要る', need([{ id: 'B1', status: '一部支払' }]), ['B1']);
  eq('デモデータは数えない', need([{ id: 'B4', status: '確定', demo: true }]), []);
  eq('支払請求以外の表は見ない', AUTHZ.billsNeedingFile(st, { payments: [{ id: 'P1', status: '確定' }] }), []);
}

console.log('\n■ 締めた期は 変えられない（2026-09-17）');
{
  const st = { settings:{ closedFy:[2025] },
    invoices:[{ id:'I5', bookMonth:'2026-03', total:100, allocations:[] }, { id:'I6', bookMonth:'2026-09', total:100 }, { id:'ID', bookMonth:'2026-03', total:1, demo:true }],
    payments:[{ id:'P5', date:'2026-07-31', amount:100, allocations:[] }],
    costPlans:[{ id:'C5', ym:'2026-02', amount:1 }], budgets:[{ id:'B5', fy:2025, amount:1 }] };
  const chk = (changed, deleted) => AUTHZ.checkClosedPeriods(st, changed||{}, deleted||{}).ok;
  eq('締めた期の請求の金額は変えられない', chk({ invoices:[{ ...st.invoices[0], total:200 }] }), false);
  eq('締めた期に新しい請求は作れない', chk({ invoices:[{ id:'NEW', bookMonth:'2025-12', total:1 }] }), false);
  eq('締めた期から今期へ動かすのも だめ', chk({ invoices:[{ ...st.invoices[0], bookMonth:'2026-08' }] }), false);
  eq('今期の請求は変えられる', chk({ invoices:[{ ...st.invoices[1], total:300 }] }), true);
  eq('締めた期の請求は消せない', chk({}, { invoices:['I5'] }), false);
  eq('デモは消せる・作れる', [chk({}, { invoices:['ID'] }), chk({ invoices:[{ id:'D2', bookMonth:'2025-10', total:1, demo:true }] })], [true, true]);
  eq('充て先・差額の処理・更新日時だけなら通す', chk({ payments:[{ ...st.payments[0], allocations:[{ invoiceId:'I6', amount:1 }], adjust:[{ type:'carry' }], updatedAt:'x' }] }), true);
  eq('入金の金額は変えられない', chk({ payments:[{ ...st.payments[0], amount:99 }] }), false);
  eq('費用表のマス・予算も止める', [chk({ costPlans:[{ ...st.costPlans[0], amount:2 }] }), chk({ budgets:[{ ...st.budgets[0], amount:2 }] })], [false, false]);
  eq('締めていなければ 何でも通す', AUTHZ.checkClosedPeriods({ ...st, settings:{} }, { invoices:[{ ...st.invoices[0], total:9 }] }, {}).ok, true);
  const idx=fs.readFileSync(ROOT+'/backend/src/index.ts','utf8');
  eq('/state-delta で使っている（締めを外す送信は 外したあとで見る）', idx.includes('checkClosedPeriods(stNow'), true);
}

/* ══════ ② 偽のデータベース（attachments） ══════ */
const PDF = Buffer.from('%PDF-1.4\n%テスト\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('[Content_Types].xml word/document.xml')]);
const FROWS = [
  { id: 'F1', entity: 'bills', entity_id: 'B2', file_name: '請求書_ガンマ.pdf', mime: 'application/pdf', kind: 'PDF', doc_type: '請求書', size_bytes: PDF.length, data: PDF, uploaded_by: 'staff@biglight.jp', created_at: '2026-09-01T00:00:00Z', deleted_at: null },
  { id: 'F2', entity: 'payments', entity_id: 'P1', file_name: '振込明細.png', mime: 'image/png', kind: '画像', doc_type: '振込明細', size_bytes: PNG.length, data: PNG, uploaded_by: 'staff@biglight.jp', created_at: '2026-09-02T00:00:00Z', deleted_at: null },
  { id: 'F3', entity: 'bills', entity_id: 'B2', file_name: '見積.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'Word', doc_type: null, size_bytes: DOCX.length, data: DOCX, uploaded_by: 'staff@biglight.jp', created_at: '2026-09-03T00:00:00Z', deleted_at: null },
  { id: 'F4', entity: 'bills', entity_id: 'B9', file_name: '消した.pdf', mime: 'application/pdf', kind: 'PDF', doc_type: '請求書', size_bytes: PDF.length, data: PDF, uploaded_by: 'x', created_at: '2026-09-04T00:00:00Z', deleted_at: 'now' },
];
const state = {
  companies: [{ id: 'C1', name: '株式会社アルファ', kind: '得意先', taxCat: '課税10%' }, { id: 'C2', name: '非課税会', kind: '得意先', taxCat: '非課税' },
              { id: 'C3', name: 'ガンマ商事', kind: '仕入先' }],
  bills: [
    { id: 'B2', no: 'BIL-202608-001', companyId: 'C3', bookMonth: '2026-08', status: '確定', total: 110000, items: [{ accountCode: '5100', amount: 100000, taxCat: '課税10%' }], dueDate: '2026-09-30', updatedAt: '2026-09-01' },
    { id: 'B5', no: 'BIL-202608-002', companyId: 'C3', bookMonth: '2026-08', status: '確定', items: [{ accountCode: '5100', amount: 5000 }], updatedAt: '2026-09-01' },
    { id: 'B6', no: 'BIL-202608-003', companyId: 'C3', bookMonth: '2026-08', status: '作成中', items: [{ accountCode: '5100', amount: 5000 }], updatedAt: '2026-09-01' },
    { id: 'B7', no: 'BIL-202607-009', companyId: 'C3', bookMonth: '2026-07', status: '確定', demo: true, items: [{ accountCode: '5100', amount: 1 }] },
  ],
  payments: [
    { id: 'P1', companyId: 'C1', date: '2026-08-31', amount: 110000, status: '確定' },
    { id: 'P2', companyId: 'C1', date: '2026-07-31', amount: 50000, status: '確定' },
    { id: 'P3', companyId: 'C1', date: '2026-07-10', amount: 1, status: '取消' },
  ],
  invoices: [
    { id: 'I1', companyId: 'C1', bookMonth: '2026-08', total: 110000, status: '確定' },
    { id: 'I2', companyId: 'C2', bookMonth: '2026-08', total: 50000, status: '確定' },
    { id: 'I3', companyId: 'C1', bookMonth: '2026-08', total: 54000, taxCat: '軽減8%', status: '確定' },
    { id: 'I4', companyId: 'C1', bookMonth: '2026-08', total: 30000, taxCat: '対象外', status: '確定' },
    { id: 'I5', companyId: 'C1', bookMonth: '2026-08', total: 33000, subtotal: 30000, taxCat: '非課税', status: '確定' },
  ],
  payouts: [],
}
const pool = { query: async (sql, p) => {
  const q = String(sql).replace(/\s+/g, ' ').trim();
  const live = r => !r.deleted_at;
  if (/^SELECT updated_at FROM app_state/.test(q)) return { rows: [{ updated_at: new Date(0) }] };
  if (/^SELECT data, updated_at FROM app_state/.test(q)) return { rows: [{ data: state, updated_at: new Date(0) }] };
  if (q.includes('COUNT(*)')) {
    const ids = q.includes('ANY($2)') ? p[1] : null;
    const m = {}; FROWS.filter(r => r.entity === p[0] && live(r) && (!ids || ids.includes(r.entity_id))).forEach(r => { m[r.entity_id] = (m[r.entity_id] || 0) + 1; });
    return { rows: Object.keys(m).map(k => ({ entity_id: k, n: m[k] })) };
  }
  if (q.includes('WHERE entity=$1 AND entity_id=$2')) return { rows: FROWS.filter(r => r.entity === p[0] && r.entity_id === p[1] && live(r)) };
  if (q.includes('data FROM attachments WHERE id=$1 AND deleted_at IS NULL')) return { rows: FROWS.filter(r => r.id === p[0] && live(r)) };
  if (/FROM api_integrations WHERE key_hash=/.test(q)) return { rows: KEYS.filter(r => r.key_hash === p[0]) };
  return { rows: [], rowCount: 0 };
} };
STC.invalidateStateCache && STC.invalidateStateCache();

(async () => {
  console.log('\n■ 数え方・一覧（中身は読まない）');
  eq('ids を渡すとその伝票だけ・消したファイルは数えない', await FILES.attachmentCounts(pool, 'bills', ['B2', 'B9', 'B5']), { B2: 2 });
  eq('書類の種類が無いものは「その他」', (await FILES.listAttachments(pool, 'bills', 'B2')).map(f => f.docType), ['請求書', 'その他']);
  eq('知らない種類は「その他」に丸める', [FILES.docTypeOf('請求書'), FILES.docTypeOf('秘密'), FILES.docTypeOf('')], ['請求書', 'その他', 'その他']);

  console.log('\n■ AI・API 用の形（どの伝票の・どの会社の・何月の・いくらの）');
  {
    const bills = A.attScreen('bills');
    const out = await A.attachmentsOf(pool, state, bills, 'B2');
    eq('伝票の要約', [out.record.company_name, out.record.month, out.record.amount_incl_tax, out.record.amount_excl_tax, out.file_count],
      ['ガンマ商事', '2026-08', 110000, 100000, 2]);
    eq('ファイルの取り出し口が付く', out.files[0].download_path, '/api/v1/attachments/file/F1');
    eq('無い伝票は null', await A.attachmentsOf(pool, state, bills, 'NOPE'), null);
    const m = await A.missingAttachments(pool, state, A.MISSING_SCREENS, {});
    eq('証憑なし: 確定した支払請求・取消でない入金・確定した請求（作成中・取消・デモは除く）',
      m.items.map(x => x.screen + ':' + x.id).sort(), ['bills:B5', 'invoices:I1', 'invoices:I2', 'invoices:I3', 'invoices:I4', 'invoices:I5', 'payments:P2']);
    const m2 = await A.missingAttachments(pool, state, ['payments'], { monthFrom: '2026-08' });
    eq('月で絞れる', m2.items.map(x => x.id), []);
    const m3 = await A.missingAttachments(pool, state, ['invoices'], { companyId: 'C2' });
    eq('取引先で絞れる・税区分も返す', m3.items.map(x => [x.id, x.tax_category, x.amount_excl_tax]), [['I2', '非課税', 50000]]);
  }

  console.log('\n■ MCP ツール（読むだけ・鍵の範囲だけ）');
  {
    const run = (name, args, scopes) => T.toolByName(name).run({ pool, scopes, actor: 'test' }, args);
    const names = ['list_attachments', 'get_attachment', 'list_missing_attachments'];
    eq('3つとも読み取りの印', names.map(n => T.toolByName(n).annotations.readOnlyHint), [true, true, true]);
    eq('引数は決まった形だけ', T.validateArgs(T.toolByName('list_attachments'), { screen: 'bills', id: 'B2', sql: 'x' }) !== null, true);
    eq('鍵に bills.read が無ければ 支払請求のファイル一覧は要るスコープで止まる', T.toolByName('list_attachments').scopeFor({ screen: 'bills' }), 'bills.read');
    const l = await run('list_attachments', { screen: 'bills', id: 'B2' }, ['bills.read']);
    eq('一覧が返る', l.files.map(f => f.file_id), ['F1', 'F3']);
    const g = await run('get_attachment', { file_id: 'F1' }, ['bills.read']);
    eq('PDF は中身を添える（JSON には入れない）', [g.content_included, JSON.stringify(g).includes('JVBER'), !!g.__embed], [true, false, true]);
    const res = SRV.toolResult(g, false);
    eq('MCP の返事: PDF は resource として付く', [res.content.length, res.content[1].type, res.content[1].resource.mimeType, Buffer.from(res.content[1].resource.blob, 'base64').slice(0, 5).toString()],
      [2, 'resource', 'application/pdf', '%PDF-']);
    const gi = SRV.toolResult(await run('get_attachment', { file_id: 'F2' }, ['payments.read']), false);
    eq('画像は image として付く', [gi.content[1].type, gi.content[1].mimeType], ['image', 'image/png']);
    const gw = await run('get_attachment', { file_id: 'F3' }, ['bills.read']);
    eq('Word は中身を返さない', [gw.content_included, !!gw.__embed, SRV.toolResult(gw, false).content.length], [false, false, 1]);
    let err = null; try { await run('get_attachment', { file_id: 'F1' }, ['payments.read']); } catch (e) { err = e.code; }
    eq('範囲外の表のファイルは「無い」と同じ答え', err, 'not-found');
    err = null; try { await run('get_attachment', { file_id: 'F4' }, ['bills.read']); } catch (e) { err = e.code; }
    eq('消したファイルは読めない', err, 'not-found');
    const mm = await run('list_missing_attachments', {}, ['payments.read']);
    eq('証憑なしは 読める表だけ', Object.keys(mm.by_screen), ['payments']);
    err = null; try { await run('list_missing_attachments', { month_from: '2026/08' }, ['payments.read']); } catch (e) { err = e.code; }
    eq('月の形が違えば断る', err, 'bad-input');
  }

  console.log('\n■ API（/api/v1/attachments/…）を本当に叩く');
  {
    const express = require(require.resolve('express', { paths: [path.join(ROOT, 'backend', 'node_modules')] }));
    const KEY_B = 'bl_live_' + 'd'.repeat(40), KEY_P = 'bl_live_' + 'e'.repeat(40);
    const row = (id, key, scopes) => ({ id, name: 'テスト' + id, key_hash: K.sha256(key), key_prefix: key.slice(8, 12), key_last4: key.slice(-4),
      scopes, status: 'active', note: '', created_by: 't', created_at: new Date(), last_used_at: null, expires_at: null, revoked_at: null, rotated_from: null });
    global.KEYS = [row('k-bills', KEY_B, ['bills.read']), row('k-pay', KEY_P, ['payments.read'])];
    const AUD = [];
    const app = express(); app.use(express.json());
    app.use(RT.apiV1Router({ pool, verifyBearer: async () => null, verifyAdmin: async () => null, audit: (...x) => AUD.push(x) }));
    const server = app.listen(0); await new Promise(r => server.once('listening', r));
    const B = 'http://127.0.0.1:' + server.address().port;
    const get = (p, key) => fetch(B + p, { headers: { 'x-api-key': key } });
    const r1 = await get('/v1/attachments/bills/B2', KEY_B);
    eq('一覧は 200', [r1.status, (await r1.json()).file_count], [200, 2]);
    eq('範囲外の表は 403', (await get('/v1/attachments/bills/B2', KEY_P)).status, 403);
    const r2 = await get('/v1/attachments/file/F1', KEY_B);
    const body = Buffer.from(await r2.arrayBuffer());
    eq('ファイル本体が返る（ダウンロードとして）', [r2.status, r2.headers.get('content-type'), body.slice(0, 5).toString(), /attachment;/.test(r2.headers.get('content-disposition'))],
      [200, 'application/pdf', '%PDF-', true]);
    eq('ファイルを読んだことは監査に残る', AUD.some(a => a[1] === 'api-file-read' && a[2] === 'F1'), true);
    eq('範囲外の表のファイルは 403', (await get('/v1/attachments/file/F1', KEY_P)).status, 403);
    eq('無いファイルは 404', (await get('/v1/attachments/file/NOPE', KEY_B)).status, 404);
    const r3 = await get('/v1/attachments/missing', KEY_B);
    const j3 = await r3.json();
    eq('証憑なし（読める表だけ）', [r3.status, j3.items.map(x => x.id)], [200, ['B5']]);
    eq('書き込みの口は無い（POST は 404）', (await fetch(B + '/v1/attachments/bills/B2', { method: 'POST', headers: { 'x-api-key': KEY_B } })).status, 404);
    const spec = await (await fetch(B + '/v1/openapi.json')).json();
    eq('仕様書に載っている', ['/attachments/{screen}/{id}', '/attachments/file/{fileId}', '/attachments/missing'].every(k => spec.paths[k]), true);
    server.close();
  }

  console.log('\n■ 請求の税区分（税抜の式）— 画面と backend で同じ数字');
  {
    const html = fs.readFileSync(ROOT + '/web/index.html', 'utf8');
    const s0 = html.lastIndexOf('<script>'), e0 = html.lastIndexOf('</script>');
    let code = html.slice(s0 + 8, e0).replace(/\/\* ============ 起動 ============ \*\/[\s\S]*$/, '');
    code += '\n;globalThis.__x={ setDB:v=>{DB=v}, docNet, docTaxCat, mfToInvoice, invTaxBadge, attMissing, setCounts:v=>{ATT_COUNTS=v} };';
    const noop = () => {};
    const el = { innerHTML: '', style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, querySelector: () => null,
      querySelectorAll: () => [], addEventListener: noop, appendChild: noop, focus: noop, dataset: {}, value: '', setAttribute: noop, remove: noop };
    const ctx = { console, setTimeout, clearTimeout, setInterval: () => 0, fetch: async () => ({ ok: false, json: async () => ({}) }),
      location: { origin: 'https://finance.biglight.jp', hash: '', search: '' }, localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
      document: { getElementById: () => el, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, createElement: () => el, body: el },
      window: { innerWidth: 1400, addEventListener: noop }, history: { replaceState: noop }, EventSource: function () {}, navigator: {}, alert: noop, confirm: () => true,
      Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL: noop } };
    ctx.globalThis = ctx; ctx.window.location = ctx.location;
    vm.createContext(ctx); vm.runInContext(code, ctx);
    const W = ctx.__x;
    W.setDB(state);
    const web = state.invoices.map(i => W.docNet(i)), be = state.invoices.map(i => FIN.docNet(i, state));
    eq('税抜: 課税10%・非課税の会社・軽減8%・対象外・税抜の指定あり', web, [100000, 50000, 50000, 30000, 30000]);
    eq('画面と backend が同じ', be, web);
    eq('税区分: 伝票 → 取引先 → 課税10%', state.invoices.map(i => W.docTaxCat(i)), ['課税10%', '非課税', '軽減8%', '対象外', '非課税']);
    eq('backend も同じ税区分', state.invoices.map(i => FIN.docTaxCat(i, state)), state.invoices.map(i => W.docTaxCat(i)));
    eq('明細のある請求は 明細の税抜（税区分は見ない）', W.docNet({ companyId: 'C2', total: 999, items: [{ amount: 700 }] }), 700);

    const mf = (x, cid) => { const r = W.mfToInvoice(Object.assign({ mfId: 'M', salesDate: '2026-08-31', billingDate: '2026-08-31' }, x), cid); return [r.taxCat, r.subtotal]; };
    eq('MF: 税込＝税抜 → 対象外', mf({ total: 50000, subtotal: 50000 }, 'C1'), ['対象外', 50000]);
    eq('MF: 税込＝税抜・会社が非課税 → 非課税', mf({ total: 50000, subtotal: 50000 }, 'C2'), ['非課税', 50000]);
    eq('MF: 10% → 課税10%', mf({ total: 110000, subtotal: 100000 }, 'C1'), ['課税10%', 100000]);
    eq('MF: 8% → 軽減8%', mf({ total: 108000, subtotal: 100000 }, 'C1'), ['軽減8%', 100000]);
    eq('MF: どちらでもない → 混在（税抜は MF のまま）', mf({ total: 105000, subtotal: 100000 }, 'C1'), ['混在', 100000]);
    eq('MF: 税抜の無い CSV・会社が非課税 → 税抜＝税込（以前は ÷1.1 していた）', mf({ total: 50000 }, 'C2'), ['非課税', 50000]);
    eq('MF: 税抜の無い CSV・課税の会社 → ÷1.1', mf({ total: 110000 }, 'C1'), ['課税10%', 100000]);
    eq('非課税・対象外の印は 黄色', [/b-amber/.test(W.invTaxBadge(state.invoices[3])), /b-gray/.test(W.invTaxBadge(state.invoices[0]))], [true, true]);

    console.log('\n■ 画面の「証憑なし」の判定（backend と同じ）');
    W.setCounts({ bills: { B2: 2 }, payments: { P1: 1 } });
    eq('確定した支払請求で0件 → 証憑なし', state.bills.map(b => W.attMissing('bills', b)), [false, true, false, false]);
    eq('入金: 取消は数えない', state.payments.map(p => W.attMissing('payments', p)), [false, true, false]);
    W.setCounts({});
    eq('数がまだ分からなければ決めつけない', W.attMissing('invoices', state.invoices[0]), false);
  }

  console.log(`\n結果: ${pass} 件成功 / ${fail} 件失敗`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
