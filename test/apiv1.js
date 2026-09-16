/* ============================================================================
   API v1 / MCP のテスト
   ----------------------------------------------------------------------------
   実行:  node test/apiv1.js
   いちばん大事なのは【突き合わせ】です:
     画面（web/index.html の ⑦ 計算エンジン）と
     連携（backend/src/apiv1/finance.ts）に同じデータを渡し、
     1円でも違ったら赤にします。AI と画面が違う数字を言う事故を防ぐため。
   TypeScript は backend/node_modules の tsc でその場で変換します（ビルド不要）。
   ========================================================================== */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.error('  ✗   ' + name + (extra ? '  ' + extra : '')); } };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `\n      画面: ${JSON.stringify(a)}\n      連携: ${JSON.stringify(b)}`);

/* ───────── ① backend の TypeScript をその場で読み込む ───────── */
const ts = require(path.join(ROOT, 'backend/node_modules/typescript'));
const _tsCache = new Map();
function loadTs(file) {
  const abs = path.resolve(file);
  if (_tsCache.has(abs)) return _tsCache.get(abs);
  const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  _tsCache.set(abs, mod.exports);
  const req = (spec) => {
    if (spec.startsWith('.')) return loadTs(path.resolve(path.dirname(abs), spec + '.ts'));
    /* express や pg は backend/node_modules から（テストは backend の外にあるため） */
    try { return require(require.resolve(spec, { paths: [path.join(ROOT, 'backend', 'node_modules')] })); }
    catch { return require(spec); }
  };
  new Function('module', 'exports', 'require', '__filename', '__dirname', js)(mod, mod.exports, req, abs, path.dirname(abs));
  _tsCache.set(abs, mod.exports);
  return mod.exports;
}
const F = loadTs(ROOT + '/backend/src/apiv1/finance.ts');
const R = loadTs(ROOT + '/backend/src/apiv1/reports.ts');
const C = loadTs(ROOT + '/backend/src/apiv1/collections.ts');
const K = loadTs(ROOT + '/backend/src/apiv1/keys.ts');
const T = loadTs(ROOT + '/backend/src/mcp/tools.ts');

/* ───────── ② 画面（index.html）を読み込む ───────── */
const html = fs.readFileSync(ROOT + '/web/index.html', 'utf8');
const st0 = html.lastIndexOf('<script>'), en0 = html.lastIndexOf('</script>');
let code = html.slice(st0 + 8, en0).replace(/\/\* ============ 起動 ============ \*\/[\s\S]*$/, '');
code += '\n;globalThis.__x={ DEFAULT_ACCOUNTS, setDB:v=>{DB=v}, setFY:v=>{CUR_FY=v}, setSession:v=>{SESSION=v},' +
  ' f:{docTotal,docNet,itemAmount,paidOfInvoice,balanceOfInvoice,invoiceStatus,agingBucket,arTotal,apTotal,' +
  ' paidOfBill,balanceOfBill,billStatus,actualSeries,planSeries,plBook,cashPlanByMonth,cashPlanByWeek,' +
  ' arBalanceOf,apBalanceOf,lastActualIdx,landing,openInvoices,openBills,effDue,jpHolidays,isBankHoliday} };';
const noop = () => {};
const el = { innerHTML: '', style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, appendChild: noop, focus: noop,
  setSelectionRange: noop, dataset: {}, value: '', textContent: '', setAttribute: noop, remove: noop, closest: () => null };
const ctx = {
  console, setTimeout, clearTimeout, setInterval: () => 0, fetch: async () => ({ ok: false, json: async () => ({}) }),
  location: { origin: 'https://finance.biglight.jp', hash: '', search: '' },
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  document: { getElementById: () => el, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, createElement: () => el, body: el },
  window: { innerWidth: 1400, addEventListener: noop }, history: { replaceState: noop },
  EventSource: function () { this.addEventListener = noop }, navigator: {}, alert: noop, confirm: () => true,
  Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL: noop },
};
ctx.globalThis = ctx; ctx.window.location = ctx.location;
vm.createContext(ctx);
vm.runInContext(code, ctx);
const H = ctx.__x.f;

