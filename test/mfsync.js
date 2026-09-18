/* ============================================================================
   MoneyForward 取り込みの規則テスト（backend/src/mfsync.ts）
   実行:  node test/mfsync.js
   ここに並ぶのは「受け入れ条件」そのものです。1つでも落ちたら本番に出しません。
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
const S = loadTs(ROOT + '/backend/src/mfsync.ts');
const AZ = loadTs(ROOT + '/backend/src/authz.ts');

let pass = 0, fail = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b);
  ok ? pass++ : fail++; console.log((ok ? '  ok  ' : '  NG  ') + name + (ok ? '' : `  → ${JSON.stringify(a)} (期待 ${JSON.stringify(b)})`)); };

const baseState = () => ({
  settings: {},
  companies: [
    { id: 'C1', name: '株式会社高山', kana: 'タカヤマ', kind: '得意先', mfPartnerId: 'p1' },
    { id: 'C2', name: 'テスト物流株式会社', kana: 'テストブツリュウ', kind: '得意先' },
    { id: 'C3', name: '株式会社サンプル精機', kana: 'サンプルセイキ', kind: '得意先', bankPayerNames: ['ｻﾝﾌﾟﾙｾｲｷ(ｶ'] },
  ],
  invoices: [], payments: [], billingRules: [], trialBalance: [],
});
const bill = (o) => Object.assign({ mfId: 'm1', number: 'B-1', partnerId: 'p1', partnerName: '株式会社高山',
  billingDate: '2026-08-31', salesDate: '2026-08-31', dueDate: '2026-09-30', subtotal: 100000, total: 110000, isLocked: true }, o);

console.log('\n― 請求書の取り込み ―');
{
  const st = baseState();
  const r1 = S.applyBillings(st, [bill({}), bill({ mfId: 'm2', number: 'B-1', partnerId: '', partnerName: 'テスト物流株式会社', total: 220000, subtotal: 200000 })]);
  eq('取引先IDと名前で当てる → 2件', [r1.state.invoices.length, r1.state.invoices.map(i => i.companyId)], [2, ['C1', 'C2']]);
  eq('同じ請求書番号でも MF の id が違えば別の請求', r1.state.invoices.map(i => i.no), ['B-1', 'B-1']);
  eq('請求ルールが無ければ自動で確定', r1.state.invoices.map(i => i.confirmStatus), ['確定', '確定']);
  /* 冪等: 同じものをもう一度流しても増えない・変わらない */
  const before = JSON.stringify(r1.state.invoices.map(i => ({ ...i, updatedAt: 0 })));
  /* PDF の場所: 取り込み時に残す。無かった古い分は「変更なし」でも補う（金額には触らない） */
  {
    const p1 = S.applyBillings(st, [bill({ mfId: 'pdf1', pdfUrl: 'https://invoice.moneyforward.com/api/v3/billings/pdf1.pdf' })]);
    const inv1 = p1.state.invoices.find(i => i.mfId === 'pdf1');
    eq('取り込んだ請求に PDF の場所が残る', inv1.mfPdfUrl, 'https://invoice.moneyforward.com/api/v3/billings/pdf1.pdf');
    const old = { ...p1.state, invoices: p1.state.invoices.map(i => i.mfId === 'pdf1' ? { ...i, mfPdfUrl: '' } : i) };
    const p2 = S.applyBillings(old, [bill({ mfId: 'pdf1', pdfUrl: 'https://invoice.moneyforward.com/api/v3/billings/pdf1.pdf' })]);
    const inv2 = p2.state.invoices.find(i => i.mfId === 'pdf1');
    eq('古い取り込み分にも PDF の場所を補う（変更なし扱いのまま）', [p2.stats['変更なし'], p2.stats['更新'], inv2.mfPdfUrl.endsWith('pdf1.pdf'), inv2.total], [1, 0, true, inv1.total]);
  }
  const r2 = S.applyBillings(r1.state, [bill({}), bill({ mfId: 'm2', number: 'B-1', partnerId: '', partnerName: 'テスト物流株式会社', total: 220000, subtotal: 200000 })]);
  eq('2回流しても件数は同じ', r2.state.invoices.length, 2);
  eq('2回流しても中身は変わらない', JSON.stringify(r2.state.invoices.map(i => ({ ...i, updatedAt: 0 }))), before);
  eq('2回目は「変更なし」', r2.stats['変更なし'], 2);
}
{
  const st = baseState();
  const r = S.applyBillings(st, [
    bill({ mfId: 'd1', number: '', isLocked: false, isDownloaded: false, emailStatus: '未送信', postingStatus: '未郵送' }),
    bill({ mfId: 'd2', mfStatus: '下書き' }),
    bill({ mfId: 'ok1', mfStatus: 'ロック中' }),
  ]);
  eq('下書きは取り込まない', [r.state.invoices.length, r.stats['下書き除外']], [1, 2]);
}
{
  /* 確定済みの請求を MF が直した → こちらの数字は動かさず、差異として記録 */
  let st = baseState();
  st = S.applyBillings(st, [bill({})]).state;
  st.invoices[0].confirmStatus = '確定';
  const r = S.applyBillings(st, [bill({ total: 132000, subtotal: 120000 })]);
  eq('確定済みは上書きしない', r.state.invoices[0].total, 110000);
  eq('差異を mfDiff に残す', r.state.invoices[0].mfDiff.fields.total, { finance: 110000, mf: 132000 });
  eq('統計に MF差異 が出る', r.stats['MF差異'], 1);
  /* 未確認なら MF の新しい数字を採用 */
  let st2 = baseState();
  st2 = S.applyBillings(st2, [bill({})]).state;
  st2.invoices[0].confirmStatus = '未確認';
  const r2 = S.applyBillings(st2, [bill({ total: 132000, subtotal: 120000 })]);
  eq('未確認なら更新する', [r2.state.invoices[0].total, r2.stats['更新']], [132000, 1]);
}
{
  /* 請求ルールと金額が違えば 人の確認待ち */
  const st = baseState();
  st.billingRules = [{ id: 'R1', companyId: 'C1', kind: 'fixed', unitPrice: 100000, taxCat: '課税10%', active: true }];
  eq('ルール通り（110,000）なら自動確定', S.applyBillings(st, [bill({})]).state.invoices[0].confirmStatus, '確定');
  eq('ルールと違えば 未確認', S.applyBillings(st, [bill({ total: 121000 })]).state.invoices[0].confirmStatus, '未確認');
}
{
  const st = baseState();
  const r = S.applyBillings(st, [bill({ mfId: 'x1', partnerId: 'p9', partnerName: '知らない会社' })]);
  eq('当てられない取引先は取り込まず、一覧に出す', [r.state.invoices.length, r.plan.unmapped[0].partnerName], [0, '知らない会社']);
  const r2 = S.applyBillings(st, [bill({ mfId: 'x1', partnerId: 'p9', partnerName: '知らない会社' })], { map: { 'id:p9': 'C2' } });
  eq('人が対応づけたら取り込み、次から自動で当たるよう覚える',
    [r2.state.invoices[0].companyId, r2.state.companies.find(c => c.id === 'C2').mfPartnerId], ['C2', 'p9']);
}
{
  /* 締めた月は 自動同期でも触らない */
  let st = baseState();
  st = S.applyBillings(st, [bill({})]).state;
  st.settings.closedFy = [2026];           // 第N期 = 8月〜翌7月。2026 は 2026-08〜2027-07
  const r = S.applyBillings(st, [bill({ total: 999999 }), bill({ mfId: 'new1', number: 'B-9', total: 55000 })]);
  eq('締め済みの月は 更新も新規も入らない', [r.state.invoices.length, r.state.invoices[0].total, r.stats['締め済みで見送り']], [1, 110000, 2]);
  eq('締めた期の月かどうかの判定', [S.isClosedYm(st, '2026-08'), S.isClosedYm(st, '2027-08'), S.isClosedYm(st, '2026-07')], [true, false, false]);
}

