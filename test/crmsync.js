/* ============================================================================
   CRM連携のテスト — 所属機関情報の「BIGLIGHT担当者」が 取引先の担当者に入るか
   実行:  node test/crmsync.js
   ----------------------------------------------------------------------------
   ★ 2026-09-15: CRM 側は変えない。CRM の一覧から出した CSV（取込用）には
     「BIGLIGHT担当者」の列があるので、それを 取引先の owner に入れる。
     API（/export/master）がまだ送ってこない間も、今の担当は消さない。
   ========================================================================== */
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const ts = require(path.join(ROOT, 'backend/node_modules/typescript'));
function loadTs(file) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  const req = spec => spec === './db' ? { pool: { query: async () => ({ rows: [] }) } }
    : spec === './mfsync' ? loadTs(ROOT + '/backend/src/mfsync.ts')
    : require(require.resolve(spec, { paths: [path.join(ROOT, 'backend', 'node_modules')] }));
  new Function('module', 'exports', 'require', js)(mod, mod.exports, req);
  return mod.exports;
}
const C = loadTs(ROOT + '/backend/src/crmsync.ts');

let pass = 0, fail = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b);
  ok ? pass++ : fail++; console.log((ok ? '  ok  ' : '  NG  ') + name + (ok ? '' : `  → ${JSON.stringify(a)} (期待 ${JSON.stringify(b)})`)); };

console.log('\n― CSV（CRM の 取込用 出力）から ―');
const csv = '﻿ID,所属機関名,フリガナ,BIGLIGHT担当者,取引状況\r\n'
  + 'C001,さくら製作所,サクラ,山田 太郎,取引中\r\n'
  + 'C002,東和フーズ,トウワ,,取引中\r\n'
  + 'C003,北関東物流,キタ,佐々木 花子,取引中\r\n';
const recs = C.csvToRecords(C.parseCsv(csv), C.CSV_MAP_COMPANY);
eq('BIGLIGHT担当者 の列を読む', recs.map(r => r.biglightStaff), ['山田 太郎', '', '佐々木 花子']);

const state = { companies: [
  { id: 'CO1', crmId: 'C001', source: 'crm', name: 'さくら製作所', owner: '', closingDay: 31 },
  { id: 'CO2', crmId: 'C002', source: 'crm', name: '東和フーズ', owner: 'tanaka@biglight.jp' },
  { id: 'CO3', crmId: 'C003', source: 'crm', name: '北関東物流', owner: '佐々木花子' },
] };
const out = C.applyCrmPayload(state, { companies: recs });
const by = id => out.state.companies.find(c => c.crmId === id);
eq('担当が入る', by('C001').owner, '山田 太郎');
eq('CRM が空欄なら 今の担当を消さない', by('C002').owner, 'tanaka@biglight.jp');
eq('空白の違いだけなら 書き換えない', by('C003').owner, '佐々木花子');
eq('会計の項目には触らない', by('C001').closingDay, 31);
eq('担当 という項目名のまま残さない（owner に入れる）', 'biglightStaff' in by('C001'), false);
eq('変わった件数を記録に出す', out.stats.companies.includes('担当変更1'), true);

console.log('\n― API（まだ BIGLIGHT担当者 を送ってこない）から ―');
const out2 = C.applyCrmPayload(out.state, { companies: [{ crmId: 'C001', name: 'さくら製作所' }] });
eq('送ってこなければ 担当はそのまま', out2.state.companies.find(c => c.crmId === 'C001').owner, '山田 太郎');
const out3 = C.applyCrmPayload(out.state, { companies: [{ crmId: 'C001', name: 'さくら製作所', biglightStaff: '中村 次郎' }] });
eq('送ってくるようになれば そのまま使える', out3.state.companies.find(c => c.crmId === 'C001').owner, '中村 次郎');
const out4 = C.applyCrmPayload({ companies: [] }, { companies: [{ crmId: 'C009', name: '新しい会社', biglightStaff: '山田 太郎' }] });
eq('新しく入る会社にも担当が付く', out4.state.companies[0].owner, '山田 太郎');

console.log('\n― CRM が正: MF から自動で作った会社を CRM の会社にする（2026-09-18）―');
{
  const st = { companies: [
    { id: 'CO-mf1', name: '株式会社みどり商事', source: 'mf', mfPartnerId: 'p1', needsReview: true, closingDay: 20 },
    { id: 'CO-man', name: 'あおば工業', source: 'manual' } ], invoices: [{ id: 'I1', companyId: 'CO-mf1' }] };
  const r = C.applyCrmPayload(st, { companies: [{ crmId: 'K1', name: 'みどり商事（株）'.replace('（株）', ' 株式会社'), corpNo: '' }, { crmId: 'K2', name: 'あおば工業' }] });
  const a = r.state.companies.find(c => c.crmId === 'K1');
  eq('同じ名前の MF 会社は 新しく作らず CRM の会社になる（id そのまま）',
    [a && a.id, a && a.source, a && a.mfPartnerId, a && a.needsReview, a && a.closingDay], ['CO-mf1', 'crm', 'p1', false, 20]);
  eq('手入力の会社は 名前が同じでも 取り込まない（今までどおり 新しく作る）', r.state.companies.filter(c => c.name === 'あおば工業').length, 2);
  eq('記録に MF統合 と出る', r.stats.companies.includes('MF統合1'), true);
  const st2 = { companies: [{ id: 'CO-mf2', name: '別名', corpNo: '1234567890123', source: 'mf' }] };
  eq('法人番号が同じなら 名前が違っても CRM の会社になる', C.applyCrmPayload(st2, { companies: [{ crmId: 'K3', name: '正式名', corpNo: '1234567890123' }] }).state.companies.map(c => [c.id, c.name]), [['CO-mf2', '正式名']]);
}

console.log(`\n結果: ${pass} 件成功 / ${fail} 件失敗`);
process.exit(fail ? 1 : 0);