/* ───────── ③ 突き合わせ用のデータ（実データは使いません） ───────── */
const d = new Date(); const iso = x => x.toISOString().slice(0, 10);
const day = n => { const t = new Date(d); t.setDate(t.getDate() + n); return iso(t); };
const state = {
  companies: [
    { id: 'C1', name: '株式会社アルファ', kana: 'アルファ', kind: '得意先', closingDay: 31, paySite: 1, payDay: 31, bankInfo: '○○銀行 1234567', updatedAt: '2026-09-01T00:00:00.000Z' },
    { id: 'C2', name: 'ベータ工業', kind: '得意先', closingDay: 20, paySite: 2, payDay: 25, updatedAt: '2026-09-02T00:00:00.000Z' },
    { id: 'C3', name: 'ガンマ商事', kind: '仕入先', dueAdjust: 'そのまま', updatedAt: '2026-09-03T00:00:00.000Z' },
  ],
  workers: [{ id: 'W1', name: 'A', code: 'W001', nationality: 'ベトナム', individualNumber: '123456789012', residenceCard: 'AB1234567CD' }],
  assignments: [{ id: 'AS1', workerId: 'W1', companyId: 'C1', joinDate: '2025-04-01', exitDate: '' }],
  billingRules: [{ id: 'R1', companyId: 'C1', kind: 'per_worker', unitPrice: 30000, accountCode: '4100', countMode: 'month_end', taxCat: '課税10%', active: true }],
  invoices: [
    /* 全額入金済み */
    { id: 'I1', no: 'INV-202508-001', companyId: 'C1', bookMonth: '2025-08', dueDate: day(-120), status: '確定',
      items: [{ accountCode: '4100', name: '支援委託料', qty: 3, price: 30000, taxCat: '課税10%' }], updatedAt: '2026-08-31T00:00:00.000Z' },
    /* 一部入金・延滞（90日超） */
    { id: 'I2', no: 'INV-202509-001', companyId: 'C1', bookMonth: '2025-09', dueDate: day(-100), status: '確定',
      items: [{ accountCode: '4100', qty: 2, price: 30000, taxCat: '課税10%' }], updatedAt: '2026-09-05T00:00:00.000Z' },
    /* 期日前（未到来） */
    { id: 'I3', no: 'INV-202510-001', companyId: 'C2', bookMonth: '2025-10', dueDate: day(20), status: '確定',
      items: [{ accountCode: '4200', qty: 1, price: 200000, taxCat: '課税10%' }, { accountCode: '4900', amount: 5000, taxCat: '非課税' }], updatedAt: '2026-09-06T00:00:00.000Z' },
    /* 40日延滞 */
    { id: 'I4', no: 'INV-202511-001', companyId: 'C2', bookMonth: '2025-11', dueDate: day(-40), status: '確定',
      items: [{ accountCode: '4300', qty: 1, price: 88000, taxCat: '課税10%' }], updatedAt: '2026-09-07T00:00:00.000Z' },
    /* 取消（どの数字にも入ってはいけない） */
    { id: 'I5', no: 'INV-202511-002', companyId: 'C2', bookMonth: '2025-11', dueDate: day(-40), status: '取消',
      items: [{ accountCode: '4100', qty: 9, price: 999999, taxCat: '課税10%' }], updatedAt: '2026-09-07T00:00:00.000Z' },
    /* 作成中（未確定） */
    { id: 'I6', no: '', companyId: 'C2', bookMonth: '2025-12', status: '作成中',
      items: [{ accountCode: '4100', qty: 1, price: 10000, taxCat: '課税10%' }], updatedAt: '2026-09-08T00:00:00.000Z' },
  ],
  payments: [
    { id: 'P1', companyId: 'C1', date: day(-110), amount: 99000, fee: 0, status: '確定', allocations: [{ invoiceId: 'I1', amount: 99000 }] },
    { id: 'P2', companyId: 'C1', date: day(-60), amount: 30000, fee: 0, status: '確定', allocations: [{ invoiceId: 'I2', amount: 30000 }] },
    { id: 'P3', companyId: 'C2', date: day(-5), amount: 50000, fee: 0, status: '確定', allocations: [] },          // 未消込
    { id: 'P4', companyId: 'C2', date: day(-5), amount: 77777, fee: 0, status: '取消', allocations: [{ invoiceId: 'I4', amount: 77777 }] },
  ],
  bills: [
    { id: 'B1', no: 'BIL-202509-001', companyId: 'C3', bookMonth: '2025-09', dueDate: day(-10), status: '確定',
      items: [{ accountCode: '5100', name: '外注費', qty: 1, price: 120000, taxCat: '課税10%' }], updatedAt: '2026-09-04T00:00:00.000Z' },
    { id: 'B2', no: 'BIL-202510-001', companyId: 'C3', bookMonth: '2025-10', dueDate: day(15), status: '確定',
      items: [{ accountCode: '6220', name: '通信費', qty: 1, price: 33000, taxCat: '課税10%' }, { accountCode: '5200', amount: 40000, taxCat: '課税10%' }], updatedAt: '2026-09-05T00:00:00.000Z' },
    { id: 'B3', no: 'BIL-202510-002', companyId: 'C3', bookMonth: '2025-10', dueDate: day(-3), status: '確定',
      items: [{ accountCode: '5300', amount: 60000, taxCat: '課税10%' }], updatedAt: '2026-09-06T00:00:00.000Z' },
    { id: 'B4', no: 'BIL-202510-003', companyId: 'C3', bookMonth: '2025-10', dueDate: day(5), status: '取消',
      items: [{ accountCode: '5100', amount: 999999, taxCat: '課税10%' }], updatedAt: '2026-09-06T00:00:00.000Z' },
  ],
  payouts: [
    { id: 'O1', companyId: 'C3', date: day(-8), amount: 60000, status: '確定', allocations: [{ billId: 'B1', amount: 60000 }] },
  ],
  expenses: [
    { id: 'E1', date: day(-30), bookMonth: '2025-10', accountCode: '6200', amount: 220000, taxCat: '課税10%' },
    { id: 'E2', date: day(-20), bookMonth: '2025-10', accountCode: '5100', amount: 110000, taxCat: '課税10%' },
    { id: 'E3', date: day(-15), bookMonth: '2025-11', accountCode: '6310', amount: 50000, taxCat: '対象外' },
  ],
  budgets: [
    { id: 'BU1', fy: 2025, mIndex: 1, accountCode: '4100', amount: 500000 },
    { id: 'BU2', fy: 2025, mIndex: 2, accountCode: '5100', amount: 100000 },
    { id: 'BU3', fy: 2025, mIndex: 3, accountCode: '6200', amount: 200000 },
  ],
  forecasts: [{ id: 'FC1', fy: 2025, mIndex: 4, accountCode: '4100', amount: 700000 }],
  actualAdjust: [{ id: 'AJ1', fy: 2025, mIndex: 0, accountCode: '7100', amount: 12345 }],
  /* ★ 2026-09-16: 費用の実績は 会計事務所の試算表から手入力（税抜）。伝票からは作らない。 */
  actuals: [
    { id: 'AT1', fy: 2025, mIndex: 2, accountCode: '5100', amount: 200000 },
    { id: 'AT2', fy: 2025, mIndex: 2, accountCode: '6200', amount: 220000 },
    { id: 'AT3', fy: 2025, mIndex: 3, accountCode: '6310', amount: 50000 },
  ],
  costPlans: [
    { id: 'CP1', costItemId: 'CI1', ym: '2025-10', amount: 242000 },
    { id: 'CP2', costItemId: 'CI1', ym: '2025-11', amount: 242000 },
  ],
  costItems: [{ id: 'CI1', name: '事務所家賃', accountCode: '6200', kind: 'fixed', monthly: 242000, taxCat: '課税10%' }],
  objectives: [], keyResults: [], checkins: [], departments: [],
  accounts: [], settings: { cashStart: 1000000 }, userPerms: {},
};
state.accounts = ctx.__x.DEFAULT_ACCOUNTS.map((a, i) => ({ id: 'AC' + i, ...a }));
ctx.__x.setDB(state); ctx.DB = state;
ctx.__x.setSession({ email: 'test@biglight.jp', role: 'Admin', status: 'active' });
ctx.__x.setFY(2025);