console.log('\n― 入金の取り込み ―');
{
  const st = baseState();
  const txns = [
    { extId: 't1', date: '2026-09-10', amount: 110000, payerName: 'ﾀｶﾔﾏ(ｶ' },
    { extId: 't2', date: '2026-09-11', amount: 16500, payerName: 'ｻﾝﾌﾟﾙｾｲｷ(ｶ' },
  ];
  const r = S.applyTransactions(st, txns);
  eq('入金が2件入る', r.state.payments.length, 2);
  eq('出どころと外部IDを持つ', [r.state.payments[0].source, r.state.payments[0].extId], ['mf', 't1']);
  eq('振込名義から取引先を当てる', [r.state.payments[0].companyId, r.state.payments[1].companyId], ['C1', 'C3']);
  const r2 = S.applyTransactions(r.state, txns);
  eq('同じ明細は二重に入らない（extId）', [r2.state.payments.length, r2.stats['取込済み']], [2, 2]);
  const st3 = { ...r.state, settings: { closedFy: [2026] } };
  eq('締めた期の明細は入れない', S.applyTransactions(st3, [{ extId: 't9', date: '2026-09-20', amount: 1000 }]).stats['締め済みで見送り'], 1);
}

console.log('\n― 自動消込 ―');
const withInv = (invs, pays) => {
  const st = baseState();
  st.invoices = invs.map((i, k) => Object.assign({ id: 'I' + (k + 1), status: '確定', confirmStatus: '確定', items: [] }, i));
  st.payments = pays.map((p, k) => Object.assign({ id: 'P' + (k + 1), status: '確定', allocations: [], fee: 0 }, p));
  return st;
};
{
  const st = withInv([{ companyId: 'C1', bookMonth: '2026-08', dueDate: '2026-09-30', total: 110000 }],
    [{ companyId: 'C1', date: '2026-09-25', amount: 110000, payerName: 'ﾀｶﾔﾏ(ｶ' }]);
  const r = S.reconcile(st);
  eq('ぴったり1件 → 自動で消し込む', [r.results[0].matchType, r.results[0].allocations], ['exact', [{ invoiceId: 'I1', amount: 110000 }]]);
  eq('消し込むと残高0', S.invoiceBalance(S.applyReconcile(st, r).state, st.invoices[0]), 0);
}
{
  const st = withInv([{ companyId: 'C1', bookMonth: '2026-08', dueDate: '2026-09-30', total: 110000 }],
    [{ companyId: 'C1', date: '2026-09-25', amount: 109450, payerName: 'ﾀｶﾔﾏ(ｶ' }]);
  const r = S.reconcile(st);
  eq('550円 足りない → 手数料として消し込む', [r.results[0].matchType, r.results[0].fee, r.results[0].allocations[0].amount], ['fee', 550, 109450]);
  const after = S.applyReconcile(st, r).state.payments[0];
  eq('手数料は入金に記録し、売掛金は全額減る', [after.fee, after.matchType], [550, 'fee']);
}
{
  const st = withInv([
    { companyId: 'C1', bookMonth: '2026-07', dueDate: '2026-08-31', total: 66000 },
    { companyId: 'C1', bookMonth: '2026-08', dueDate: '2026-09-30', total: 44000 },
  ], [{ companyId: 'C1', date: '2026-09-20', amount: 110000, payerName: 'ﾀｶﾔﾏ(ｶ' }]);
  const r = S.reconcile(st);
  eq('2枚まとめての振込 → 両方に充てる', [r.results[0].matchType, r.results[0].allocations.map(a => a.amount).sort()], ['multi', [44000, 66000]]);
}
{
  /* 同じ金額の請求書が2社にある → 当てずっぽうで消さない */
  const st = withInv([
    { companyId: 'C1', bookMonth: '2026-08', dueDate: '2026-09-30', total: 16500 },
    { companyId: 'C2', bookMonth: '2026-08', dueDate: '2026-09-30', total: 16500 },
  ], [{ date: '2026-09-25', amount: 16500, payerName: 'ﾅｿﾞﾉﾌﾘｺﾐ' }]);
  const r = S.reconcile(st);
  eq('振込名義が分からなければ 消し込まない', [r.results.length, r.unknownPayer.length], [0, 1]);
  const st2 = withInv([
    { companyId: 'C1', bookMonth: '2026-08', dueDate: '2026-09-30', total: 16500 },
    { companyId: 'C1', bookMonth: '2026-08', dueDate: '2026-09-30', total: 16500 },
  ], [{ companyId: 'C1', date: '2026-09-25', amount: 16500, payerName: 'ﾀｶﾔﾏ(ｶ' }]);
  eq('同じ会社に同額の請求が2枚 → 要確認', S.reconcile(st2).results[0].matchType, 'none');
}
{
  const st = withInv([{ companyId: 'C1', bookMonth: '2026-01', dueDate: '2026-02-28', total: 110000 }],
    [{ companyId: 'C1', date: '2026-09-25', amount: 110000, payerName: 'ﾀｶﾔﾏ(ｶ' }]);
  eq('期日が遠すぎる請求には当てない（−45日〜+15日）', S.reconcile(st).results[0].matchType, 'none');
  const st2 = withInv([{ companyId: 'C1', bookMonth: '2026-08', dueDate: '2026-09-30', total: 110000 }],
    [{ companyId: 'C1', date: '2026-09-25', amount: 110000, payerName: 'ﾀｶﾔﾏ(ｶ', allocations: [{ invoiceId: 'I1', amount: 110000 }] }]);
  eq('すでに充ててある入金は触らない', S.reconcile(st2).results.length, 0);
  const st3 = withInv([{ companyId: 'C1', bookMonth: '2026-08', dueDate: '2026-09-30', total: 110000, confirmStatus: '未確認' }],
    [{ companyId: 'C1', date: '2026-09-25', amount: 110000, payerName: 'ﾀｶﾔﾏ(ｶ' }]);
  eq('未確認の請求には当てない', S.reconcile(st3).results[0].matchType, 'none');
}

