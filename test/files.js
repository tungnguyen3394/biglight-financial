/* ============================================================================
   添付ファイルのテスト — 種類は「中身」で決まるか、危ないものを断るか
   実行:  node test/files.js
   ========================================================================== */
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const ts = require(path.join(ROOT, 'backend/node_modules/typescript'));
function loadTs(file) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  const req = spec => require(require.resolve(spec, { paths: [path.join(ROOT, 'backend', 'node_modules')] }));
  new Function('module', 'exports', 'require', js)(mod, mod.exports, req);
  return mod.exports;
}
const F = loadTs(ROOT + '/backend/src/files.ts');

let pass = 0, fail = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b);
  ok ? pass++ : fail++; console.log((ok ? '  ok  ' : '  NG  ') + name + (ok ? '' : `  → ${JSON.stringify(a)} (期待 ${JSON.stringify(b)})`)); };
const pad = (head, n = 64) => Buffer.concat([Buffer.isBuffer(head) ? head : Buffer.from(head, 'latin1'), Buffer.alloc(n)]);

console.log('\n― 受け付けるもの（中身で判断） ―');
eq('PDF', F.sniff(pad('%PDF-1.7\n'), 'a.pdf').kind, 'PDF');
eq('拡張子が違っても中身がPDFならPDF', F.sniff(pad('%PDF-1.4\n'), 'invoice.txt').kind, 'PDF');
eq('PNG', F.sniff(pad(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'a.png').mime, 'image/png');
eq('JPEG（スマホの写真）', F.sniff(pad(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'IMG_0001.jpg').mime, 'image/jpeg');
eq('HEIC（iPhone の写真）', F.sniff(pad(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic', 'latin1')])), 'IMG.HEIC').kind, '画像');
const zip = inner => pad(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(inner, 'latin1')]), 200);
eq('Excel（xlsx）', F.sniff(zip('[Content_Types].xml ... xl/workbook.xml'), 'a.xlsx').kind, 'Excel');
eq('Word（docx）', F.sniff(zip('[Content_Types].xml ... word/document.xml'), 'a.docx').kind, 'Word');
const ole = extra => pad(Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), extra || Buffer.alloc(0)]), 200);
eq('古い Excel（xls）', F.sniff(ole(), '見積.xls').kind, 'Excel');
eq('古い Word（doc）', F.sniff(ole(), '契約.doc').kind, 'Word');

console.log('\n― 断るもの ―');
eq('マクロ入り xlsm（vbaProject.bin）', F.sniff(zip('[Content_Types].xml xl/ xl/vbaProject.bin'), 'a.xlsm').ok, false);
eq('マクロ入り 古いxls（_VBA_PROJECT）', F.sniff(ole(Buffer.from('_VBA_PROJECT', 'utf16le')), 'a.xls').ok, false);
eq('ただの ZIP', F.sniff(zip('hello.txt'), 'a.zip').ok, false);
eq('実行ファイル（MZ）', F.sniff(pad('MZ\x90\x00'), 'setup.pdf').ok, false);
eq('HTML（拡張子を pdf にしても）', F.sniff(pad('<html><script>'), 'fake.pdf').ok, false);
eq('空', F.sniff(Buffer.alloc(0), 'a.pdf').ok, false);
eq('古い形式で拡張子が xls/doc 以外は断る', F.sniff(ole(), 'a.ppt').ok, false);

console.log('\n― ファイル名 ―');
eq('パスの記号を取る', F.safeName('../../etc/passwd'), '.._.._etc_passwd');
eq('制御文字を取る（ヘッダー注入を防ぐ）', F.safeName('a\r\nSet-Cookie: x.pdf'), 'aSet-Cookie_ x.pdf');
eq('日本語はそのまま', F.safeName('請求書_2026年9月.pdf'), '請求書_2026年9月.pdf');
eq('空なら file', F.safeName(''), 'file');
eq('10MB まで', F.MAX_FILE_BYTES, 10 * 1024 * 1024);
eq('添付できる台帳', Object.keys(F.ATTACH_ENTITIES).sort(), ['bills', 'companies', 'costItems', 'expenses', 'invoices', 'payments', 'payouts', 'properties']);

console.log(`\n結果: ${pass} 件成功 / ${fail} 件失敗`);
process.exit(fail ? 1 : 0);
