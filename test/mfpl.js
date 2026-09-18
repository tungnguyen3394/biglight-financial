/* MF 会計 の試算表（損益）→ 予実の実績（backend/src/mfpl.ts）。実行: node test/mfpl.js */
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const ts = require(path.join(ROOT, 'backend/node_modules/typescript'));
function loadTs(file) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
  const mod = { exports: {} }; new Function('module', 'exports', 'require', js)(mod, mod.exports, require); return mod.exports;
}
const P = loadTs(ROOT + '/backend/src/mfpl.ts');
let pass = 0, fail = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : fail++;
  console.log((ok ? '  ok  ' : '  NG  ') + name + (ok ? '' : `  → ${JSON.stringify(a)} (期待 ${JSON.stringify(b)})`)); };

/* 公式仕様の例そのままの形 */
const report = { columns: ['opening_balance', 'debit_amount', 'credit_amount', 'closing_balance', 'ratio'], rows: [
  { name: '売上高合計', type: 'financial_statement_item', values: [1000, 0, 500, 1500, 100], rows: [
    { name: '売上高', type: 'account', rows: null, values: [1000, 0, 500, 1500, 98] },
    { name: '売上値引・返品', type: 'account', rows: null, values: [0, 20, 0, -20, -1] } ] },
  { name: '売上原価', type: 'financial_statement_item', values: [0, 100, 0, 100, 5], rows: [
    { name: '仕入高', type: 'account', rows: null, values: [0, 100, 0, 100, 5] } ] },
  { name: '販売費及び一般管理費', type: 'financial_statement_item', values: [], rows: [
    { name: '給与手当', type: 'account', rows: null, values: [200, 300, 0, 500, 20] },
    { name: '支払手数料', type: 'account', rows: null, values: [0, 0, 0, 0, 0] },
    { name: 'ＭＦ専用科目', type: 'account', rows: null, values: [0, 7, 0, 7, 0] } ] },
  { name: '営業利益', type: 'financial_statement_item', values: [0, 0, 0, 880, 0], rows: [] },
  { name: '営業外費用', type: 'financial_statement_item', values: [], rows: [{ name: '支払利息', type: 'account', rows: null, values: [0, 3, 0, 3, 0] }] },
] };
console.log('\n― 試算表を読む ―');
const rows = P.parsePlReport(report);
eq('科目の行だけ・その月の金額＝closing−opening', rows.map(r => [r.section, r.name, r.amount]),
  [['売上高合計', '売上高', 500], ['売上高合計', '売上値引・返品', -20], ['売上原価', '仕入高', 100], ['販売費及び一般管理費', '給与手当', 300], ['販売費及び一般管理費', '支払手数料', 0], ['販売費及び一般管理費', 'ＭＦ専用科目', 7], ['営業外費用', '支払利息', 3]]);
eq('区分 → この システムの区分（営業外費用は マイナス）', [P.sectionKind('売上高合計'), P.sectionKind('営業外費用'), P.sectionKind('営業利益')],
  [{ kind: 'revenue', sign: 1 }, { kind: 'nonop', sign: -1 }, { kind: '', sign: 1 }]);

console.log('\n― 実績に写す ―');
const st = { accounts: [
  { id: 'R4', code: 'R4', label: '売上高', kind: 'revenue', parentId: '' }, { id: 'R6', code: 'R6', label: '販売費及び一般管理費', kind: 'sga', parentId: '' },
  { id: 'R5', code: 'R5', label: '売上原価', kind: 'cogs', parentId: '' }, { id: 'R7', code: 'R7', label: '営業外損益', kind: 'nonop', parentId: '' },
  { id: 'A1', code: '4100', label: '売上高', parentId: 'R4' }, { id: 'A2', code: '6110', label: '給与手当', parentId: 'R6' }, { id: 'A3', code: '6400', label: '支払手数料', parentId: 'R6' } ],
  actuals: [{ id: 'x', fy: 2026, mIndex: 1, accountCode: '6110', amount: 999 }, { id: 'y', fy: 2026, mIndex: 2, accountCode: '6110', amount: 5 }] };
const r = P.applyPl(st, '2026-09', rows, { actor: 'me' });
const by = c => r.state.actuals.filter(a => a.accountCode === c && a.mIndex === 1).map(a => a.amount);
eq('同じ名前の科目に入る（売上 500・給与 300）。手で入れた 9月の実績は置き換え、10月はそのまま', [by('4100'), by('6110'), r.state.actuals.find(a => a.id === 'y').amount], [[500], [300], 5]);
const made = r.state.accounts.filter(a => a.source === 'mf');
eq('無い科目は その区分の下に作る（売上値引・仕入高・ＭＦ専用科目・支払利息）', made.map(a => [a.label, a.parentId, a.code[0]]),
  [['売上値引・返品', 'R4', '4'], ['仕入高', 'R5', '5'], ['ＭＦ専用科目', 'R6', '6'], ['支払利息', 'R7', '7']]);
eq('営業外費用は マイナスで入る', r.state.actuals.find(a => a.accountCode === made[3].code).amount, -3);
eq('統計（売上・費用）', [r.stats['売上'], r.stats['費用'], r.stats['新しい科目'], r.stats['手入力を置き換え']], [480, 404, 4, 1]);
eq('MF から来た印', r.state.actuals.filter(a => a.mIndex === 1).every(a => a.source === 'mf' && a.ym === '2026-09'), true);
const r2 = P.applyPl(r.state, '2026-09', rows, { actor: 'me' });
eq('もう一度写しても 増えない・科目も増えない', [r2.state.actuals.length, r2.state.accounts.length, r2.stats['新しい科目']], [r.state.actuals.length, r.state.accounts.length, 0]);
const renamed = JSON.parse(JSON.stringify(r.state)); renamed.accounts.find(a => a.label === '仕入高').label = '外注費（仕入）';
eq('こちらで科目名を直しても MF の名前を覚えているので同じ科目に入る', P.applyPl(renamed, '2026-09', rows, {}).state.accounts.length, r.state.accounts.length);
console.log(`\n結果: ${pass} 件成功 / ${fail} 件失敗`); process.exit(fail ? 1 : 0);