/* ══════════════════════ ① 画面 ⇔ 連携 の突き合わせ ══════════════════════ */
console.log('\n■ 画面（index.html）と 連携（finance.ts）が同じ数字を出すか');
for (const inv of state.invoices) {
  eq(`請求 ${inv.id} 税込合計`, H.docTotal(inv), F.docTotal(inv));
  eq(`請求 ${inv.id} 税抜`, H.docNet(inv), F.docNet(inv));
  eq(`請求 ${inv.id} 入金済み`, H.paidOfInvoice(inv), F.paidOfInvoice(state, inv));
  eq(`請求 ${inv.id} 残高`, H.balanceOfInvoice(inv), F.balanceOfInvoice(state, inv));
  eq(`請求 ${inv.id} 状態`, H.invoiceStatus(inv), F.invoiceStatus(state, inv));
  eq(`請求 ${inv.id} 年齢区分`, H.agingBucket(inv), F.agingBucket(inv, state));
  eq(`請求 ${inv.id} 調整後の期日`, H.effDue(inv), F.effDue(state, inv));
}
for (const b of state.bills) {
  eq(`支払請求 ${b.id} 合計`, H.docTotal(b), F.docTotal(b));
  eq(`支払請求 ${b.id} 支払済み`, H.paidOfBill(b), F.paidOfBill(state, b));
  eq(`支払請求 ${b.id} 残高`, H.balanceOfBill(b), F.balanceOfBill(state, b));
  eq(`支払請求 ${b.id} 状態`, H.billStatus(b), F.billStatus(state, b));
}
eq('未回収の合計（売掛）', H.arTotal(), F.arTotal(state));
/* 営業日: 祝日の計算と 休業日の判定が 画面とサーバーで同じ */
[2024,2025,2026,2027,2030].forEach(y=>eq(`祝日 ${y}年`, [...H.jpHolidays(y)].sort(), [...F.jpHolidays(y)].sort()));
['2025-10-25','2025-12-31','2026-01-02','2026-09-22','2026-05-06','2026-09-14'].forEach(d=>eq(`休業日 ${d}`, H.isBankHoliday(d), F.isBankHoliday(d)));
eq('未払の合計（買掛）', H.apTotal(), F.apTotal(state));
eq('C1 の売掛残高', H.arBalanceOf('C1'), F.arBalanceOf(state, 'C1'));
eq('C3 の買掛残高', H.apBalanceOf('C3'), F.apBalanceOf(state, 'C3'));
for (const k of ['revenue', 'cogs', 'sga', 'nonop']) {
  eq(`実績12か月 ${k}`, H.actualSeries(2025, k), F.actualSeries(state, 2025, k));
  eq(`予算12か月 ${k}`, H.planSeries(2025, k, 'budget'), F.planSeries(state, 2025, k, 'budget'));
  eq(`見込12か月 ${k}`, H.planSeries(2025, k, 'forecast'), F.planSeries(state, 2025, k, 'forecast'));
}
eq('損益一式（実績）', H.plBook(2025, 'actual'), F.plBook(state, 2025, 'actual'));
eq('損益一式（予算）', H.plBook(2025, 'budget'), F.plBook(state, 2025, 'budget'));
eq('直近で実績のある月', H.lastActualIdx(2025), F.lastActualIdx(state, 2025));
eq('着地見込（売上高）', H.landing(2025, 'revenue', 2), F.landing(state, 2025, 'revenue', 2));
eq('資金繰り（月）', H.cashPlanByMonth(F.thisMonth(), 6), F.cashPlanByMonth(state, F.thisMonth(), 6));
eq('資金繰り（週）', H.cashPlanByWeek(4), F.cashPlanByWeek(state, 4));
eq('未回収の請求の件数', H.openInvoices().length, F.openInvoices(state).length);
eq('未払の支払請求の件数', H.openBills().length, F.openBills(state).length);