console.log('\n― 経理へ渡すもの・突合 ―');
{
  const st = withInv([{ companyId: 'C1', bookMonth: '2026-08', dueDate: '2026-09-30', total: 110000, no: 'B-1', issueDate: '2026-08-31' }],
    [{ companyId: 'C1', date: '2026-09-25', amount: 109450, fee: 550, payerName: 'ﾀｶﾔﾏ(ｶ', extId: 't1', matchType: 'fee', allocations: [{ invoiceId: 'I1', amount: 109450 }] }]);
  const rows = S.settlementRows(st, '2026-09');
  eq('消込一覧の見出し', rows[0].slice(0, 6), ['入金日', '振込名義', '入金額', '振込手数料', 'MF取引ID', '取引先']);
  eq('1行に 入金と請求書の両方', [rows[1][0], rows[1][2], rows[1][3], rows[1][6], rows[1][9], rows[1][10]], ['2026-09-25', 109450, 550, 'B-1', 109450, 'fee']);
  eq('売掛残高（月末時点）', S.arBalanceAt(st, '2026-09'), 0);
  st.trialBalance = [{ ym: '2026-09', code: '', name: '売掛金', amount: 0 }];
  eq('試算表と合えば OK', S.reconciliation(st, '2026-09', S.tbArAmount(st, '2026-09')).ok, true);
  st.trialBalance = [{ ym: '2026-09', code: '', name: '売掛金', amount: 50000 }];
  const rec = S.reconciliation(st, '2026-09', S.tbArAmount(st, '2026-09'));
  eq('合わなければ 差額と 疑わしい伝票を出す', [rec.diff, rec.ok], [-50000, false]);
}

