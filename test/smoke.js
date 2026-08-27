/* ============================================================================
   計算テスト — web/index.html の <script> をそのまま読み込んで実行します。
   ----------------------------------------------------------------------------
   実行:  node test/smoke.js web/index.html
   公式はコピーしません。デプロイするコードそのものを動かして数字を確かめます。
   ========================================================================== */
const fs = require('fs'), vm = require('vm');
const file = process.argv[2] || 'web/index.html';
const html = fs.readFileSync(file, 'utf8');
const st = html.lastIndexOf('<script>'), en = html.lastIndexOf('</script>');
if (st < 0 || en < st) { console.error('script ブロックが見つかりません'); process.exit(1); }
let code = html.slice(st + 8, en);
code = code.replace(/\/\* ============ 起動 ============ \*\/[\s\S]*$/, '');   // 自動起動は外す
// const/let は vm のグローバルに載らないので橋を架ける
code += '\n;globalThis.__x={ DEFAULT_ACCOUNTS, setDB:v=>{DB=v}, setFY:v=>{CUR_FY=v}, setSession:v=>{SESSION=v} };';

const noop = () => {};
const el = { innerHTML:'', style:{}, classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},
  querySelector:()=>null, querySelectorAll:()=>[], addEventListener:noop, appendChild:noop, focus:noop,
  setSelectionRange:noop, dataset:{}, value:'', textContent:'', setAttribute:noop, remove:noop, closest:()=>null };
const ctx = {
  console, setTimeout, clearTimeout, setInterval:()=>0, fetch: async () => ({ ok:false, json: async()=>({}) }),
  location:{ origin:'https://finance.biglight.jp', hash:'', search:'' },
  localStorage:{ getItem:()=>null, setItem:noop, removeItem:noop },
  document:{ getElementById:()=>el, querySelector:()=>null, querySelectorAll:()=>[], addEventListener:noop,
    createElement:()=>el, body:el },
  window:{ innerWidth:1400, addEventListener:noop },
  history:{ replaceState:noop }, EventSource: function(){ this.addEventListener = noop; },
  navigator:{}, alert:noop, confirm:()=>true, Blob:function(){}, URL:{ createObjectURL:()=>'', revokeObjectURL:noop },
};
ctx.globalThis = ctx; ctx.window.location = ctx.location;
vm.createContext(ctx);
vm.runInContext(code, ctx);

/* ---------- 検証用のデータ（実データは使いません） ---------- */
const _db = {
  companies:[
    { id:'C1', name:'株式会社アルファ', source:'crm', kind:'得意先', closingDay:31, paySite:1, payDay:31 },
    { id:'C2', name:'ベータ工業',       source:'crm', kind:'得意先', closingDay:20, paySite:2, payDay:25 },
    { id:'C3', name:'ガンマ商事',       source:'manual', kind:'仕入先' },
  ],
  workers:[{id:'W1',name:'A'},{id:'W2',name:'B'},{id:'W3',name:'C'}],
  assignments:[
    { id:'A1', workerId:'W1', companyId:'C1', joinDate:'2025-04-01', exitDate:'' },           // ずっと在籍
    { id:'A2', workerId:'W2', companyId:'C1', joinDate:'2025-09-15', exitDate:'' },           // 月の途中で入社
    { id:'A3', workerId:'W3', companyId:'C1', joinDate:'2025-01-10', exitDate:'2025-09-20' }, // 月の途中で退職
    { id:'A4', workerId:'W1', companyId:'C2', joinDate:'2025-08-01', exitDate:'' },
  ],
  billingRules:[
    { id:'R1', companyId:'C1', kind:'per_worker', name:'支援委託料', unitPrice:30000, accountCode:'4100', countMode:'month_end', taxCat:'課税10%', active:true },
    { id:'R2', companyId:'C2', kind:'fixed',      name:'顧問料',     unitPrice:50000, accountCode:'4900', taxCat:'課税10%', active:true },
  ],
  invoices:[], payments:[], bills:[], payouts:[], expenses:[], budgets:[], forecasts:[], actualAdjust:[],
  objectives:[], keyResults:[], checkins:[], accounts:[], departments:[], userPerms:{}, settings:{},
};
_db.accounts = ctx.__x.DEFAULT_ACCOUNTS.map((a,i)=>({ id:'AC'+i, ...a }));
ctx.__x.setDB(_db); ctx.DB = _db;
ctx.__x.setSession({ email:'test@biglight.jp', role:'Admin', status:'active' });
ctx.__x.setFY(2025);

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok?'  ok  ':'  NG  ') + name + '  →  ' + JSON.stringify(got) + (ok?'':'  (期待 '+JSON.stringify(want)+')'));
  ok ? pass++ : fail++;
};