/* ══════════════════════ ② 会計の約束が守られているか ══════════════════════ */
console.log('\n■ 会計の約束');
ok('取消の請求は未回収に入らない', !F.openInvoices(state).some(i => i.id === 'I5'));
ok('作成中の請求は未回収に入らない', !F.openInvoices(state).some(i => i.id === 'I6'));
ok('取消の支払請求は未払に入らない', !F.openBills(state).some(b => b.id === 'B4'));
ok('取消の入金は消込に数えない', F.paidOfInvoice(state, state.invoices[3]) === 0);
ok('全額入金の請求は「入金済」', F.invoiceStatus(state, state.invoices[0]) === '入金済');
ok('一部入金かつ期日超過は「一部入金」', F.invoiceStatus(state, state.invoices[1]) === '一部入金');
ok('未入金かつ期日超過は「延滞」', F.invoiceStatus(state, state.invoices[3]) === '延滞');
ok('100日超過は「90日超」の区分', F.agingBucket(state.invoices[1], state) === '90日超');
ok('40日超過は「31〜60日」の区分', F.agingBucket(state.invoices[3], state) === '31〜60日');
ok('期日前は「未到来」', F.agingBucket(state.invoices[2], state) === '未到来');
{
  const rev = F.actualSeries(state, 2025, 'revenue');
  ok('売上は計上月に入る（2025-09 は index 1）', rev[1] === 60000, `rev[1]=${rev[1]}`);
  ok('売上は税抜（60,000 で 66,000 ではない）', rev[1] === 60000);
  const cogs = F.actualSeries(state, 2025, 'cogs');
  /* ★ 2026-09-16: 費用の実績は actuals（試算表からの手入力）だけ。
     2025-10（index 2）の原価は AT1 の 200,000。支払請求 B2・B3（明細あり）や
     旧・経費 E1〜E3 は もう実績に入らない（予定・約束であって実績ではないため）。 */
  ok('費用の実績は手入力の actuals だけ', cogs[2] === 200000, `cogs[2]=${cogs[2]}`)
  ok('明細のある支払請求でも実績にはならない', F.actualSeries(state, 2025, 'cogs')[2] === 200000)
  ok('旧・経費（expenses）は実績に入らない', F.actualSeries(state, 2025, 'sga')[3] === 50000, `sga[3]=${F.actualSeries(state, 2025, 'sga')[3]}`)
  {
    /* actuals を1行足すと、その月・その区分だけが増える */
    const before = F.actualSeries(state, 2025, 'sga')[5]
    state.actuals.push({ id: 'ATX', fy: 2025, mIndex: 5, accountCode: '6220', amount: 77000 })
    ok('actuals を足すと実績が増える', F.actualSeries(state, 2025, 'sga')[5] === before + 77000)
    ok('画面と連携で同じ数字', H.actualSeries(2025, 'sga')[5] === F.actualSeries(state, 2025, 'sga')[5])
    state.actuals = state.actuals.filter(a => a.id !== 'ATX')
  }
  ok('入金しても損益は動かない', F.actualSeries(state, 2025, 'revenue')[0] === 90000);
}