console.log('\n― CSV（API が無くても同じ規則で入る）―');
{
  const csv = '﻿請求書番号,取引先名,件名,請求日,売上計上日,お支払期限,小計,消費税,合計金額,ステータス\n'
    + '"B-1","株式会社高山","9月分","2026/09/30","2026/09/30","2026/10/31","100,000","10,000","110,000","ロック中"\n'
    + '"B-2","㈱高山","10月分","2026/10/31","2026/10/31","2026/11/30","200000","20000","220000","下書き"\n';
  const p = S.parseBillingCsv(csv);
  eq('MF 請求書CSV を読む', p.items.map(x => [x.number, x.billingDate, x.total, x.mfStatus]),
    [['B-1', '2026-09-30', 110000, 'ロック中'], ['B-2', '2026-10-31', 220000, '下書き']]);
  const st = S.applyBillings(baseState(), p.items);
  eq('CSV でも 下書きは入らない', [st.state.invoices.length, st.stats['下書き除外']], [1, 1]);
  eq('CSV を2回読んでも増えない', S.applyBillings(st.state, p.items).state.invoices.length, 1);
  eq('列が足りなければ理由を返す', !!S.parseBillingCsv('a,b\n1,2\n').error, true);

  const bank = '﻿取引日,内容,入金金額,出金金額,残高\n'
    + '"2026/09/25","ﾌﾘｺﾐ ﾀｶﾔﾏ(ｶ","110,000","","1,000,000"\n'
    + '"2026/09/26","ﾃﾞﾝｷﾀﾞｲ","","8,000","992,000"\n';
  const b = S.parseBankCsv(bank);
  eq('銀行CSV は入金の行だけ読む', b.items.map(x => [x.date, x.amount, x.payerName]), [['2026-09-25', 110000, 'ﾌﾘｺﾐ ﾀｶﾔﾏ(ｶ']]);
  const st2 = S.applyTransactions(baseState(), b.items);
  eq('銀行CSV → 入金（振込名義から会社も当てる）', [st2.state.payments.length, st2.state.payments[0].companyId], [1, 'C1']);
  eq('同じ銀行CSV を2回読んでも増えない', S.applyTransactions(st2.state, b.items).state.payments.length, 1);

  const tb = '﻿勘定科目コード,勘定科目,期末残高\n"1130","売掛金","264,000"\n"5000","売上高","1,000,000"\n';
  const t = S.parseTrialBalanceCsv(tb);
  eq('試算表CSV を読む', t.items.map(x => [x.name, x.amount]), [['売掛金', 264000], ['売上高', 1000000]]);
  const st3 = S.applyTrialBalance(baseState(), '2026-09', t.items);
  eq('試算表は別置き（実績は上書きしない）', [st3.state.trialBalance.length, S.tbArAmount(st3.state, '2026-09')], [2, 264000]);
  eq('同じ月を入れ直すと置き換わる（増えない）', S.applyTrialBalance(st3.state, '2026-09', t.items).state.trialBalance.length, 2);
}