console.log('\n― 会計年度（8/1〜7/31）―');
eq('fyOf(2025-08)', ctx.fyOf('2025-08'), 2025);
eq('fyOf(2026-07)', ctx.fyOf('2026-07'), 2025);
eq('fyOf(2026-08)', ctx.fyOf('2026-08'), 2026);
eq('8月の位置', ctx.fyIndexOf('2025-08'), 0);
eq('1月の位置', ctx.fyIndexOf('2026-01'), 5);
eq('12か月の端', [ctx.fyMonths(2025)[0], ctx.fyMonths(2025)[11]], ['2025-08','2026-07']);

console.log('\n― 在籍者数（支援委託料の根拠）―');
eq('C1 2025-08 月末在籍', ctx.workersInMonth('C1','2025-08','month_end').length, 2);
eq('C1 2025-09 月末在籍', ctx.workersInMonth('C1','2025-09','month_end').length, 2);
eq('C1 2025-09 月初在籍', ctx.workersInMonth('C1','2025-09','month_start').length, 2);
eq('C1 2025-10 月末在籍', ctx.workersInMonth('C1','2025-10','month_end').length, 2);
eq('日割り: 9/15入社 → 16日', ctx.activeDaysInMonth(_db.assignments[1],'2025-09'), 16);
eq('日割り: 9/20退職 → 20日', ctx.activeDaysInMonth(_db.assignments[2],'2025-09'), 20);

console.log('\n― 支払サイト → 入金期日 ―');
eq('末日締・翌月末（8月分）', ctx.dueDateOf('2025-08',31,1,31), '2025-09-30');
eq('20日締・翌々月25日（8月分）', ctx.dueDateOf('2025-08',20,2,25), '2025-10-25');
eq('2月末への丸め', ctx.dueDateOf('2026-01',31,1,31), '2026-02-28');

console.log('\n― 請求の自動作成 ―');
const auto = ctx.autoItemsFor('C1','2025-09');
eq('C1 9月: 明細1本', auto.items.length, 1);
eq('C1 9月: 2名×30,000', auto.items[0].amount, 60000);
eq('C1 9月: 在籍スナップショット', auto.snapshot.length, 2);
eq('C2 9月: 月額固定', ctx.autoItemsFor('C2','2025-09').items[0].amount, 50000);
eq('ルール無しの会社は0本', ctx.autoItemsFor('C3','2025-09').items.length, 0);

console.log('\n― 伝票の金額と消込 ―');
_db.invoices = [
  { id:'I1', no:'INV-202509-001', companyId:'C1', bookMonth:'2025-09', dueDate:'2025-10-31', status:'確定',
    items:[{ accountCode:'4100', name:'支援委託料', qty:2, price:30000, amount:60000, taxCat:'課税10%' }] },
  { id:'I2', no:'INV-202508-001', companyId:'C1', bookMonth:'2025-08', dueDate:'2025-09-30', status:'確定',
    items:[{ accountCode:'4100', name:'支援委託料', qty:2, price:30000, amount:60000, taxCat:'課税10%' }] },
];
eq('税込合計', ctx.docTotal(_db.invoices[0]), 66000);
eq('税抜（予実で使う）', ctx.docNet(_db.invoices[0]), 60000);
_db.payments = [{ id:'P1', companyId:'C1', date:'2025-10-01', amount:100000, status:'確定',
  allocations:[{ invoiceId:'I2', amount:66000 }, { invoiceId:'I1', amount:34000 }] }];