/* ══════════════════════ ③ まとめ（reports.ts） ══════════════════════ */
console.log('\n■ まとめの数字（REST と MCP が同じ関数を使う）');
{
  const ar = R.receivablesReport(state, {});
  ok('未回収の合計が finance.ts と一致', ar.open_total === F.arTotal(state));
  ok('延滞の件数', ar.overdue_count === 2, `overdue_count=${ar.overdue_count}`);
  ok('未消込の入金を見つける', ar.unapplied_payments === 50000, `=${ar.unapplied_payments}`);
  ok('年齢表の合計 = 未回収の合計', Object.values(ar.aging_totals).reduce((s, v) => s + v, 0) === ar.open_total);
  ok('年齢表は残高の大きい会社が先', ar.aging_by_company[0].total >= ar.aging_by_company[1].total);
  const arOver = R.receivablesReport(state, { overdueOnly: true });
  ok('overdue_only は期日超過だけ', arOver.items.every(x => x.days_overdue > 0) && arOver.items.length === 2);
  const arC1 = R.receivablesReport(state, { companyId: 'C1' });
  ok('取引先で絞れる', arC1.items.every(x => x.company.id === 'C1'));

  const ap = R.payablesReport(state, { dueWithinDays: 30 });
  ok('未払の合計が finance.ts と一致', ap.open_total === F.apTotal(state));
  ok('期日超過の件数', ap.overdue_count === 2, `=${ap.overdue_count}`);
  ok('未払のうち売上原価の額', ap.cost_of_sales_in_open_bills === 120000 + 40000 + 60000, `=${ap.cost_of_sales_in_open_bills}`);
  ok('明細に勘定科目の区分が付く', ap.items[0].accounts[0].kind === 'cogs' || ap.items[0].accounts[0].kind === 'sga');

  const pl = R.plReport(state, 2025);
  ok('損益は7行', pl.lines.length === 7);
  ok('売上総利益 = 売上 − 原価', pl.lines[2].ytd_actual === pl.lines[0].ytd_actual - pl.lines[1].ytd_actual);
  ok('経常利益 = 営業利益 + 営業外', pl.lines[6].ytd_actual === pl.lines[4].ytd_actual + pl.lines[5].ytd_actual);
  ok('税抜であることを明記している', /税抜/.test(pl.amounts_are));

  const cf = R.cashflowReport(state, 'month', 6);
  ok('資金繰りの開始残高を使う', cf.starting_balance === 1000000);
  ok('残高見込みが積み上がる', cf.items[0].running_balance === 1000000 + cf.items[0].net);

  const acc = R.companyAccount(state, 'C1');
  ok('取引先の口座に売掛・買掛の両方', acc.ar_balance === F.arBalanceOf(state, 'C1') && acc.ap_balance === F.apBalanceOf(state, 'C1'));
  ok('無い取引先は null', R.companyAccount(state, 'ZZZ') === null);

  const inv = R.invoiceDetail(state, state.invoices[1]);
  ok('請求書1枚にどの入金が充てられたか', inv.payments.length === 1 && inv.payments[0].applied_amount === 30000);
  const bill = R.billDetail(state, state.bills[0]);
  ok('支払請求1枚にどの支払が充てられたか', bill.payouts.length === 1 && bill.payouts[0].applied_amount === 60000);
}