console.log('\n― 締めはサーバーでも守る（画面を通さない書き込みも止める）―');
{
  const st = { settings: { closedFy: [2026] },
    invoices: [{ id: 'I1', bookMonth: '2026-08', total: 110000 }],
    payments: [{ id: 'P1', date: '2026-08-31', amount: 1000 }] };
  eq('締めた期の請求は書き換えられない', AZ.checkClosedPeriods(st, { invoices: [{ id: 'I1', bookMonth: '2026-08', total: 999 }] }, {}).reason, 'period-closed');
  eq('締めた期に新しい伝票も入れられない', AZ.checkClosedPeriods(st, { payments: [{ id: 'P9', date: '2026-08-10', amount: 5 }] }, {}).reason, 'period-closed');
  eq('締めた期の伝票は消せない', AZ.checkClosedPeriods(st, {}, { invoices: ['I1'] }).reason, 'period-closed');
  eq('開いている期は通す', AZ.checkClosedPeriods(st, { invoices: [{ id: 'I2', bookMonth: '2027-09', total: 1 }] }, {}).ok, true);
  eq('締め未設定なら全部通す', AZ.checkClosedPeriods({ invoices: [] }, { invoices: [{ id: 'X', bookMonth: '2020-01' }] }, {}).ok, true);
  eq('取り込みも同じ判定を使う（mfsync ⇔ authz）',
    [S.isClosedYm(st, '2026-08'), AZ.checkClosedPeriods(st, { invoices: [{ id: 'I9', bookMonth: '2026-08', total: 1 }] }, {}).ok], [true, false]);
}

console.log('\n― 名寄せ ―');
eq('会社名の表記ゆれ', S.normName('株式会社 高山') === S.normName('㈱高山'), true);
eq('振込名義の表記ゆれ', S.normPayer('ﾌﾘｺﾐ ﾀｶﾔﾏ(ｶ') === S.normPayer('タカヤマ'), true);

console.log(`\n結果: ${pass} 件成功 / ${fail} 件失敗`);
process.exit(fail ? 1 : 0);