eq('1回の振込で2件を消込（I2）', ctx.paidOfInvoice(_db.invoices[1]), 66000);
eq('I2 は入金済', ctx.invoiceStatus(_db.invoices[1]), '入金済');
eq('I1 は一部入金', ctx.invoiceStatus(_db.invoices[0]), '一部入金');
eq('売掛残高', ctx.arTotal(), 32000);

console.log('\n― 予実: 実績は伝票から計算される ―');
_db.expenses = [
  { id:'E1', date:'2025-09-10', bookMonth:'2025-09', accountCode:'6200', amount:220000, taxCat:'課税10%' },
  { id:'E2', date:'2025-08-05', bookMonth:'2025-08', accountCode:'6110', amount:1000000, taxCat:'対象外' },
];
const rev = ctx.actualSeries(2025,'revenue');
eq('8月 売上（税抜）', rev[0], 60000);
eq('9月 売上（税抜）', rev[1], 60000);
const sga = ctx.actualSeries(2025,'sga');
eq('8月 販管費（対象外はそのまま）', sga[0], 1000000);
eq('9月 販管費（税込→税抜）', sga[1], 200000);
eq('8月 営業利益', ctx.plBook(2025,'actual').operating[0], -940000);

console.log('\n― 予算・過去との比較 ―');
_db.budgets = [{ id:'B1', fy:2025, mIndex:0, accountCode:'4100', amount:100000 },
               { id:'B2', fy:2025, mIndex:1, accountCode:'4100', amount:100000 }];
eq('予算 8月', ctx.plBook(2025,'budget').revenue[0], 100000);
const cmp = ctx.compareSeries(rev, [50000,50000,0,0,0,0,0,0,0,0,0,0], 1);
eq('当月と前月', [cmp.month, cmp.prevMonth], [60000,60000]);
eq('前年同月', cmp.lastYearMonth, 50000);
eq('年度累計と前年同期', [cmp.ytd, cmp.lastYearYtd], [120000,100000]);

console.log('\n― 資金繰り ―');
_db.bills = [{ id:'BL1', no:'BIL-1', companyId:'C3', bookMonth:'2025-09', dueDate:'2025-10-31', status:'確定',
  items:[{ accountCode:'5100', name:'外注費', amount:200000, taxCat:'課税10%' }] }];
eq('買掛残高', ctx.apTotal(), 220000);
const cf = ctx.cashPlanByMonth('2025-10', 2);
eq('10月 入金予定', cf[0].in, 32000);
eq('10月 支払予定', cf[0].out, 220000);

console.log('\n― OKR: 数字を予実から自動で取る ―');
_db.objectives = [{ id:'O1', title:'売上を伸ばす', period:'2025-Q1', level:'会社', status:'順調' }];
_db.keyResults = [{ id:'K1', objectiveId:'O1', title:'年度売上', target:240000, unit:'円',
  autoSource:{ type:'yojitsu', metric:'revenue', scope:'ytd' } }];
eq('KR の現在値は実績から', ctx.krCurrent(_db.keyResults[0]), 120000);
eq('達成率 50%', Math.round(ctx.krRate(_db.keyResults[0])), 50);

console.log('\n― 画面が落ちずに描けるか ―');
['viewDashboard','viewYojitsu','viewCompare','viewMikomi','viewInvoices','viewReceipts','viewAging',
 'viewBills','viewPayouts','viewCashflow','viewOkr','viewCompanies','viewWorkers','viewExpenses',
 'viewCrmLink','viewUsers','viewAudit','viewSettings'].forEach(fn => {
  try {
    const h = ctx[fn]();
    const ok = typeof h === 'string' && h.length > 80;
    console.log((ok?'  ok  ':'  NG  ') + fn + '  →  ' + (ok ? h.length + ' 文字' : '空'));
    ok ? pass++ : fail++;
  } catch (e) { console.log('  NG  ' + fn + '  →  ' + e.message); fail++; }
});

console.log(`\n結果: ${pass} 件成功 / ${fail} 件失敗\n`);
process.exit(fail ? 1 : 0);