/* ══════════════════════ ④ 台帳・外に出さないもの ══════════════════════ */
console.log('\n■ 台帳と、外に出してはいけないもの');
{
  const authz = fs.readFileSync(ROOT + '/backend/src/authz.ts', 'utf8');
  for (const c of C.COLLECTIONS) {
    ok(`台帳 ${c.id} の配列名 ${c.crmKey} は実在する`, new RegExp('\\b' + c.crmKey + '\\s*:').test(authz) || ['workers', 'assignments', 'accounts'].includes(c.crmKey));
  }
  ok('台帳の id は重複しない', new Set(C.COLLECTIONS.map(c => c.id)).size === C.COLLECTIONS.length);
  /* 逆向きの見張り: 画面を増やして台帳に足し忘れると、外からその表だけ見えない状態になる。
     authz.ts の COLL_PAGE（＝書き込み権限の表）に載っている配列は、全部ここに要る。 */
  {
    const body = (authz.match(/COLL_PAGE[^{]*{([\s\S]*?)}/) || ['', ''])[1];
    const keys = Array.from(body.matchAll(/([A-Za-z][A-Za-z0-9]*)\s*:/g)).map(m => m[1]);
    const missing = keys.filter(k => !C.COLLECTIONS.some(c => c.crmKey === k) && !(C.NOT_EXPOSED||[]).includes(k));
    ok('authz.ts にある表は全部 台帳にある（足し忘れ検出）', missing.length === 0, '足りない: ' + missing.join(', '));
  }
  ok('スコープは台帳から生える', K.SCOPES.length === C.COLLECTIONS.length + K.AGGREGATE_SCOPES.length);

  const w = C.publicRow(C.collectionById('workers'), state.workers[0]);
  ok('個人番号は API に出ない', !('individualNumber' in w));
  ok('在留カード番号は API に出ない', !('residenceCard' in w));
  const big = { id: 'X', file: 'data:image/png;base64,' + 'A'.repeat(900), name: 'ok' };
  const pr = C.publicRow(C.collectionById('companies'), big);
  ok('添付の中身は返さず「付いている」とだけ言う', pr.file && pr.file.attached === true);

  ok('基本の段に個人情報は入らない', !K.SCOPE_LEVELS[0].scopes.some(s => (K.SCOPES.find(x => x.id === s) || {}).danger));
  ok('全画面の段にも個人情報は入らない', !K.SCOPE_LEVELS[1].scopes.some(s => (K.SCOPES.find(x => x.id === s) || {}).danger));
  ok('個人情報は「全画面＋個人情報」だけ', K.SCOPE_LEVELS[2].scopes.includes('workers.read'));
  ok('基本 ⊂ 全画面', K.SCOPE_LEVELS[0].scopes.every(s => K.SCOPE_LEVELS[1].scopes.includes(s)));
  ok('書き込みの範囲は存在しない', !K.SCOPE_IDS.some(s => /\.(write|delete|update)$/.test(s)));

  const key = K.generateKey();
  ok('鍵は bl_live_ + 40文字', key.startsWith('bl_live_') && key.length === 48);
  ok('鍵は毎回違う', K.generateKey() !== K.generateKey());
  ok('画面に出すのは伏せ字だけ', K.maskKey('abcd', '1234') === 'bl_live_abcd••••••••1234');
  ok('知らない範囲は捨てる', JSON.stringify(K.cleanScopes(['invoices.read', 'invoices.write', 'でたらめ'])) === '["invoices.read"]');
}

/* ══════════════════════ ⑤ MCP のツール ══════════════════════ */
console.log('\n■ MCP のツール');
{
  ok('書き込み・削除のツールは無い', !T.TOOLS.some(t => /create|update|delete|write|post/i.test(t.name)));
  ok('どのツールも読み取りの印が付く', T.TOOLS.every(t => !t.annotations || t.annotations.readOnlyHint === true));
  ok('ツール名は重複しない', new Set(T.TOOLS.map(t => t.name)).size === T.TOOLS.length);
  ok('入力は additionalProperties:false', T.TOOLS.every(t => t.inputSchema.additionalProperties === false));
  const gen = T.TOOLS.filter(t => ['list_screens', 'search_records', 'get_record'].includes(t.name));
  ok('汎用の3本がそろっている', gen.length === 3);
  const search = T.toolByName('search_records');
  ok('画面ごとに要る範囲が変わる', search.scopeFor({ screen: 'bills' }) === 'bills.read');
  ok('鍵に画面が1つも無ければ汎用ツールは見せない', search.visible([]) === false);
  ok('鍵に画面があれば見せる', search.visible(['invoices.read']) === true);
  const ar = T.toolByName('list_unpaid_invoices');
  ok('未回収のツールは請求の範囲が要る', ar.scope === 'invoices.read');
  ok('知らない引数は断る', T.validateArgs(ar, { でたらめ: 1 }) !== null);
  ok('型が違えば断る', T.validateArgs(ar, { limit: 'たくさん' }) !== null);
  ok('正しい引数は通る', T.validateArgs(ar, { overdue_only: true, limit: 10 }) === null);
  ok('必須が無ければ断る', T.validateArgs(T.toolByName('search_records'), {}) !== null);
  ok('enum 外の画面は断る', T.validateArgs(T.toolByName('get_record'), { screen: 'secret', id: 'X' }) !== null);
}

/* ══════════════════════ ⑥ 本当に立ち上げて外から叩く ══════════════════════
   ルーターを express に載せ、偽のデータベース（app_state と鍵の表だけ）で
   実際に HTTP を投げます。公式 §17.9 のチェック項目をここで自動化します。 */
const RT = loadTs(ROOT + '/backend/src/apiv1/router.ts');
const MCP = loadTs(ROOT + '/backend/src/mcp/server.ts');
const OA = loadTs(ROOT + '/backend/src/mcp/oauth.ts');
const express = require(require.resolve('express', { paths: [path.join(ROOT, 'backend', 'node_modules')] }));

/* 偽のデータベース: 鍵2本（1本は失効済み）＋ 上のテストデータ */
const KEY_GOOD = 'bl_live_' + 'a'.repeat(40);
const KEY_DEAD = 'bl_live_' + 'b'.repeat(40);
const KEY_LIMITED = 'bl_live_' + 'c'.repeat(40);
const integRow = (id, key, scopes, status) => ({ id, name: 'テスト' + id, key_hash: K.sha256(key), key_prefix: key.slice(8, 12), key_last4: key.slice(-4),
  scopes, status, note: '', created_by: 'test@biglight.jp', created_at: new Date(), last_used_at: null, expires_at: null, revoked_at: null, rotated_from: null });
const ROWS = [
  integRow('int-full-key', KEY_GOOD, K.SCOPE_LEVELS[1].scopes, 'active'),
  integRow('int-dead-key', KEY_DEAD, K.SCOPE_LEVELS[1].scopes, 'revoked'),
  integRow('int-limited', KEY_LIMITED, ['bills.read'], 'active'),
];
const AUDIT = [];
const pool = { query: async (sql, params) => {
  const q = String(sql).replace(/\s+/g, ' ').trim();
  if (/^SELECT updated_at FROM app_state/.test(q)) return { rows: [{ updated_at: new Date(0) }] };
  if (/^SELECT data, updated_at FROM app_state/.test(q)) return { rows: [{ data: state, updated_at: new Date(0) }] };
  if (/FROM api_integrations WHERE key_hash=/.test(q)) return { rows: ROWS.filter(r => r.key_hash === params[0]) };
  if (/FROM api_integrations WHERE id=/.test(q)) return { rows: ROWS.filter(r => r.id === params[0]) };
  if (/^INSERT INTO audit_log/.test(q)) { AUDIT.push(params); return { rows: [] }; }
  return { rows: [], rowCount: 0 };
} };
const deps = { pool, verifyBearer: async () => null, verifyAdmin: async () => null, audit: (a, ac, id, d2) => AUDIT.push([a, ac, id, d2]) };
const cfg = OA.readConfig({ MCP_ENABLED: 'true', MCP_PUBLIC_URL: 'https://finance.biglight.jp/mcp', MCP_TOKEN_SECRET: 'x'.repeat(40) });
const app = express();
app.use(express.json());
app.use(RT.apiV1Router(deps));
app.use(MCP.mcpRouter({ pool, cfg, audit: deps.audit }));

(async () => {
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const B = 'http://127.0.0.1:' + server.address().port;
  const get = (p, h) => fetch(B + p, { headers: h || {} });
  const rpc = (body, h) => fetch(B + '/mcp', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, h || {}), body: JSON.stringify(body) });

  console.log('\n■ 実際に立ち上げて外から叩く（API v1）');
  ok('鍵なしは 401', (await get('/v1/records/invoices')).status === 401);
  ok('死活確認は鍵なしで通る', (await get('/v1/health')).status === 200);
  ok('仕様書は鍵なしで読める', (await get('/v1/openapi.json')).status === 200);
  ok('失効した鍵は 401', (await get('/v1/records/invoices', { 'x-api-key': KEY_DEAD })).status === 401);
  {
    const r = await get('/v1/records/invoices', { 'x-api-key': KEY_GOOD });
    const j = await r.json();
    ok('正しい鍵なら読める', r.status === 200 && j.total === state.invoices.length);
    ok('並びは更新が新しい順', j.items[0].id === 'I6');
  }
  ok('範囲外の表は 403', (await get('/v1/records/invoices', { 'x-api-key': KEY_LIMITED })).status === 403);
  ok('個人情報の表は「全画面」の鍵でも 403', (await get('/v1/records/workers', { 'x-api-key': KEY_GOOD })).status === 403);
  ok('知らない表は 404', (await get('/v1/records/secret', { 'x-api-key': KEY_GOOD })).status === 404);
  {
    const j = await (await get('/v1/reports/receivables', { 'x-api-key': KEY_GOOD })).json();
    ok('未回収レポートが返る', j.open_total === F.arTotal(state));
  }
  ok('合計の数字は範囲が無ければ 403', (await get('/v1/reports/pl', { 'x-api-key': KEY_LIMITED })).status === 403);
  {
    const j = await (await get('/v1/collections', { 'x-api-key': KEY_LIMITED })).json();
    const bills = j.collections.find(c => c.id === 'bills');
    ok('許可の無い表は件数も返さない', bills.granted === true && j.collections.find(c => c.id === 'workers').count === null);
  }

  console.log('\n■ 実際に立ち上げて外から叩く（MCP）');
  ok('GET /mcp は 405（SSEを張らない）', (await get('/mcp')).status === 405);
  ok('/mcp/health は鍵なしで通る', (await get('/mcp/health')).status === 200);
  {
    const r = await get('/.well-known/oauth-protected-resource/mcp');
    const j = await r.json();
    ok('RFC 9728 のメタデータが出る', r.status === 200 && j.resource === 'https://finance.biglight.jp/mcp');
  }
  {
    const j = await (await get('/.well-known/oauth-authorization-server/mcp')).json();
    ok('PKCE S256 必須を宣言している', j.code_challenge_methods_supported.includes('S256'));
    ok('クライアント秘密は使わないと宣言している', j.token_endpoint_auth_methods_supported.join() === 'none');
  }
  {
    const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const j = await r.json();
    ok('トークン無しでも tools/list は通る（登録時の下見）', r.status === 200 && j.result.tools.length === T.TOOLS.length);
  }
  {
    const r = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_yojitsu_summary', arguments: {} } });
    ok('トークン無しの tools/call は 401', r.status === 401);
    ok('401 に WWW-Authenticate が付く', /resource_metadata=/.test(r.headers.get('www-authenticate') || ''));
  }
  {
    const r = await get('/mcp/oauth/authorize?response_type=code&client_id=chatgpt&redirect_uri=https://evil.example.com/x&code_challenge=' + 'a'.repeat(43) + '&code_challenge_method=S256');
    ok('知らない戻り先は 400 で、リダイレクトしない', r.status === 400);
  }
  {
    /* 本物の流れ: 許可画面に鍵を貼る → code → token → tools/call */
    const params = { response_type: 'code', client_id: 'chatgpt', redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
      code_challenge: '', code_challenge_method: 'S256', state: 's1', scope: '', resource: '' };
    const crypto = require('crypto');
    const verifier = crypto.randomBytes(32).toString('base64url');
    params.code_challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const g = await OA.grantCode(pool, cfg, params, { id: 'chatgpt', name: 'x', redirectUris: [params.redirect_uri], dcr: false }, KEY_LIMITED, '1.2.3.4');
    ok('正しい鍵ならコードが出る', g.ok === true);
    const code = new URL(g.location).searchParams.get('code');
    const tk = await OA.tokenEndpoint(pool, cfg, { grant_type: 'authorization_code', client_id: 'chatgpt', code, redirect_uri: params.redirect_uri, code_verifier: verifier }, '1.2.3.4');
    ok('コードをトークンに交換できる', tk.status === 200 && !!tk.body.access_token, JSON.stringify(tk.body));
    const auth = { authorization: 'Bearer ' + tk.body.access_token };
    const j = await (await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, auth)).json();
    ok('鍵の範囲にあるツールだけ見える', j.result.tools.some(t => t.name === 'list_unpaid_bills') && !j.result.tools.some(t => t.name === 'list_unpaid_invoices'));
    const call = await (await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_unpaid_bills', arguments: { due_within_days: 365 } } }, auth)).json();
    ok('許可されたツールは動く', call.result.structuredContent.open_total === F.apTotal(state));
    const denied = await (await rpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'list_unpaid_invoices', arguments: {} } }, auth)).json();
    ok('範囲外のツールは断る（AIが読める形で）', denied.result.isError === true && denied.result.structuredContent.error === 'insufficient-scope');
    /* 鍵を失効 → その場で効くか */
    ROWS.find(r2 => r2.id === 'int-limited').status = 'revoked';
    const after = await rpc({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'list_unpaid_bills', arguments: {} } }, auth);
    ok('鍵を失効するとトークンの期限を待たず 401', after.status === 401);
    ROWS.find(r2 => r2.id === 'int-limited').status = 'active';
  }
  {
    const txt = JSON.stringify(AUDIT);
    ok('監査に鍵の文字列が残っていない', !txt.includes(KEY_GOOD) && !txt.includes(KEY_LIMITED));
    ok('断った操作も監査に残る', AUDIT.some(a => String(a[1] || '').includes('denied')));
  }

  server.close();
  console.log(`\n結果: ${pass} 件成功 / ${fail} 件失敗`);
  process.exit(fail ? 1 : 0);
})();
