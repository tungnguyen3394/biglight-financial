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
code += '\n;globalThis.__x={ ENTITIES, DEFAULT_ACCOUNTS, isApCost, PAY_MODES, LED_LATE_WARN, SECTIONS, PAGE_GUIDE, PROPERTY_KINDS, get CUR_FY(){return CUR_FY}, get CURRENT_PAGE(){return CURRENT_PAGE}, ATT_PAGE, canCreate, canEdit, canDelete, mailCtx:()=>MAIL_CTX, moneyPlain, mailFill, DB:()=>DB, setAttCounts:v=>{ATT_COUNTS=v},\n  accountRoots, accountChildren, accountByCode, accountById, accountIsLeaf, accountPathLabel, accountCodesUnder, accountKindOf, accTreeReady, setDB:v=>{DB=v}, setFY:v=>{CUR_FY=v}, setSession:v=>{SESSION=v}, PAGE_REDIRECT, arNormName, setUsers:v=>{_USERS=v}, setBookView:v=>{BOOK_VIEW=v}, feeBurdenOf, periodNo, isClosedFy, defaultDateIn, cmpRate, setCmp:v=>{CMP_ON=v}, recClosed, get DASH_RANGE(){return DASH_RANGE} };';

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
  window:{ innerWidth:1400, addEventListener:noop, scrollTo:noop },
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

console.log('\n― 予実: 売上は請求書から・費用は試算表から手入力 ―');
/* ★ 2026-09-16: 費用の実績は actuals（会計事務所の試算表・税抜）だけ。
   支払請求・費用表（予定）は実績に入らない。売上は今までどおり請求書から。 */
_db.actuals = [
  { id:'AT1', fy:2025, mIndex:0, accountCode:'6110', amount:1000000 },
  { id:'AT2', fy:2025, mIndex:1, accountCode:'6200', amount:200000 },
];
_db.expenses = [
  { id:'E1', date:'2025-09-10', bookMonth:'2025-09', accountCode:'6200', amount:220000, taxCat:'課税10%' },
  { id:'E2', date:'2025-08-05', bookMonth:'2025-08', accountCode:'6110', amount:1000000, taxCat:'対象外' },
];
const rev = ctx.actualSeries(2025,'revenue');
eq('8月 売上（税抜）', rev[0], 60000);
eq('9月 売上（税抜）', rev[1], 60000);
eq('売上の実績 ＝ 請求書の合計（invRevenue）', ctx.actualSeries(2025,'revenue').reduce((s,v)=>s+v,0),
  _db.invoices.reduce((s,i)=>s+ctx.invRevenue(i),0));
const sga = ctx.actualSeries(2025,'sga');
eq('8月 販管費 ＝ 手入力の実績', sga[0], 1000000);
eq('9月 販管費 ＝ 手入力の実績', sga[1], 200000);
eq('旧・経費（expenses）は実績に入らない', sga[1], 200000);
eq('8月 営業利益', ctx.plBook(2025,'actual').operating[0], -940000);
eq('科目別の実績も actuals から', ctx.seriesByAccount(2025,'6200','actual')[1], 200000);

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

console.log('\n― 費用表（勘定科目 大›中›小›対象 × 12か月・予定）―');
_db.costItems = [
  { id:'CI1', name:'事務所家賃',     accountCode:'6200', kind:'fixed',    monthly:220000, taxCat:'課税10%', vendor:'大家' },
  { id:'CI2', name:'クラウド利用料', accountCode:'6220', kind:'fixed',    monthly:33000,  taxCat:'課税10%' },
  { id:'CI3', name:'旅費交通費',     accountCode:'6300', kind:'variable', monthly:0,      taxCat:'課税10%' },
  { id:'CI4', name:'旧リース',       accountCode:'6900', kind:'fixed',    monthly:11000,  taxCat:'課税10%', endYm:'2025-09' },
];
eq('終了月の月までは入力できる', ctx.costItemActive(_db.costItems[3],'2025-09'), true);
eq('終了月を過ぎたら入力できない', ctx.costItemActive(_db.costItems[3],'2025-10'), false);
ctx.setCostCell('CI1','2025-10',231000);
eq('マスを打つと costPlans が1行できる', (_db.costPlans||[]).filter(p=>p.costItemId==='CI1').length, 1);
eq('マスの値（税込）', ctx.costCellAmount('CI1','2025-10'), 231000);
eq('税抜に直す式は今までどおり', ctx.netOfGross(231000,'課税10%'), 210000);
/* ★ いちばん大事: 費用表は「予定」。打っても予実の実績は動かない（実績は試算表から手入力） */
eq('マスを打っても予実の実績は動かない', ctx.actualSeries(2025,'sga')[2], 0);
eq('表の行は対象の数', ctx.costRowsOf(2025).rows.length, 4);
eq('定期が先・変動が後に並ぶ', ctx.costRowsOf(2025).rows.map(r=>r.it.id), ['CI1','CI2','CI4','CI3']);
eq('期間外のマスは null（旧リースの10月）', ctx.costRowsOf(2025).rows[2].cells[2], null);

/* 木: 大 › 中 › 小 › 対象。対象のない科目は出さない */
{
  const tree = ctx.costTree(ctx.costRowsOf(2025).rows);
  const names = [];
  (function walk(ns){ ns.forEach(n=>{ names.push(n.label); walk(n.kids); }); })(tree);
  eq('木に 販管費（大分類）が出る', names.some(x=>x.includes('販管費')||x.includes('販売費')), true);
  const itemsIn = n => { let a=n.items.length; n.kids.forEach(k=>a+=itemsIn(k)); return a; };
  eq('4つの対象が全部どこかの枝に入る', tree.reduce((s,n)=>s+itemsIn(n),0), 4);
  /* 親の行の合計 ＝ 下にぶら下がる対象の合計 */
  const sum12 = a => a.reduce((s,v)=>s+(v||0),0);
  const cellsOf = n => { let t=0; n.items.forEach(r=>t+=sum12(r.cells)); n.kids.forEach(k=>t+=cellsOf(k)); return t; };
  eq('親の行の合計 ＝ 子の合計', tree.map(n=>sum12(ctx.costNodeSum(n))), tree.map(cellsOf));
}

/* 「→12」: 空いているマスだけ埋める。入っている数字は変えない */
{
  ctx.setCostCell('CI2','2025-08',30000);
  ctx.setCostCell('CI2','2025-11',44000);          // 途中に「入っているマス」
  const n = ctx.costFill12Go(_db.costItems[1], 0, 2025);
  eq('→12 は空いているマスだけを埋める', n, 10);
  eq('入っているマスは上書きしない（11月）', ctx.costCellAmount('CI2','2025-11'), 44000);
  eq('左の直近の数字を写す（9月＝8月の30,000）', ctx.costCellAmount('CI2','2025-09'), 30000);
  eq('入っているマスの右はその数字を写す（12月＝11月の44,000）', ctx.costCellAmount('CI2','2025-12'), 44000);
  const lease = ctx.costFill12Go(_db.costItems[3], 0, 2025);
  eq('期間外（終了月の後）は埋めない', lease, 2);
  eq('終了月の後のマスは空のまま', ctx.costCellAmount('CI4','2025-10'), 0);
  /* 片付け */
  ['2025-08','2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07']
    .forEach(ym=>{ ctx.setCostCell('CI2',ym,0); ctx.setCostCell('CI4',ym,0); });
}
ctx.setCostCell('CI1','2025-10',0);
eq('0にするとマスごと消える', ctx.costCellAmount('CI1','2025-10'), 0);

console.log('\n― 定期の支払（買掛）―');
/* 「費用＝ある会社に定期的に払うお金」。支払先を選び、払い方を 買掛 にすると
   毎月の支払請求ができ、期日はその会社の条件（C2: 20日締・翌々月25日払い）で決まる。 */
_db.costItems.push({ id:'CI5', name:'システム保守料', accountCode:'6220', kind:'fixed',
  monthly:110000, taxCat:'課税10%', payMode:'買掛', companyId:'C2' });
_db.costItems.push({ id:'CI6', name:'支払先なし保守', accountCode:'6220', kind:'fixed',
  monthly:5500, taxCat:'課税10%', payMode:'買掛' });

eq('買掛の費目だと分かる', ctx.__x.isApCost(_db.costItems[4]), true);
let plan = ctx.apPlanFor('2025-11');
eq('支払先のある買掛だけが対象', plan.length, 1);
eq('税込の月額予定を税抜にして明細にする', plan[0].items[0].amount, 100000);

eq('作った支払請求の数', ctx.apCreateBills('2025-11', plan), 1);
const nb = _db.bills.find(b=>b.bookMonth==='2025-11');
eq('期日は取引先の条件から（20日締・翌々月25日）', nb.dueDate, '2026-01-25');
eq('自動作成は「作成中」から', nb.status, '作成中');
eq('作った支払請求の明細は 費用表の対象に紐づく（税込）', ctx.costBillCell('CI5','2025-11').gross, 110000);
eq('同じ月に二度は作らない', ctx.apPlanFor('2025-11').filter(p=>p.items.length).length, 0);

/* ★ 2026-09-16: 費用表は予定の表。買掛の対象のマスも打てる（打っても実績は動かない） */
const exBefore = _db.expenses.length;
ctx.setCostCell('CI5','2025-11', 99000);
eq('買掛の対象でもマスに打てる', ctx.costRowsOf(2025).rows.find(r=>r.it.id==='CI5').cells[3], 99000);
eq('旧・経費（expenses）は増えない', _db.expenses.length, exBefore);
eq('費用表に打っても予実の実績は動かない', ctx.actualSeries(2025,'sga')[3], 0);
/* 支払請求を作るときの金額は 費用表のマス（予定）→ 無ければ月額 */
ctx.setCostCell('CI5','2025-12', 99000);
eq('支払請求の金額は費用表のマスから', ctx.apPlanFor('2025-12').find(p=>p.company.id==='C2').items[0].amount,
  ctx.netOfGross(99000,'課税10%'));
ctx.setCostCell('CI5','2025-12', 0);
eq('マスが空なら月額から', ctx.apPlanFor('2025-12').find(p=>p.company.id==='C2').items[0].amount, 100000);
ctx.setCostCell('CI5','2025-11', 0);

console.log('\n― 営業日（期日が土日祝のとき） ―');
{
  const H26=[...ctx.jpHolidays(2026)].sort();
  eq('2026年の祝日（振替・国民の休日を含む）', H26,
    ['2026-01-01','2026-01-12','2026-02-11','2026-02-23','2026-03-20','2026-04-29','2026-05-03','2026-05-04','2026-05-05','2026-05-06',
     '2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23','2026-10-12','2026-11-03','2026-11-23']);
  const H25=[...ctx.jpHolidays(2025)].sort();
  eq('2025年の祝日', H25,
    ['2025-01-01','2025-01-13','2025-02-11','2025-02-23','2025-02-24','2025-03-20','2025-04-29','2025-05-03','2025-05-04','2025-05-05','2025-05-06',
     '2025-07-21','2025-08-11','2025-09-15','2025-09-23','2025-10-13','2025-11-03','2025-11-23','2025-11-24']);
  eq('土曜は休業日', ctx.isBankHoliday('2025-10-25'), true);
  eq('12/31・1/2・1/3 は銀行の休業日', ['2025-12-31','2026-01-02','2026-01-03'].map(ctx.isBankHoliday), [true,true,true]);
  eq('平日は営業日', ctx.isBankHoliday('2026-09-14'), false);
  /* C2 の期日 2025-10-25 は土曜 */
  const inv={ companyId:'C2', dueDate:'2025-10-25' };
  eq('翌営業日（既定）→ 月曜', ctx.effDue(inv), '2025-10-27');
  _db.companies.find(c=>c.id==='C2').dueAdjust='前営業日';
  eq('前営業日 → 金曜', ctx.effDue(inv), '2025-10-24');
  _db.companies.find(c=>c.id==='C2').dueAdjust='そのまま';
  eq('そのまま → 土曜のまま', ctx.effDue(inv), '2025-10-25');
  delete _db.companies.find(c=>c.id==='C2').dueAdjust;
  eq('年末の期日は年明けの営業日へ（12/31→1/5）', ctx.effDue({ companyId:'C1', dueDate:'2025-12-31' }), '2026-01-05');
  /* ★ 本題: 土曜が期日で 月曜に入金 → 遅れではない（評価を不当に下げない） */
  _db.invoices.push({ id:'IH', no:'H', companyId:'C1', bookMonth:'2025-09', dueDate:'2025-10-25', status:'確定',
    items:[{ accountCode:'4100', amount:10000, taxCat:'課税10%' }] });
  _db.payments.push({ id:'PH', companyId:'C1', date:'2025-10-27', amount:11000, status:'確定', allocations:[{ invoiceId:'IH', amount:11000 }] });
  eq('土曜期日を月曜に入金しても期日内', ctx.ledColor(ctx.ledLate('ar', _db.invoices.find(i=>i.id==='IH'))), 'lg-ok');
  _db.invoices=_db.invoices.filter(i=>i.id!=='IH'); _db.payments=_db.payments.filter(p=>p.id!=='PH');
}

console.log('\n― 督促（段階・約束・今日やること）―');
{
  const keepInv=_db.invoices.slice(), keepPay=_db.payments.slice(), keepCo=_db.companies.slice();
  _db.collectionLogs=[];
  const dd=n=>ctx.addDays(ctx.today(), n);
  /* 期日が必ず平日になるよう「そのまま」の会社で作る（曜日で結果が揺れないように） */
  _db.companies.push({ id:'DK', name:'督促テスト工業', kind:'得意先', dueAdjust:'そのまま', creditLimit:50000, owner:'test@biglight.jp' });
  const inv=(id,due,amt)=>({ id, no:id, companyId:'DK', bookMonth:'2026-06', dueDate:due, status:'確定', items:[{accountCode:'4100', amount:amt, taxCat:'課税10%'}] });
  _db.invoices.push(inv('D1', dd(-3), 10000));
  let s1=ctx.dunStatus('DK');
  eq('3日遅れ → 督促1', s1.stage, 1);
  eq('まだ何もしていない → 今日やる', !!s1.todo, true);
  eq('今日やることは 督促1のメール', s1.todo.method, 'メール');

  _db.invoices.find(i=>i.id==='D1').dueDate=dd(-10);
  eq('10日遅れ → 督促2', ctx.dunStatus('DK').stage, 2);
  _db.invoices.find(i=>i.id==='D1').dueDate=dd(-40);
  eq('40日遅れ → 督促3（電話）', ctx.dunStatus('DK').todo.method, '電話');

  /* 対応を記録すると、その段階の「今日やる」は消える */
  ctx.dunLogSave('DK', { date:ctx.today(), method:'電話', content:'経理と話した', promiseDate:dd(5), promiseAmount:11000, nextDate:dd(6) });
  let s2=ctx.dunStatus('DK');
  eq('記録したら 今日やることは消える', s2.todo, null);
  eq('約束は「待ち」', s2.promise.state, 'waiting');
  eq('記録に その時点の段階が残る', ctx.__x.DB().collectionLogs[0].stage, 3);

  /* 約束日を過ぎても入金なし → いちばん急ぐ */
  ctx.__x.DB().collectionLogs[0].date=dd(-10); ctx.__x.DB().collectionLogs[0].promiseDate=dd(-2);
  let s3=ctx.dunStatus('DK');
  eq('約束を過ぎた', s3.promise.state, 'broken');
  eq('約束切れは いちばん急ぐ（rank 5）', s3.todo.rank, 5);
  /* 約束どおり入った → 守られた */
  _db.payments.push({ id:'DKP', companyId:'DK', date:dd(-3), amount:11000, status:'確定', allocations:[{invoiceId:'D1', amount:11000}] });
  eq('約束の日までに入金 → 守られた', ctx.dunStatus('DK').promise.state, 'kept');
  eq('払い終わったら 督促キューから消える', ctx.dunRows().some(r=>r.companyId==='DK'), false);
  _db.payments=_db.payments.filter(p=>p.id!=='DKP');

  /* 与信限度額 */
  eq('限度額 50,000 に対し 11,000 → 超えていない', ctx.creditOver('DK'), false);
  _db.invoices.push(inv('D2', dd(20), 60000));
  eq('未回収が限度額を超えた', ctx.creditOver('DK'), true);
  eq('ベルが限度超過を知らせる', ctx.notifItems().some(x=>x.key==='credit'), true);
  /* 土日祝の調整後で判断する（期日が土曜、今日がその翌日曜でも 遅れではない） */
  eq('限度額を入れていない会社は超過にならない', ctx.creditOver('C1'), false);

  try{ ctx.setDunFilter('all'); const h=ctx.viewDunning(); const ok=h.includes('督促テスト工業') && h.includes('限度超過');
    console.log((ok?'  ok  ':'  NG  ')+'督促キューに 会社・限度超過 が出る  →  '+h.length+' 文字'); ok?pass++:fail++; }catch(e){ console.log('  NG  viewDunning → '+e.message); fail++; }
  try{ const h=ctx.dunPanel('DK'); const ok=h.includes('経理と話した');
    console.log((ok?'  ok  ':'  NG  ')+'取引先の詳細に 対応の記録  →  '+h.length+' 文字'); ok?pass++:fail++; }catch(e){ console.log('  NG  dunPanel → '+e.message); fail++; }

  _db.invoices=keepInv; _db.payments=keepPay; _db.companies=keepCo; _db.collectionLogs=[];
  ctx.__x.setDB(_db); ctx.DB=_db;
}

console.log('\n― 取引先台帳（履歴・タイムライン）―');
/* ★ 期日は会社ごとに違う。C2 は「20日締・翌々月25日払い」なので、
   計上から85日かかっても期日内。ここを「計上からの日数」で色付けしていないことを確かめる。 */
_db.invoices.push({ id:'I3', no:'INV-202508-002', companyId:'C2', bookMonth:'2025-08',
  dueDate: ctx.dueDateOf('2025-08', 20, 2, 25), status:'確定',
  items:[{ accountCode:'4900', name:'顧問料', amount:50000, taxCat:'課税10%' }] });
_db.payments.push({ id:'P2', companyId:'C2', date:'2025-10-25', amount:55000, status:'確定',
  allocations:[{ invoiceId:'I3', amount:55000 }] });

eq('C2 の期日は会社の条件から', _db.invoices[2].dueDate, '2025-10-25');
eq('払い終わった日', ctx.ledSettleDate('ar', _db.invoices[2]), '2025-10-25');
eq('85日かかっても期日内（会社ごとの期日で判定）', ctx.ledLate('ar', _db.invoices[2]).days<=0, true);
eq('期日内は緑', ctx.ledColor(ctx.ledLate('ar', _db.invoices[2])), 'lg-ok');
eq('1日遅れ（I2: 9/30期日を10/1入金）', ctx.ledLate('ar', _db.invoices[1]).days, 1);
eq('30日までの遅れは黄', ctx.ledColor(ctx.ledLate('ar', _db.invoices[1])), 'lg-warn');
eq('未回収で期日超過は赤', ctx.ledColor(ctx.ledLate('ar', _db.invoices[0])), 'lg-bad');

const evC1 = ctx.ledEvents('C1','ar');
eq('C1 の出来事は 請求2 + 入金1', evC1.length, 3);
eq('古い順に並ぶ', evC1.map(e=>e.date), ['2025-08-31','2025-09-30','2025-10-01']);
eq('通帳の残高の動き', evC1.map(e=>e.bal), [66000,132000,32000]);
/* いちばん大事: 台帳の残高は、どの画面で見ても同じ数字（売掛残高）でなければならない */
eq('台帳の最後の残高＝売掛残高', evC1[evC1.length-1].bal, ctx.arBalanceOf('C1'));

const pf = ctx.ledPerf('C1','ar');
eq('完了した伝票の数', pf.n, 1);
eq('期日内率（1件中0件）', pf.rate, 0);
eq('遅れた分の平均日数', pf.avgLate, 1);
eq('いま期日を過ぎている件数', pf.openOver, 1);
eq('C2 は期日内100%', ctx.ledPerf('C2','ar').rate, 100);

/* 買掛側も同じ道具で動く */
_db.payouts = [{ id:'O1', companyId:'C3', date:'2025-10-31', amount:220000, status:'確定',
  allocations:[{ billId:'BL1', amount:220000 }] }];
eq('支払側: 払い終わった日', ctx.ledSettleDate('ap', _db.bills[0]), '2025-10-31');
eq('支払側: 期日内に払えた', ctx.ledColor(ctx.ledLate('ap', _db.bills[0])), 'lg-ok');
eq('支払側の台帳も残高が合う', ctx.ledEvents('C3','ap').pop().bal, ctx.apBalanceOf('C3'));

console.log('\n― 通知ベル と 入力ガイド ―');
/* 自動作成した支払請求を確定する（作成中のままでは買掛にならない＝期日超過にも出ない） */
_db.bills.find(b=>b.bookMonth==='2025-11').status='確定';
const nt = ctx.notifItems();
const nk = nt.map(x=>x.key);
eq('期日を過ぎた請求を知らせる', nk.includes('ar-over'), true);
eq('期日を過ぎた支払も知らせる', nk.includes('ap-over'), true);
eq('赤（放っておくと損）は danger', nt.filter(x=>x.sev==='danger').length>0, true);
eq('金額は計算で出す（保存しない）', nt.find(x=>x.key==='ar-over').amount, ctx.openInvoices().filter(i=>i.dueDate<ctx.today()).reduce((s,i)=>s+ctx.balanceOfInvoice(i),0));
/* 何も無ければ何も出さない（0件を並べない・公式 §0.6） */
const keep = { invoices:_db.invoices, bills:_db.bills, payments:_db.payments, payouts:_db.payouts,
  companies:_db.companies, costItems:_db.costItems };
_db.invoices=[]; _db.bills=[]; _db.payments=[]; _db.payouts=[]; _db.companies=[]; _db.costItems=[];
eq('やることが無ければ空', ctx.notifItems().length, 0);
Object.assign(_db, keep);
eq('戻したら また出る', ctx.notifItems().length>0, true);

/* ガイドは左メニューから作る: どの区も表が出て、画面を足しても書き忘れが起きない */
ctx.__x.SECTIONS.forEach(sec=>{
  try{ const h=ctx.guideSection(sec); const ok=typeof h==='string'&&h.length>150;
    console.log((ok?'  ok  ':'  NG  ')+'入力ガイド: '+sec.label+'  →  '+(ok?h.length+' 文字':'空')); ok?pass++:fail++;
  }catch(e){ console.log('  NG  入力ガイド: '+sec.label+'  →  '+e.message); fail++; }
});
eq('ガイドは全画面を載せる（書き忘れ検出）',
  ctx.__x.SECTIONS.flatMap(s=>s.tabs.map(t=>t.id)).filter(id=>!ctx.__x.PAGE_GUIDE[id]), []);
eq('メニューは7項目（特定技能者を外した）', ctx.__x.SECTIONS.length, 7);
/* 支払先は「BIGLIGHTがサービスを受けている会社」＝得意先とは別の入口 */
eq('支払先のタブがある', ctx.__x.SECTIONS.find(x=>x.id==='sec-co').tabs.some(t=>t.id==='vendors'), true);
try{ const h=ctx.guidePromise(); const ok=h.length>200;
  console.log((ok?'  ok  ':'  NG  ')+'数字の約束  →  '+h.length+' 文字'); ok?pass++:fail++; }catch(e){ fail++; }

console.log('\n― 画面が落ちずに描けるか ―');
['viewDashboard','viewYojitsu','viewCompare','viewMikomi','viewInvoices','viewReceipts','viewAging',
 'viewBills','viewPayouts','viewCashflow','viewOkr','viewCompanies','viewWorkers','viewExpenses',
 'viewCrmLink','viewUsers','viewAudit','viewSettings','viewApAging','viewProperties','viewAccounts','viewKbunrui'].forEach(fn => {
  try {
    const h = ctx[fn]();
    const ok = typeof h === 'string' && h.length > 80;
    console.log((ok?'  ok  ':'  NG  ') + fn + '  →  ' + (ok ? h.length + ' 文字' : '空'));
    ok ? pass++ : fail++;
  } catch (e) { console.log('  NG  ' + fn + '  →  ' + e.message); fail++; }
});

[['ar','history'],['ar','timeline'],['ap','history'],['ap','timeline']].forEach(([side,tab])=>{
  try{
    ctx.setLedSide(side); ctx.setLedTab(tab); ctx.setLedCo(side==='ap'?'C3':'C1');
    const h = ctx.viewLedger();
    const ok = typeof h==='string' && h.length>200;
    console.log((ok?'  ok  ':'  NG  ')+`viewLedger(${side}/${tab})  →  `+(ok? h.length+' 文字':'空'));
    ok?pass++:fail++;
  }catch(e){ console.log(`  NG  viewLedger(${side}/${tab})  →  `+e.message); fail++; }
});

console.log('\n― 請求書（繰越式） ―');
{
  /* 小さな1社で、式が崩れないかを確かめる */
  const keepInv=_db.invoices.slice(), keepPay=_db.payments.slice();
  _db.companies.push({ id:'CX', name:'繰越テスト商事', kind:'得意先', closingDay:31, paySite:1, payDay:31 });
  const it = amt => [{ accountCode:'4100', name:'月額', amount:amt, taxCat:'課税10%' }];   // 税込 = amt×1.1
  const A={ id:'IA', no:'A', companyId:'CX', bookMonth:'2026-06', issueDate:'2026-06-30', dueDate:'2026-07-31', status:'確定', items:it(100000) };
  const B={ id:'IB', no:'B', companyId:'CX', bookMonth:'2026-07', issueDate:'2026-07-31', dueDate:'2026-08-31', status:'確定', items:it(100000) };
  const Cc={ id:'IC', no:'C', companyId:'CX', bookMonth:'2026-08', issueDate:'2026-08-31', dueDate:'2026-09-30', status:'作成中', items:it(100000) };
  _db.invoices.push(A,B,Cc);
  /* 7/15 に A の一部 50,000 だけ入金 */
  _db.payments.push({ id:'PX1', companyId:'CX', date:'2026-07-15', amount:50000, fee:0, status:'確定', allocations:[{invoiceId:'IA',amount:50000}] });

  const kA=ctx.invoiceCarry(A), kB=ctx.invoiceCarry(B), kC=ctx.invoiceCarry(Cc);
  eq('最初の請求書は繰越0', [kA.prev,kA.received,kA.carry,kA.total], [0,0,0,110000]);
  eq('前回ご請求額 − ご入金額 ＝ 繰越額（B）', kB.prev - kB.received, kB.carry);
  eq('B の前回ご請求額 ＝ A の今回ご請求額（つながっている）', kB.prev, kA.total);
  eq('B のご入金額は A〜B の間に入った分', kB.received, 50000);
  eq('B の繰越額 ＝ 110,000 − 50,000', kB.carry, 60000);
  eq('B の今回ご請求額 ＝ 繰越 ＋ お買上', kB.total, 60000+110000);
  eq('C の前回ご請求額 ＝ B の今回ご請求額', kC.prev, kB.total);

  /* 過入金: 払いすぎると繰越がマイナスになり、次の請求が減る */
  _db.payments.push({ id:'PX2', companyId:'CX', date:'2026-08-20', amount:300000, fee:0, status:'確定', allocations:[{invoiceId:'IA',amount:60000},{invoiceId:'IB',amount:110000}] });
  const kC2=ctx.invoiceCarry(Cc);
  eq('過入金なら繰越はマイナス', kC2.carry, 220000-350000);
  eq('過入金ぶん 今回ご請求額が減る', kC2.total, 220000-350000+110000);

  /* ★ 確定したら数字を写す。あとで入金を足しても、送った請求書の数字は変わらない */
  ctx.confirmInvoice('IC');
  const frozen=JSON.stringify(ctx.invoiceCarryShown(Cc));
  _db.payments.push({ id:'PX3', companyId:'CX', date:'2026-08-25', amount:10000, fee:0, status:'確定', allocations:[] });
  eq('確定後は写した数字のまま', JSON.stringify(ctx.invoiceCarryShown(Cc)), frozen);
  eq('写した数字だと分かる印', ctx.invoiceCarryShown(Cc).frozen, true);

  /* ★ 繰越は売上に入れない（予実が二重にならない） */
  const revAug=ctx.actualSeries(2026,'revenue')[0];
  eq('繰越は売上に入らない（8月の売上＝お買上額の税抜だけ）', revAug >= 100000 && revAug < 100000+60000, true);

  /* 印刷: 繰越の5つの枠と、差出人の登録番号が載る */
  _db.settings.self={ name:'BIGLIGHT株式会社', invoiceNo:'T1234567890123', bank:'テスト銀行 本店 普通 1234567' };
  let printed='';
  ctx.window.open=()=>({ document:{ open:noop, write:h=>{ printed+=h; }, close:noop } });
  ctx.open=ctx.window.open;
  try{ ctx.printInvoice('IB'); }catch(e){ console.log('  NG  printInvoice → '+e.message); fail++; }
  eq('印刷に 今回ご請求額 の枠', printed.includes('今回ご請求額'), true);
  eq('印刷に 登録番号', printed.includes('T1234567890123'), true);
  eq('印刷に 振込先', printed.includes('テスト銀行'), true);

  /* 片付け */
  _db.invoices=keepInv; _db.payments=keepPay;
  _db.companies=_db.companies.filter(c=>c.id!=='CX'); delete _db.settings.self;
  ctx.__x.setDB(_db); ctx.DB=_db;
}

console.log('\n― 添付ファイル（画面側） ―');
{
  /* 画面とサーバーで「どの台帳に添付でき、どの画面の権限を見るか」が同じであること */
  const srv=fs.readFileSync(require('path').join(__dirname,'..','backend','src','files.ts'),'utf8');
  const m=srv.match(/ATTACH_ENTITIES[^{]*{([\s\S]*?)}/);
  const pairs={}; (m?m[1]:'').replace(/(\w+):\s*'(\w+)'/g,(_,k,v)=>{ pairs[k]=v; return ''; });
  eq('添付の台帳と権限の画面が サーバーと同じ', JSON.stringify(Object.keys(pairs).sort().map(k=>k+'='+pairs[k])),
    JSON.stringify(Object.keys(ctx.__x.ATT_PAGE).sort().map(k=>k+'='+ctx.__x.ATT_PAGE[k])));
  ctx.__x.setAttCounts({ invoices:{ I1:3 } });
  eq('一覧のボタンに件数が出る', ctx.attBtn('invoices','I1').includes('<span>3</span>'), true);
  eq('件数0なら数字を出さない', ctx.attBtn('invoices','I2').includes('<span>'), false);
  eq('添付できない台帳にはボタンを出さない', ctx.attBtn('budgets','X'), '');
  /* 見せていない画面の伝票には、添付の欄も出さない */
  _db.userPerms = { 'staff2@biglight.jp': { invoices:{v:0} } };
  ctx.__x.setSession({ email:'staff2@biglight.jp', role:'Staff', status:'active' });
  eq('見せていない画面の添付欄は出ない', ctx.attSection('invoices','I1'), '');
  _db.userPerms = {};
  ctx.__x.setSession({ email:'test@biglight.jp', role:'Admin', status:'active' });
  eq('管理者には添付欄が出る', ctx.attSection('invoices','I1').includes('3件'), true);
  ctx.__x.setAttCounts({});
}

console.log('\n― 回収（売掛金）: 前月残高＋請求−入金＝月末残高 ―');
/* ★ 2026-09-14: 請求書の状態・消込に頼らず、請求と入金の「月の合計」だけで残高を出す。
   日付はすべて過去（2025年）なので、今日がいつでも結果は変わらない。 */
{
  const keep={ inv:_db.invoices.slice(), pay:_db.payments.slice(), co:_db.companies.slice() };
  _db.invoices=[]; _db.payments=[];          // このブロックの伝票だけで数える
  const co=id=>_db.companies.push({ id, name:'売掛テスト'+id, kind:'得意先', dueAdjust:'そのまま' });
  const bill=(id,cid,ym,total,extra)=>_db.invoices.push(Object.assign({ id, companyId:cid, bookMonth:ym, issueDate:ym+'-25', status:'確定', total, items:[] }, extra||{}));
  const pay=(id,cid,date,amount,extra)=>_db.payments.push(Object.assign({ id, companyId:cid, date, amount, allocations:[] }, extra||{}));
  const M=(cid,ym)=>{ const r=ctx.arMonthly(cid,[ym])[0]; return [r.opening,r.billed,r.payment,r.closing]; };
  ['K1','K2','K3','K4','K5','K6','K7','K8'].forEach(co);

  bill('KI1','K1','2025-04',100000); pay('KP1','K1','2025-04-20',100000);
  eq('Case1 前月0 ＋請求10万 −入金10万 → 残高0', M('K1','2025-04'), [0,100000,100000,0]);

  bill('KI2','K2','2025-04',100000); pay('KP2','K2','2025-04-20',50000);
  eq('Case2 前月0 ＋請求10万 −入金5万 → 残高5万', M('K2','2025-04'), [0,100000,50000,50000]);

  bill('KI3a','K3','2025-03',50000); bill('KI3b','K3','2025-04',100000); pay('KP3','K3','2025-04-20',80000);
  eq('Case3 前月5万 ＋請求10万 −入金8万 → 残高7万', M('K3','2025-04'), [50000,100000,80000,70000]);
  eq('Case3 前月の月末残高 ＝ 当月の前月残高', ctx.arMonthly('K3',['2025-03'])[0].closing, 50000);

  bill('KI4','K4','2025-03',100000); pay('KP4','K4','2025-04-10',60000);
  eq('Case4 請求なし・前月分の入金だけ → 残高が減る', M('K4','2025-04'), [100000,0,60000,40000]);

  bill('KI5','K5','2025-03',100000,{ dueDate:'2025-04-30' }); pay('KP5','K5','2025-05-10',30000);
  eq('Case5 期日当日の月末はまだ超過ではない', ctx.arMonthly('K5',['2025-04'])[0].overdue, 0);
  eq('Case5 期日を過ぎて残った分が 期限超過額', ctx.arMonthly('K5',['2025-05'])[0].overdue, 70000);
  const now5=ctx.arMonthly('K5',[ctx.thisMonth()])[0];
  eq('Case5 今の状態は 期限超過', [now5.closing, now5.overdue, ctx.arStatus(now5.closing, now5.overdue)], [70000,70000,'期限超過']);

  bill('KI6a','K6','2025-04',60000); bill('KI6b','K6','2025-04',40000,{ issueDate:'2025-04-28' });
  eq('Case6 同じ月の複数の請求 → 1つの当月請求額', ctx.arMonthly('K6',['2025-04'])[0].billed, 100000);

  bill('KI7','K7','2025-03',100000); pay('KP7a','K7','2025-04-05',30000); pay('KP7b','K7','2025-04-25',20000);
  eq('Case7 同じ月の複数の入金 → 1つの当月入金額', ctx.arMonthly('K7',['2025-04'])[0].payment, 50000);

  /* 入れないもの・数え方の細部 */
  bill('KI8a','K8','2025-04',100000); bill('KI8b','K8','2025-04',999,{ status:'作成中' }); bill('KI8c','K8','2025-04',888,{ status:'取消' });
  pay('KP8a','K8','2025-04-20',99340,{ fee:660 }); pay('KP8b','K8','2025-04-21',5000,{ status:'取消' });
  eq('作成中・取消の請求 と 取消の入金 は数えない／先方負担の手数料は入金に含む', M('K8','2025-04'), [0,100000,100000,0]);
  _db.invoices.find(i=>i.id==='KI2').status='入金済';
  eq('請求書の状態（入金済など）には頼らない', ctx.arMonthly('K2',['2025-04'])[0].closing, 50000);
  eq('期日が無い請求は 期限超過にしない', ctx.arMonthly('K2',[ctx.thisMonth()])[0].overdue, 0);
  eq('未来の月は 空欄扱い', ctx.arMonthly('K1',[ctx.addMonths(ctx.thisMonth(),1)])[0].future, true);
  eq('状態: 残高0は 正常／残高ありは 未回収あり', [ctx.arStatus(0,0), ctx.arStatus(5,0)], ['正常','未回収あり']);
  const T=ctx.arTotals();
  eq('KPI 売掛金残高 は全社の現在残高の合計', T.balance, 0+50000+70000+40000+70000+100000+50000+0);
  eq('KPI 期限超過額', T.overdue, 70000);

  /* 画面 */
  ctx.__x.setFY(2024);
  const h=ctx.viewArBook();
  eq('売掛金の表: 8社×12か月のマス', (h.match(/ar-c[ "]/g)||[]).length, 8*12);
  /* ★ 2026-09-16: 過去の年度は KPI と右端の列が「その年度の最後の月（7月末）」になる */
  eq('売掛金の表（過去の年度）: KPI 4つは 年度末の7月で', ['2025年7月の請求額（税込）','2025年7月の入金額','売掛金残高（7月末・税込）','期限超過額（7月末）','7月末残高'].every(x=>h.includes(x)), true);
  eq('売掛金の表（過去の年度）: 「今月」「現在残高」は出さない', ['今月請求額','現在残高'].some(x=>h.includes(x)), false);
  eq('基準の月: 過去の年度→最後の月／今の年度→今月／未来の年度→最初の月',
    [ctx.bookAnchor(2024).ym, ctx.bookAnchor(ctx.fyOf(ctx.thisMonth())).ym, ctx.bookAnchor(ctx.fyOf(ctx.thisMonth())+1).ym],
    ['2025-07', ctx.thisMonth(), (ctx.fyOf(ctx.thisMonth())+1)+'-08']);
  eq('売掛金の表: 合計の下に 請求額・入金額 の2行（年度計つき）', ['＋ 請求額','− 入金額','年度計'].every(x=>h.includes(x)), true);
  /* 動きの2行の年度計は、その年度の 請求・入金 の合計と一致する（K1〜K8 の 2024年度） */
  { const ms=ctx.fyMonths(2024); let b=0,pm=0;
    ctx.arCompanyIds().forEach(id=>ctx.arMonthly(id,ms).forEach(x=>{ if(!x.future){ b+=x.billed; pm+=x.payment; } }));
    const nums=[...h.matchAll(/年度計<\/span>([\d,]+)/g)].map(x=>Number(x[1].replace(/,/g,'')));
    eq('年度計 ＝ その年度の請求・入金の合計', nums, [b,pm]); }
  { const cur=ctx.fyOf(ctx.thisMonth()); ctx.__x.setFY(cur); const hc=ctx.viewArBook();
    eq('売掛金の表（今の年度）: 今までどおり 今月・現在残高', ['今月請求額','今月入金額','現在残高'].every(x=>hc.includes(x)), true);
    ctx.__x.setFY(2024); }
  eq('売掛金の表: 請求番号・数量・単価・PDF は出さない', ['請求番号','数量','単価','PDF'].some(x=>h.includes(x)), false);
  /* ★ 2026-09-16: 四半期・上期下期・通期 と 累計 */
  { const ms=ctx.fyMonths(2024); let yb=0, yp=0;
    ctx.arCompanyIds().forEach(id=>ctx.arMonthly(id,ms).forEach(x=>{ if(!x.future){ yb+=x.billed; yp+=x.payment; } }));
    const flowNums=(h,i)=>{ const r=[...h.matchAll(/<tr class="ar-flow">([\s\S]*?)<\/tr>/g)].map(m=>m[1])[i];
      return [...r.matchAll(/<td class="r num">([\d,]+|<span class="zero">0<\/span>)<\/td>/g)].map(m=>m[1].includes('zero')?0:Number(m[1].replace(/,/g,''))); };
    const totNums=h=>{ const r=h.match(/<tr class="totrow">([\s\S]*?)<\/tr>/)[1];
      return [...r.matchAll(/<td class="r num">([−\d,]+)<\/td>/g)].map(m=>Number(m[1].replace(/,/g,'').replace('−','-'))); };
    const hm=h, cnt=x=>(x.match(/ar-c[ "]/g)||[]).length, sum=a=>a.reduce((t,v)=>t+v,0);
    ctx.__x.setBookView({ per:'q', cum:false }); const hq=ctx.viewArBook();
    eq('四半期: 8社×4列、見出しは Q1〜Q4', [cnt(hq), ['Q1','Q2','Q3','Q4'].every(x=>hq.includes(x+'</th>'))], [8*4, true]);
    eq('四半期: 期末の残高 ＝ 月表示の 10月・1月・4月・7月 の残高', totNums(hq), [2,5,8,11].map(i=>totNums(hm)[i]));
    eq('四半期（当期）: 4つの請求・入金を足すと 年度計', [sum(flowNums(hq,0)), sum(flowNums(hq,1))], [yb, yp]);
    ctx.__x.setBookView({ per:'q', cum:true }); const hqc=ctx.viewArBook();
    const cb=flowNums(hqc,0);
    eq('四半期（累計）: 最後の列 ＝ 年度計、減らない、見出しに（累計）', [cb[cb.length-1], cb.every((v,i)=>!i||v>=cb[i-1]), hqc.includes('＋ 請求額（累計）')], [yb, true, true]);
    ctx.__x.setBookView({ per:'half', cum:false }); const hh=ctx.viewArBook();
    eq('上期・下期: 8社×2列、請求の合計 ＝ 年度計', [cnt(hh), hh.includes('上期</th>')&&hh.includes('下期</th>'), sum(flowNums(hh,0))], [8*2, true, yb]);
    ctx.__x.setBookView({ per:'year', cum:false }); const hy=ctx.viewArBook();
    eq('通期: 8社×1列、残高 ＝ 7月末', [cnt(hy), totNums(hy)[0]], [8, totNums(hm)[11]]);
    eq('まとめた表のマスは 元帳を開く（月の内訳ではない）', [/ar-c[^"]*" onclick="openArLedger/.test(hy), /ar-c[^"]*" onclick="arCellPop/.test(hy)], [true, false]);
    eq('買掛金も 四半期で出る', (()=>{ ctx.__x.setBookView({ per:'q', cum:true }); const x=ctx.viewApBook(); return x.includes('上期・下期')&&x.includes('支払請求と支払'); })(), true);
    ctx.__x.setBookView({ per:'month', cum:false }); }
  el.innerHTML=''; ctx.openArLedger('K3'); const lh=String(el.innerHTML);
  eq('売掛元帳: 年月・前月残高・請求額・入金額・月末残高', ['年月','前月残高','請求額','入金額','月末残高','2025/04'].every(x=>lh.includes(x)), true);
  eq('メニューの先頭は 売掛金、古いリンクは 売掛金 に案内', [ctx.__x.SECTIONS.find(x=>x.id==='sec-ar').tabs[0].id, ctx.__x.PAGE_REDIRECT.invoices, ctx.__x.PAGE_REDIRECT.aging, ctx.__x.PAGE_REDIRECT.arco], ['arbook','arbook','arbook','arbook']);
  eq('売掛金の権限は 請求の権限と同じ', ctx.canSee('arbook'), ctx.canSee('invoices'));
  ctx.__x.setFY(2025);

  /* 入金の充て先は 古い請求から自動（督促・資金繰り・API と食い違わないため） */
  eq('入金は古い請求から充てる', ctx.arFifoAlloc('K3', 60000, null).map(a=>[a.invoiceId,a.amount]), [['KI3a',50000],['KI3b',10000]]);

  /* 税抜は subtotal を使う（MF の小計） */
  eq('予実の税抜: subtotal があればそれ', ctx.docNet({ total:110000, subtotal:100001 }), 100001);
  eq('予実の税抜: 無ければ今までどおり ÷1.1', ctx.docNet({ total:110000 }), 100000);

  /* Money Forward の取り込み規則は サーバー（test/mfsync.js）で確かめています。
     ここでは 画面が その結果をどう見せるかだけを見ます。 */
  _db.invoices[0].confirmStatus='未確認'; _db.invoices[0].source='mf';
  _db.invoices[1].confirmStatus='確定';
  _db.invoices[2].mfDiff={ at:'2026-09-18T00:00:00Z', fields:{ total:{ finance:100000, mf:120000 } } };
  /* 回収（売掛金）から外れる請求の扱いと データ点検 */
  eq('請求の月: 計上月 → 請求日 → 期日 → 作った日 の順', [
    ctx.arYmOfInv({ bookMonth:'2026-08', issueDate:'2026-09-01' }), ctx.arYmOfInv({ issueDate:'2026-09-01' }),
    ctx.arYmOfInv({ dueDate:'2026-10-31' }), ctx.arYmOfInv({ createdAt:'2026-09-18T01:00:00Z' }), ctx.arYmOfInv({}) ],
    ['2026-08','2026-09','2026-10','2026-09','']);
  {
    const d=ctx.__x.DB(); const nInv=d.invoices.length, nPay=d.payments.length;   // 足した分だけ あとで戻す（DB の器は替えない）
    d.invoices.push({ id:'CHK1', companyId:'C1', status:'確定', total:5000 });                       // 日付なし
    d.invoices.push({ id:'CHK2', companyId:'C1', status:'確定', total:0, bookMonth:'2026-09' });     // 金額0
    d.invoices.push({ id:'CHK3', companyId:'NOPE', status:'確定', total:7000, bookMonth:'2026-09' }); // 取引先が無い
    d.invoices.push({ id:'CHK4', companyId:'C1', status:'下書き', total:9000, bookMonth:'2026-09', source:'mf', confirmStatus:'未確認' });
    d.payments.push({ id:'PCHK', companyId:'', payerName:'ﾌﾘｺﾐ ﾀﾞﾚｶ', date:'2026-09-10', amount:1000, allocations:[] });
    const f=ctx.arDataCheckFacts();
    eq('日付の無い請求を見つける', f.noDate.map(i=>i.id), ['CHK1']);
    eq('金額0の請求を見つける', f.zeroTotal.map(i=>i.id), ['CHK2']);
    eq('存在しない取引先を指す請求を見つける', f.lostCompany.map(i=>i.id), ['CHK3']);
    eq('取引先の無い入金を見つける', f.payNoCompany.map(p=>p.id), ['PCHK']);
    eq('作成中/取消 は数えない側に入る（点検の内訳）', f.draftOrCancel>=0 && f.live<=f.total, true);
    const h=ctx.arDataCheck.toString().length>0 && (ctx.arDataCheck(), (ctx.document.getElementById('modalBody')||{}).innerHTML||'');
    eq('データ点検の画面に 原因の表と 月ごとの件数が出る', ['原因','請求に日付が無い','請求の月ごとの件数','売掛金残高（今月末）'].every(x=>String(h).includes(x)), true);
    ctx.closeModal && ctx.closeModal();
    d.invoices.length=nInv; d.payments.length=nPay;
  }
  /* 売掛残高は どこで見ても 回収（売掛金）の式（前月残高＋請求−入金） */
  eq('取引先の売掛残 ＝ 回収の表の今月末残高', ctx.arBalanceOf('C1'), ctx.arMonthly('C1',[ctx.thisMonth()])[0].closing);
  eq('売掛残高の合計 ＝ 会社ごとの今月末残高の合計', ctx.arTotal(), ctx.arCompanyIds().reduce((t,id)=>t+ctx.arMonthly(id,[ctx.thisMonth()])[0].closing,0));
  /* 同期の結果（数字）の見せ方。0 は出さない・入れ子（run）もほどく */
  eq('同期の結果を1行にする', ctx.mfStatsText({ billings:{ 新規:3, 更新:0, 取引先未対応:2 }, reconcile:{ 消込:1 } }),
    'billings：新規 3・取引先未対応 2 ／ reconcile：消込 1');
  eq('入出金が取れないときは理由を出す', ctx.mfStatsText({ transactions:{ エラー:'会計に繋がりません' } }), 'transactions：会計に繋がりません');
  eq('結果が無ければ何も出さない', [ctx.mfStatsText(null), ctx.mfStatsText({ billings:{ 新規:0 } })], ['','']);
  eq('取り込めなかった件数を拾う（入れ子でも平でも）',
    [ctx.mfUnmappedCount({ billings:{ 取引先未対応:5 } }), ctx.mfUnmappedCount({ 取引先未対応:2 }), ctx.mfUnmappedCount(null)], [5,2,0]);
  const mfC=ctx.mfCheckCounts();
  eq('確認待ち・MF差異を数える', [mfC['未確認']>=1, mfC['MF差異']>=1, mfC['確定']>=1], [true,true,true]);
  const cfH=ctx.viewArConfirm();
  eq('請求の確認の画面が出る', ['請求の確認','確定','MF差異','要対応'].every(x=>cfH.includes(x)), true);
  const fyKeep=ctx.__x.CUR_FY; ctx.__x.setFY(ctx.fyOf(_db.invoices[0].bookMonth));   // 期の中でだけ確定できる
  ctx.mfConfirm([_db.invoices[0].id]);
  eq('確定すると印と担当者が残る', [_db.invoices[0].confirmStatus, !!_db.invoices[0].confirmedBy], ['確定', true]);
  ctx.__x.setFY(fyKeep);
  const rcH=ctx.viewArRecon();
  eq('突合の画面が出る', ['突合','試算表の売掛金','差'].every(x=>rcH.includes(x)), true);
  eq('振込名義の表記ゆれ（半角カナ・カ)）をまとめる', ctx.mfNormPayer('ﾌﾘｺﾐ ﾀｶﾔﾏ(ｶ')===ctx.mfNormPayer('タカヤマ'), true);
  eq('請求書を自動で作る機能は無い', typeof ctx.genGo, 'undefined');

  _db.invoices=keep.inv; _db.payments=keep.pay; _db.companies=keep.co;
}

console.log('\n― 振込手数料の差引き・入金の不足（2026-09-16） ―');
{
  const keep={ inv:_db.invoices.slice(), pay:_db.payments.slice(), co:_db.companies.slice() };
  _db.invoices=[]; _db.payments=[];
  _db.companies.push({ id:'FS', name:'先方負担社', kind:'得意先', dueAdjust:'そのまま' }, { id:'FT', name:'当社負担社', kind:'得意先', dueAdjust:'そのまま', feeBurden:'当社' });
  const bill=(id,cid,ym,total)=>_db.invoices.push({ id, companyId:cid, bookMonth:ym, issueDate:ym+'-25', dueDate:ym.slice(0,5)+String(Number(ym.slice(5))+1).padStart(2,'0')+'-20', status:'確定', total, items:[] });
  /* 保存と同じ手順（paySave の中身）で入金を入れる */
  const pay=(id,cid,date,amount)=>{
    const pv=ctx.payShortPreview(cid, amount, null);
    let fee=0, feeShort=0;
    if(pv.kind==='fee'){ if(pv.burden==='当社') fee=pv.left; else feeShort=pv.left; }
    _db.payments.push({ id, companyId:cid, date, amount, fee, feeShort, status:'確定', allocations: ctx.arFifoAlloc(cid, amount+fee, null) });
    return pv;
  };
  bill('FS1','FS','2025-04',110000); bill('FS2','FS','2025-05',110000); bill('FS3','FS','2025-06',110000);
  eq('既定は 先方負担', ctx.__x.feeBurdenOf('FS'), '先方');
  const p1=pay('P1','FS','2025-05-20',109560);
  eq('440円少ない → 手数料の差引き（先方負担）', [p1.kind, p1.left, p1.burden, p1.target], ['fee', 440, '先方', 110000]);
  eq('先方負担: 差引きは売掛金に残る', ctx.balanceOfInvoice(_db.invoices[0]), 440);
  eq('先方負担: feeShort に記録', _db.payments[0].feeShort, 440);
  const p2=pay('P2','FS','2025-06-20',109560);
  eq('翌月も440円少ない → 次の請求に充てる（前の440円に食われない）', [p2.kind, p2.left, ctx.balanceOfInvoice(_db.invoices[1])], ['fee', 440, 440]);
  eq('手数料の残りは 督促に入れない', ctx.dunStatus('FS').overdue.map(i=>i.id).includes('FS1'), false);
  eq('残りは 2件 × 440円（ずれて増えていかない）', ctx.feeResiduals('FS').map(x=>x.bal), [440, 440]);
  const pS=ctx.payShortPreview('FS', 60000, null);
  eq('1,000円を超えて足りない → 不足', [pS.kind, pS.left], ['short', 50000]);
  eq('ぴったり → ok', ctx.payShortPreview('FS', 110000, null).kind, 'ok');
  eq('多い → over（差引きの残りへ充てる）', ctx.payShortPreview('FS', 110880+110000, null).kind, 'over');
  eq('1,000円ちょうどは 手数料', ctx.payShortPreview('FS', 109000, null).kind, 'fee');
  eq('1,001円は 不足', ctx.payShortPreview('FS', 108999, null).kind, 'short');
  const chk=ctx.arCheckRows(2024).filter(r=>r.companyId==='FS');
  eq('入金チェック: 差し引かれた2件は feeShort', chk.filter(r=>r.kind==='feeShort').length, 2);

  /* 片付け: 次回請求に加算 */
  ctx.__x.setSession({ email:'admin@x', role:'Admin', status:'active' });
  ctx.feeResolve('FS','carry','FS1');
  eq('次回請求に加算 → その請求は残高0', ctx.balanceOfInvoice(_db.invoices[0]), 0);
  eq('次回請求に加算 → 「足す額」に出る', ctx.feeCarryPending('FS').map(x=>x.a.amount), [440]);
  eq('入金チェック: 次回請求に加算', ctx.arCheckRows(2024).find(r=>r.inv.id==='FS1').kind, 'carry');
  const sum1=ctx.feeSummary(2024).find(r=>r.companyId==='FS');
  eq('まとめ: 2回・880円 差し引かれ、未処理440・足す額440', [sum1.n, sum1.deducted, sum1.open, sum1.carry], [2, 880, 440, 440]);
  ctx.feeCarryDone('FS');
  eq('MFに入れた → 足す額から消える', ctx.feeCarryPending('FS').length, 0);
  /* 片付け: 当社負担 */
  ctx.feeResolve('FS','absorb');
  eq('当社負担 → 残りなし', ctx.feeResiduals('FS').length, 0);
  eq('入金チェック: 当社負担', ctx.arCheckRows(2024).find(r=>r.inv.id==='FS2').kind, 'fee');
  eq('会社の売掛残高 ＝ まだ払われていない FS3 だけ', ctx.arMonthly('FS',['2025-07'])[0].closing, 110000);
  ctx.__x.setSession({ email:'staff@x', role:'Staff', status:'active' });
  bill('FS4','FS','2025-07',110000); pay('P3','FS','2025-07-20',110000+109560);
  ctx.feeResolve('FS','absorb');
  eq('当社負担は スタッフではできない', ctx.feeResiduals('FS').length, 1);
  ctx.__x.setSession({ email:'admin@x', role:'Admin', status:'active' });

  /* 当社負担の会社 */
  bill('FT1','FT','2025-04',110000);
  const t1=pay('Q1','FT','2025-05-20',109560);
  eq('当社負担の会社: 差引きは fee にして残高0', [t1.burden, _db.payments.find(x=>x.id==='Q1').fee, ctx.balanceOfInvoice(_db.invoices.find(x=>x.id==='FT1'))], ['当社', 440, 0]);
  eq('当社負担の会社: 未処理にならない', ctx.feeResiduals('FT').length, 0);

  /* 画面 */
  ctx.__x.setFY(2024);
  el.innerHTML=''; const h=ctx.viewArShort();
  eq('差額の画面: 会社・回数・未処理・足す額・不足・対応', ['先方負担社','当社負担社','差引き回数','未処理','次回請求に足す','不足','次回請求に加算','当社負担にする'].every(x=>h.includes(x)), true);
  eq('差額の画面はメニューの 回収 にある', ctx.__x.SECTIONS.find(x=>x.id==='sec-ar').tabs.some(t=>t.id==='arshort'), true);
  eq('差額の権限は 請求と同じ', ctx.canSee('arshort'), ctx.canSee('invoices'));
  eq('取引先に「振込手数料」の欄', ctx.__x.ENTITIES.companies.fields.some(f=>f.name==='feeBurden'), true);
  const v=ctx.mailVars('ar','FS');
  eq('メールの差し込み: 回数・額', [v['手数料差引回数'], v['手数料差引額']], ['3', '1,320']);
  eq('ベル: 未処理の差引き', ctx.notifItems().some(x=>x.key==='fee-short'), true);

  ctx.__x.setFY(2025);
  _db.invoices=keep.inv; _db.payments=keep.pay; _db.companies=keep.co;
}

console.log('\n― 回収のツール・請求の手入力（複数行）・CSV（2026-09-17） ―');
{
  const cos=(_db.companies||[]).filter(c=>c.kind!=='仕入先');
  const c1=cos[0], before=_db.invoices.length;
  el.innerHTML=''; const h=ctx.viewArBook();
  eq('ツール: 並び順・絞り込み・担当・手入力・CSV・MF・出力', ['並び順','未回収のみ','期限超過のみ','担当','請求を手入力（複数行）','CSVテンプレート','CSVを取り込む','Money Forward から取り込む','CSV出力'].every(x=>h.includes(x)), true);
  eq('ツールの外に Money Forward のボタンは無い', /<\/summary>/.test(h) && h.split('<details')[0].includes('openMfImport'), false);
  const r=ctx.abBlank(); r.companyId=c1.id; r.total=110000; ctx.abFill(r);
  eq('手入力: 取引先の税区分・期日が入り、税抜は自動', [r.taxCat, r.net, !!r.dueDate], [c1.taxCat||'課税10%', 100000, true]);
  const nt={ ...ctx.abBlank(), companyId:c1.id, total:50000, taxCat:'非課税' }; ctx.abFill(nt);
  eq('非課税は 税抜＝税込', nt.net, 50000);
  eq('新しい行は 取引先を引き継がない', ctx.abBlank(r).companyId, '');
  eq('足りない行は 理由を返す', ctx.abIssues(ctx.abBlank()).length>0, true);
  const rec=ctx.arBillRec(r);
  eq('保存の形（1件の画面と同じ）', [rec.subtotal, rec.taxCat, rec.status, /^INV-/.test(rec.no), rec.items.length], [100000, r.taxCat, '確定', true, 0]);
  const csv='\ufeff取引先名,計上月,請求日,税区分,請求額(税込),税抜,入金期日,請求番号,備考\n例）見本,2026-09,,,1,,,,\n'
    +'"'+c1.name+'",2026/9,2026/09/30,非課税,"55,000",,2026/10/15,X-1,メモ\n知らない会社,2026-09,,,1000,,,,\n';
  const res=ctx.arCsvToRows(csv);
  eq('CSV: 「例）」の行は読まない', res.rows.length, 2);
  eq('CSV: 取引先・月・税区分・金額・期日（手で決めた期日は そのまま）', [res.rows[0].companyId, res.rows[0].bookMonth, res.rows[0].taxCat, res.rows[0].total, res.rows[0].net, res.rows[0].dueDate, res.rows[0].no],
    [c1.id, '2026-09', '非課税', 55000, 55000, '2026-10-15', 'X-1']);
  eq('CSV: 見つからない取引先は 名前を残して 取引先を空に', [res.rows[1].companyId, res.rows[1].hint], ['', '知らない会社']);
  eq('CSV: 必要な列が無ければ理由を返す', !!ctx.arCsvToRows('a,b\n1,2\n').error, true);
  eq('手入力では まだ保存していない', _db.invoices.length, before);
  eq('並び順: 残高が大きい順', ctx.arSorter('bal')({bal:1,name:'a',staff:{key:'',name:''}},{bal:5,name:'b',staff:{key:'',name:''}})>0, true);
}

console.log('\n― 期（会計期間）・締め・前期と比べる（2026-09-17） ―');
{
  const X=ctx.__x;
  const keepSet=_db.settings; _db.settings=Object.assign({}, keepSet||{});
  eq('第1期＝2021年8月 → 2025/8〜は第5期', [X.periodNo(2025), X.periodNo(2021)], [5, 1]);
  eq('期の名前', ctx.fyLabel(2025), '第5期（2025/8〜2026/7）');
  _db.settings.firstFy=2020;
  eq('第1期を変えると番号も変わる', X.periodNo(2025), 6);
  delete _db.settings.firstFy;
  const cur=ctx.fyOf(ctx.thisMonth());
  eq('入力の初期値: 今期は今日、過去の期は期末、未来の期は期首', [X.defaultDateIn(cur), X.defaultDateIn(cur-1), X.defaultDateIn(cur+1)],
    [ctx.today(), (cur)+'-07-31', (cur+1)+'-08-01']);
  X.setFY(2025);
  eq('期の中の日付は通る', ctx.periodGuard(['2025-08-01','2026-07-31','2026-01'],'テスト'), true);
  el.innerHTML='';
  eq('期の外の日付は止める', ctx.periodGuard(['2026-09-10'],'入金'), false);
  eq('止めた理由と「第6期に切り替える」', [String(el.innerHTML).includes('第5期'), String(el.innerHTML).includes('第6期 に切り替える')], [true, true]);
  _db.settings.closedFy=[2025];
  eq('締めた期は 期の中でも止める', ctx.periodGuard(['2025-09-01'],'入金'), false);
  eq('締めた期の判定', [X.isClosedFy(2025), X.isClosedFy(2024), X.recClosed(['2025-10-01']), X.recClosed(['2026-08-01'])], [true, false, true, false]);
  el.innerHTML=''; X.setFY(2024);
  ctx.periodGuard(['2025-09-01'],'入金');
  eq('締めた期へは 切り替えのボタンを出さない', String(el.innerHTML).includes('に切り替える'), false);
  _db.settings.closedFy=[];
  X.setFY(2025);
  eq('増減率', [X.cmpRate(110,100), X.cmpRate(90,100), X.cmpRate(5,0)], [10, -10, null]);
  X.setCmp(true);
  eq('前期と比べる: 増えて良い→緑、費用が増える→赤', [/cmp up/.test(ctx.cmpHtml(110,100,true)), /cmp down/.test(ctx.cmpHtml(110,100,false)), ctx.cmpHtml(110,100,true).includes('+10.0%')], [true, true, true]);
  el.innerHTML=''; const hy=ctx.viewYojitsu();
  eq('予実に 前期の比べ', hy.includes('class="cmp'), true);
  el.innerHTML=''; const hb=ctx.viewArBook();
  eq('売掛金に 前期の比べ', hb.includes('class="cmp'), true);
  el.innerHTML=''; const he=ctx.viewExpenses();
  eq('費用表の画面が出る（比べ on）', he.includes('費用表'), true);
  X.setCmp(false);
  eq('比べ off なら 出さない', ctx.viewYojitsu().includes('class="cmp'), false);
  _db.settings=keepSet;
}

console.log('\n― 取引先モーダル（得意先／支払先・横3列） ―');
/* ★ 2026-09-14: 新規登録・編集・詳細 を同じ3列にした。
   見た目を変えても、フォームから項目が1つでも落ちると 保存でその値が消える。だから全項目を数える。 */
{
  const E = ctx.__x.ENTITIES.companies;
  const modalHtml = fn => { el.innerHTML=''; fn(); return String(el.innerHTML); };
  const allNamed = h => E.fields.every(f => h.includes(`name="${f.name}"`));

  const fAr = modalHtml(()=>ctx.openForm('companies','C1'));
  eq('得意先 編集は3列', (fAr.match(/class="co-col"/g)||[]).length, 3);
  eq('得意先 編集は data-side=ar', fAr.includes('data-side="ar"'), true);
  eq('得意先の文言は 入金サイト・入金日', fAr.includes('入金サイト') && fAr.includes('>入金日<'), true);
  eq('得意先 編集に全項目が残る（保存で消えない）', allNamed(fAr), true);
  eq('得意先 編集に 取引状況（売掛残高・請求ルール・台帳）', ['売掛残高','請求ルール','最終請求・入金','台帳を見る'].every(s=>fAr.includes(s)), true);
  eq('得意先 編集に 添付の1行', fAr.includes('＋ ファイル追加'), true);
  eq('保存する項目名は変えない（paySite/payDay）', fAr.includes('name="paySite"') && fAr.includes('name="payDay"'), true);

  const fAp = modalHtml(()=>ctx.openForm('companies','C3'));
  eq('支払先 編集は data-side=ap', fAp.includes('data-side="ap"'), true);
  eq('支払先の文言は 支払サイト・支払日', fAp.includes('支払サイト') && fAp.includes('>支払日<') && fAp.includes('管理・口座情報'), true);
  eq('支払先 編集にも全項目が残る（隠すだけ）', allNamed(fAp), true);
  eq('支払先 編集に 振込先・口座', fAp.includes('name="bankInfo"'), true);

  const dAr = modalHtml(()=>ctx.openDetail('companies','C1'));
  eq('得意先 詳細も3列', (dAr.match(/class="co-col"/g)||[]).length, 3);
  eq('詳細には入力欄を出さない', /name="(name|paySite|note)"/.test(dAr), false);
  eq('得意先 詳細に 1か月後・末日', dAr.includes('1か月後') && dAr.includes('末日'), true);
  const dAp = modalHtml(()=>ctx.openDetail('companies','C3'));
  eq('支払先 詳細は 買掛残高・支払状況・最終支払', ['買掛残高','支払状況','最終支払','台帳を見る'].every(s=>dAp.includes(s)), true);
  eq('支払先 詳細に 売掛のカードは出さない', dAp.includes('売掛残高'), false);

  const fNew = modalHtml(()=>ctx.openForm('companies', null, {kind:'仕入先', closingDay:31, paySite:1, payDay:31}));
  eq('新規登録は 支払先の見出し', fNew.includes('新規登録') && fNew.includes('data-side="ap"'), true);
  eq('新規登録には 取引状況を出さない', fNew.includes('co-stats'), false);
  eq('新規登録の添付は 保存後の案内', fNew.includes('保存すると付けられます'), true);
  eq('新規登録にも全項目', allNamed(fNew), true);

  /* 得意先なのに 支払の伝票もある会社 → 売掛・買掛を並べる（5枚） */
  _db.bills.push({ id:'BCOT', companyId:'C1', status:'確定', bookMonth:'2025-09', dueDate:'2025-10-31', items:[{name:'x', amount:1000, taxCat:'対象外'}] });
  const dBoth = modalHtml(()=>ctx.openDetail('companies','C1'));
  eq('両方の動きがあれば 5枚', dBoth.includes('co-stat-row n5') && dBoth.includes('買掛残高') && dBoth.includes('売掛残高'), true);
  _db.bills = _db.bills.filter(b=>b.id!=='BCOT');

  eq('期日の見本（得意先）', ctx.coDuePreview({kind:'得意先', paySite:1, payDay:31}).includes('入金予定日'), true);
  eq('期日の見本（支払先）', ctx.coDuePreview({kind:'仕入先', paySite:2, payDay:25}).includes('支払予定日'), true);
  eq('サイト未入力なら案内', ctx.coDuePreview({kind:'仕入先', paySite:''}).includes('支払サイトを入れると'), true);
  el.innerHTML='';
}

console.log('\n― 画面に説明文を置かない・入力は1画面で見える ―');
/* ★ 2026-09-16 利用者の指示: 説明は 入力ガイドに1か所だけ。画面には数字と操作だけを置く。 */
{
  const sh = ctx.pageShell({ title:'見出し', count:3, sub:'これは説明です', body:'<i>x</i>' });
  eq('pageShell は sub を出さない', /これは説明です|page-sub/.test(sh), false);
  eq('pageShell は 画面名と件数を出す', sh.includes('見出し') && sh.includes('(3件'), true);
  ['viewDashboard','viewYojitsu','viewCompare','viewMikomi','viewExpenses','viewProperties','viewArBook','viewApBook',
   'viewBills','viewReceipts','viewCashflow','viewInvoices'].forEach(fn=>{
    let h=''; try{ h=String(ctx[fn]()); }catch(e){ console.log('  NG  '+fn+' → '+e.message); fail++; return; }
    eq(fn+' に説明の帯（infobar）が無い', h.includes('class="infobar"'), false);
  });
  /* 横3列・モーダルの幅（1画面で見えるように） */
  const css = html.slice(0, html.indexOf('</style>'));
  eq('モーダルは既定 960px・高さ92vh', /\.modal\{[^}]*width:960px/.test(css) && /\.modal\{[^}]*max-height:92vh/.test(css), true);
  eq('フォームは横3列', /\.form-grid\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/.test(css), true);
  eq('900px以下は2列・700px以下は1列', /max-width:900px\)\{ \.form-grid\{grid-template-columns:repeat\(2/.test(css)
    && /max-width:700px\)\{ \.form-grid\{grid-template-columns:minmax\(0,1fr\)/.test(css), true);
  eq('詳細（見るだけ）も横3列', /\.kvgrid\{[^}]*grid-template-columns:repeat\(3/.test(css), true);
  /* 対象のフォーム: 説明文を並べない・支払方法は出さない */
  el.innerHTML=''; ctx.openForm('costItems','CI1');
  const f=String(el.innerHTML);
  /* 残ってよいのは「科目が足りないとき どこへ行くか」の案内だけ（説明ではなく道案内） */
  eq('対象のフォームに項目の説明文を並べない', (f.match(/class="fhelp"/g)||[]).length, 1);
  eq('残るのは 勘定科目の登録への案内だけ', f.includes('勘定科目の登録'), true);
  eq('対象のフォームに vendor・method は出さない', /name="vendor"|name="method"/.test(f), false);
  eq('対象のフォームは 勘定科目・支払先・物件・月額・税区分を持つ',
    ['accountCode','companyId','propertyId','monthly','taxCat'].every(n=>f.includes('name="'+n+'"')), true);
  el.innerHTML='';
}

console.log('\n― 画面の入れ替えは1回だけ ―');
/* ★ 2026-09-13 の不具合の再発防止:
   画面を入れたあとに もう一度 innerHTML を組み直すと、先に作った要素が DOM から
   切り離される。ユーザー一覧のように「箱を捕まえてから fetch して、あとで書き込む」
   読み込みは、切り離された箱に書くので何も出なくなる。
   だから renderPage は el.innerHTML に「1回だけ」入れること。 */
{
  let writes=0;
  const mainEl={ _h:'', get innerHTML(){ return this._h; }, set innerHTML(v){ writes++; this._h=v; },
    style:{}, classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},
    querySelector:()=>null, querySelectorAll:()=>[], addEventListener:noop, appendChild:noop };
  const orig=ctx.document.getElementById;
  ctx.document.getElementById=(id)=> id==='main'? mainEl : orig(id);
  ['users','audit','apilink','crmlink','arbook','receipts','invoices','expenses','ledger'].forEach(pg=>{
    writes=0;
    try{ ctx.renderPage(pg); }catch(e){ console.log('  NG  renderPage('+pg+') → '+e.message); fail++; return; }
    eq('renderPage('+pg+') は1回だけ書く', writes, 1);
  });
  ctx.document.getElementById=orig;
}

console.log('\n― 見せる画面（権限） ―');
/* ★ 費用の情報を扱う画面なので、「見せない」が本当に効くことを確かめる */
_db.userPerms = { 'staff@biglight.jp': { expenses:{v:0}, properties:{v:0}, kbunrui:{v:0} } };
ctx.__x.setSession({ email:'staff@biglight.jp', role:'Staff', status:'active' });
eq('表示を外した画面は見えない', ctx.canSee('expenses'), false);
/* ★ 見せない画面は、作る・直す・消す もできない（2026-09-14 の穴の再発防止） */
eq('見せない画面では作れない', !!ctx.__x.canCreate('expenses'), false);
eq('見せない画面では直せない', !!ctx.__x.canEdit('expenses'), false);
eq('見せない画面では消せない', !!ctx.__x.canDelete('expenses'), false);
eq('物件も見えない', ctx.canSee('properties'), false);
eq('外していない画面は見える', ctx.canSee('invoices'), true);
eq('メニューにも出ない', ctx.__x.SECTIONS.find(x=>x.id==='sec-cost').tabs.filter(t=>ctx.canSee(t.id)).length, 0);
/* 同じ台帳を別の入口から見る画面は、権限も同じ（支払先＝取引先の権限） */
eq('支払先は取引先の権限に従う', ctx.canSee('vendors'), ctx.canSee('companies'));
eq('権限の表は全画面を並べる', ctx.permPages().length>=14, true);
_db.userPerms = {};
ctx.__x.setSession({ email:'test@biglight.jp', role:'Admin', status:'active' });
eq('管理者は全部見える', ctx.__x.SECTIONS.every(sec=>sec.tabs.every(t=>ctx.canSee(t.id))), true);

console.log('\n― 勘定科目の階層（大・中・小） ―');
eq('初期セット前は階層なし', ctx.__x.accTreeReady(), false);
eq('平らなときは全部が根に見える', ctx.__x.accountRoots().length>0, true);
eq('そのときは今までどおり平らに選べる', ctx.accountsOfKind('sga').length>0, true);
ctx.accInitTree();
eq('階層ができた', ctx.__x.accTreeReady(), true);
eq('大分類は4つ', ctx.__x.accountRoots().length, 4);
eq('コードは変わらない（6200 は残る）', !!ctx.__x.accountByCode('6200'), true);
const sgaRoot = ctx.__x.accountRoots().find(r=>r.kind==='sga');
eq('今までの科目が大分類の下に入る', ctx.__x.accountChildren(sgaRoot.id).length>0, true);

const mid  = ctx.commitRecord('accounts',{code:'6215',label:'水道光熱費',parentId:sgaRoot.id,kind:'',order:5},{}).record;
const leaf = ctx.commitRecord('accounts',{code:'6216',label:'電気代',    parentId:mid.id,    kind:'',order:1},{}).record;
eq('区分は上から受け継ぐ', ctx.accountKind('6216'), 'sga');
eq('道筋が出る', ctx.__x.accountPathLabel('6216'), '販売費及び一般管理費 › 水道光熱費 › 電気代');
eq('子を持つ科目は末端ではない', ctx.__x.accountIsLeaf(mid), false);
eq('その下のコードを全部集める', ctx.__x.accountCodesUnder('6215').slice().sort(), ['6215','6216']);
/* ★ 二重計上を止める肝: 親は選べない */
const opts = ctx.accountOptionsHtml('', null);
eq('親は選べない（value が付かない）', opts.includes('value="6215"'), false);
eq('末端は選べる', opts.includes('value="6216"'), true);
eq('区分で絞ると末端だけ出る', ctx.accountsOfKind('sga').some(a=>a.code==='6215'), false);
eq('使用中の件数を数える', ctx.accountUsage('6200')>0, true);
try{ const h=ctx.viewAccounts(); const ok=h.length>500;
  console.log((ok?'  ok  ':'  NG  ')+'viewAccounts  →  '+h.length+' 文字'); ok?pass++:fail++; }catch(e){ console.log('  NG  viewAccounts → '+e.message); fail++; }

/* ══════════════════════════════════════════════════════════════════════
   デモデータ — 入れて・確かめて・消す
   本物が巻き込まれないことまで見る（ここが一番大事） ══════════════════ */
(async ()=>{
  console.log('\n― ユーザー管理の画面（実際に読み込ませる） ―');
  {
    const origFetch=ctx.fetch;
    ctx.fetch=async(url)=>String(url).endsWith('/users')
      ? { ok:true, status:200, json:async()=>({ items:[
          {email:'a@biglight.jp',name:'管理者A',role:'Admin',status:'active',last_login:'2026-09-13T09:00:00Z'},
          {email:'b@biglight.jp',name:'新人B', role:'Viewer',status:'pending',last_login:null},
          {email:'c@biglight.jp',name:'経理C', role:'Staff', status:'active',last_login:'2026-09-12T01:00:00Z'} ]}) }
      : { ok:false, status:404, json:async()=>({}) };
    await ctx.loadUsers();
    /* ★ ここが 2026-09-13 に「何も出ない」となっていたところ */
    eq('一覧が実際に描かれる', el.innerHTML.length>800, true);
    eq('承認待ちの人を上に出す', el.innerHTML.includes('承認待ち（1人）'), true);
    eq('見られる画面の欄が出る', el.innerHTML.includes('見られる画面'), true);
    eq('自分の行は役割を変えられない', el.innerHTML.includes('あなた'), false);   // SESSION は test@ なので該当なし
    /* 取れないときは黙らない */
    ctx.fetch=async()=>({ ok:false, status:403, json:async()=>({error:'account-pending', message:'まだ承認されていません'}) });
    await ctx.loadUsers();
    eq('取れないときは理由（HTTP）を出す', el.innerHTML.includes('403'), true);
    eq('取れないときは もう一度 を出す', el.innerHTML.includes('もう一度'), true);
    ctx.fetch=origFetch;
  }

  console.log('\n― デモデータ ―');
  /* 本物のデータを1件置いておく。消したあとも残っていなければならない */
  const realId='REAL-KEEP';
  _db.invoices.push({ id:realId, no:'REAL-001', companyId:'C1', bookMonth:'2025-09', dueDate:'2025-10-31',
    status:'確定', items:[{accountCode:'4100', amount:12345, taxCat:'課税10%'}] });
  const before={}; Object.keys(_db).forEach(k=>{ if(Array.isArray(_db[k])) before[k]=_db[k].length; });

  /* デモを入れる前の数字（本物の分）。デモの分だけで 8,000万・20% になっているかを見る */
  const FYA = ctx.fyOf(ctx.thisMonth())-1;
  const S12 = a => a.reduce((t,v)=>t+v,0);
  const pre = { rev:S12(ctx.plBook(FYA,'actual').revenue), ord:S12(ctx.plBook(FYA,'actual').ordinary), brev:S12(ctx.plBook(FYA,'budget').revenue), bord:S12(ctx.plBook(FYA,'budget').ordinary) };
  await ctx.demoSeed();
  const n = ctx.demoCount();
  eq('デモが入った（件数）', n>300, true);
  eq('取引先は25社（得意先15・支払先10）', _db.companies.filter(c=>c.demo).length, 25);
  eq('特定技能者は作らない', _db.workers.filter(w=>w.demo).length, 0);
  eq('物件は4件', _db.properties.filter(p=>p.demo).length, 4);
  eq('前年度の12か月 × 15社 の請求（今年度は作らない）', _db.invoices.filter(i=>i.demo).length, 180);
  eq('デモの請求は全部 前年度', _db.invoices.filter(i=>i.demo).every(i=>ctx.fyOf(i.bookMonth)===FYA), true);
  eq('まだ来ていない日の入金は無い', _db.payments.filter(x=>x.demo).every(x=>x.date<=ctx.today()), true);
  eq('全部に【デモ】の印', _db.companies.filter(c=>c.demo).every(c=>c.name.startsWith('【デモ】')), true);

  console.log('\n― デモの数字: 前年度 売上 8,000万円・経常利益 20% ―');
  {
    const bk=ctx.plBook(FYA,'actual');
    eq('前年度の売上（デモの分）＝ 80,000,000', S12(bk.revenue)-pre.rev, 80000000);
    eq('前年度の経常利益（デモの分）＝ 16,000,000（20%）', S12(bk.ordinary)-pre.ord, 16000000);
    eq('前年度は12か月すべてに売上がある', bk.revenue.every(v=>v>0), true);
    eq('前年度は12か月すべてに費用がある', bk.sga.every(v=>v>0) && bk.cogs.every(v=>v>0), true);
    const bu=ctx.plBook(FYA,'budget');
    eq('予算の売上（デモの分）＝ 65,000,000', S12(bu.revenue)-pre.brev, 65000000);
    eq('予算の経常利益（デモの分）＝ 11,700,000（18%）', S12(bu.ordinary)-pre.bord, 11700000);
    eq('予算は12か月すべてにある', bu.revenue.every(v=>v>0), true);
    eq('OKR の見本がある', (_db.objectives||[]).filter(o=>o.demo).length, 2);
  }

  console.log('\n― 入金チェック（全額・不足・過入金…） ―');
  {
    const rows=ctx.arCheckRows(FYA).filter(r=>r.inv.demo), by=k=>rows.filter(r=>r.kind===k);
    const co=n=>_db.companies.find(c=>c.name.includes(n)).id;
    eq('請求1枚に1行', rows.length, 180);
    eq('8つの判定が全部そろう', ['ok','late','split','fee','over','short','none','wait'].every(k=>by(k).length>0), true);
    const hik=rows.filter(r=>r.companyId===co('ひかり介護')).sort((a,b)=>a.ym.localeCompare(b.ym));
    eq('過入金: ひかり 12月分で +100,000', [hik[4].kind, hik[4].diff], ['over', 100000]);
    eq('過入金の分は 翌月の請求に充当', hik[5].prepaid, 100000);
    eq('過入金の翌月は 残りだけ振り込み（残高0）', [hik[5].bal, hik[5].cash], [0, hik[5].total-100000]);
    const mid=rows.filter(r=>r.companyId===co('みどり農園'));
    eq('手数料差引: 振込額＋手数料＝請求額、残高0', mid.every(r=>r.kind!=='fee' || (r.cash+r.fee===r.total && r.bal===0 && r.fee===660)), true);
    const kan=rows.filter(r=>r.companyId===co('関東精密')).sort((a,b)=>a.ym.localeCompare(b.ym));
    eq('不足→翌月に不足分も: 11月分は2回で全額', [kan[3].kind, kan[3].nPay, kan[3].bal], ['split', 2, 0]);
    eq('二重振込: 宇都宮 3月分が過入金', rows.filter(r=>r.companyId===co('宇都宮')).some(r=>r.kind==='over'), true);
    eq('不足: 那須は 期日を過ぎて半分だけ', rows.some(r=>r.companyId===co('那須') && r.kind==='short'), true);
    eq('未入金: 北関東の直近分', rows.some(r=>r.companyId===co('北関東') && r.kind==='none'), true);
    eq('差額 ＝ 入った額 − 請求額（不足は 残高のマイナス）', rows.every(r=>r.kind==='over' || r.diff===-r.bal), true);
    eq('どの請求にも充てていない入金は残らない（多い分は次へ）', ctx.unAllocated(), 0);
    ctx.setArchkFilter('over');
    const h=ctx.viewArCheck();
    eq('入金チェックの画面が描ける（過入金だけに絞る）', h.includes('入金チェック') && h.includes('ひかり介護') && !h.includes('みどり農園株式会社</b>'), true);
    ctx.setArchkFilter('over');
    eq('回収のタブに 入金チェック', ctx.__x.SECTIONS.find(x=>x.id==='sec-ar').tabs.some(t=>t.id==='archeck'), true);
  }

  console.log('\n― 買掛金（支払先×月の残高）―');
  {
    eq('支払のタブ: 買掛金・支払請求・支払実行・資金繰り', ctx.__x.SECTIONS.find(x=>x.id==='sec-ap').tabs.map(t=>t.id), ['apbook','bills','payouts','cashflow']);
    eq('古い 未払（年齢表）・支払先別 は 買掛金へ', [ctx.__x.PAGE_REDIRECT.apaging, ctx.__x.PAGE_REDIRECT.apco], ['apbook','apbook']);
    /* ★ 2026-09-16 にメニューから外した画面は 費用表へ案内（コードは残っている） */
    eq('支払推移表・分類別集計は 費用表へ案内', [ctx.__x.PAGE_REDIRECT.apsuii, ctx.__x.PAGE_REDIRECT.kbunrui], ['expenses','expenses']);
    eq('費用のタブは 費用表・物件 の2つ', ctx.__x.SECTIONS.find(x=>x.id==='sec-cost').tabs.map(t=>t.id), ['expenses','properties']);
    const ids=ctx.apCompanyIds(), tm=ctx.thisMonth();
    const bal=ids.reduce((t,id)=>t+ctx.apMonthly(id,[tm])[0].closing,0);
    eq('買掛金の月末残高の合計 ＝ 未払残高（支払をすべて充てているデモ）', bal, ctx.apTotal());
    const oya=_db.companies.find(c=>c.name.includes('丸山不動産'));
    const m=ctx.apMonthly(oya.id, ctx.fyMonths(FYA));
    eq('月末残高 ＝ 前月残高 ＋ 支払請求 − 支払', m.every(r=>r.closing===r.opening+r.billed-r.payment), true);
    let h=ctx.viewApBook();
    eq('買掛金の画面: 支払先が行・12か月が列', h.includes('丸山不動産') && (h.match(/apCellPop\(/g)||[]).length>=12, true);
    el.innerHTML=''; ctx.openLedger(oya.id,'ap');
    eq('支払先の名前から 買掛元帳（モーダル）', String(el.innerHTML).includes('買掛元帳'), true);
  }

  console.log('\n― 費用表（デモの量で）―');
  {
    ctx.setTaxView('gross');
    const S=a=>a.reduce((t,v)=>t+v,0);
    const rows=ctx.costRowsOf(FYA).rows;
    eq('対象が全部 行になる', rows.length, ctx.costItemsSorted().length);
    /* 木の合計 ＝ 対象のマスの合計（1円も違わない） */
    const tree=ctx.costTree(rows);
    const treeTotal=tree.reduce((t,n)=>t+S(ctx.costNodeSum(n)),0);
    const cellTotal=rows.reduce((t,r)=>t+S(r.cells),0);
    eq('木の合計 ＝ マスの合計', treeTotal, cellTotal);
    /* 買掛の対象: 費用表の予定 ＝ その月の支払請求（税込） */
    const rentIt=_db.costItems.find(c=>c.demo && c.name.includes('本社事務所'));
    const ym=ctx.fyMonths(FYA)[2];
    eq('買掛の対象の予定 ＝ 支払請求の税込', ctx.costCellAmount(rentIt.id, ym), ctx.costBillCell(rentIt.id, ym).gross);
    const h=ctx.viewExpenses();
    eq('費用表に 大分類・対象・→12 が出る', h.includes('販売費及び一般管理費') && h.includes('本社事務所') && h.includes('→12'), true);
    eq('費用表に 色分け・KPI・税抜行は出さない', /うち消費税|月次費用表|個別に経費/.test(h), false);
    ctx.setTaxView('net');
  }

  console.log('\n― 担当者別の売上 ―');
  {
    const sum=(a,s,e)=>a.slice(s,e+1).reduce((t,v)=>t+v,0);
    ctx.setTaxView('net');
    [[0,11],[7,8],[0,9],[4,4],[11,11]].forEach(([s,e])=>{
      eq(`担当者別の合計＝予実の売上（${s}〜${e}）`, ctx.staffRevenue(FYA,s,e).total, sum(ctx.actualSeries(FYA,'revenue'),s,e));
    });
    ctx.setTaxView('gross');
    [[0,11],[7,8]].forEach(([s,e])=>{
      eq(`税込でも 担当者別の合計＝税込の売上（${s}〜${e}）`, ctx.staffRevenue(FYA,s,e).total, sum(ctx.actualSeriesGross(FYA,'revenue'),s,e));
    });
    ctx.setTaxView('net');
    const sr=ctx.staffRevenue(FYA,0,11);
    const names=sr.rows.map(r=>r.name);
    eq('4人に分かれる（山田・佐々木・中村・自分）', ['デモ 山田','デモ 佐々木','デモ 中村'].every(x=>names.includes(x)) && sr.rows.some(r=>r.key==='test@biglight.jp'), true);
    const fuji=_db.companies.find(c=>c.name.includes('富士ビル'));
    const fInv=_db.invoices.filter(i=>i.companyId===fuji.id && ctx.fyOf(i.bookMonth)===FYA);
    eq('担当交代の前（8〜1月）の請求は 元の担当が写っている', fInv.filter(i=>ctx.fyIndexOf(i.bookMonth)<6).every(i=>i.staff==='デモ 佐々木'), true);
    eq('担当交代の後（2〜7月）の請求は 新しい担当', fInv.filter(i=>ctx.fyIndexOf(i.bookMonth)>=6).every(i=>i.staff==='デモ 中村'), true);
    eq('取引先の今の担当は 新しい担当', fuji.owner, 'デモ 中村');
    const sasakiH1=ctx.staffRevenue(FYA,0,5).rows.find(r=>r.name==='デモ 佐々木');
    eq('上期の佐々木に 富士ビルの売上が入る', sasakiH1.cos.has(String(fuji.id)), true);
    eq('下期の佐々木には 富士ビルは入らない', ctx.staffRevenue(FYA,6,11).rows.find(r=>r.name==='デモ 佐々木').cos.has(String(fuji.id)), false);
    /* 名前（CRM）とメール（このシステム）が同じ人なら 1行にまとまる */
    ctx.__x.setUsers([{ email:'yamada@biglight.jp', name:'デモ　山田', status:'active' }]);
    eq('名前でもメールでも同じ人', ctx.staffOf('デモ 山田').key, ctx.staffOf('YAMADA@biglight.jp').key);
    const saku=_db.companies.find(c=>c.name.includes('さくら製作所'));
    const keep=saku.owner; saku.owner='yamada@biglight.jp';
    eq('メールに変えても 山田は1行のまま', ctx.staffRevenue(FYA,0,11).rows.filter(r=>r.key==='yamada@biglight.jp').length, 1);
    saku.owner=keep; ctx.__x.setUsers([]);
    eq('知らない名前は そのまま名前で出す', ctx.staffOf('田中 一郎').name, '田中 一郎');
    eq('空は 未設定', ctx.staffOf('').name, '未設定');
  }

  console.log('\n― ダッシュボード: 集計する月 ―');
  {
    eq('デモのあとは 前年度を通期で開く', [ctx.__x.CUR_FY, ctx.__x.DASH_RANGE.s, ctx.__x.DASH_RANGE.e], [FYA,0,11]);
    ctx.setTaxView('net');
    let h=ctx.viewDashboard();
    eq('在籍者 の数は出さない', h.includes('在籍者'), false);
    eq('担当者別 売上 が出る', h.includes('担当者別 売上') && h.includes('デモ 山田'), true);
    eq('月を横に引く帯が出る', (h.match(/class="dr-cell/g)||[]).length, 12);
    eq('通期の売上高が出る', h.includes(ctx.__x.moneyPlain(S12(ctx.plBook(FYA,'actual').revenue))), true);
    ctx.setDashRange(0,9);
    h=ctx.viewDashboard();
    eq('8月〜翌5月（年をまたぐ）', h.includes(`${FYA}年8月〜${FYA+1}年5月（10か月）`), true);
    const rv=ctx.actualSeries(FYA,'revenue').slice(0,10).reduce((t,v)=>t+v,0);
    eq('選んだ月の売上高', h.includes(ctx.__x.moneyPlain(rv)), true);
    ctx.setDashRange(8,7);
    eq('逆に引いても 小さい方から', [ctx.__x.DASH_RANGE.s, ctx.__x.DASH_RANGE.e], [7,8]);
    h=ctx.viewDashboard();
    eq('3〜4月', h.includes(`${FYA+1}年3月〜4月（2か月）`), true);
    eq('過去の範囲は 残高を月末時点で', h.includes(`${FYA+1}-04-30`), true);
    const b=ctx.dashBalances(FYA,8), tot=ctx.arCompanyIds().reduce((t,id)=>t+ctx.arMonthly(id,[`${FYA+1}-04`])[0].closing,0);
    eq('売掛残高（4月末）＝ 売掛金の画面の月末残高の合計', b.ar, tot);
    ctx.setDashRange(0,11);

    console.log('\n― 税込／税抜（ダッシュボード・予実・期間比較・見込実績表）―');
    const S=a=>a.reduce((t,v)=>t+v,0);
    ctx.setTaxView('gross');
    const demoInvGross=_db.invoices.filter(i=>i.demo).reduce((t,i)=>t+ctx.docTotal(i),0);
    const realInvGross=_db.invoices.filter(i=>!i.demo && i.status!=='取消' && ctx.fyOf((i.bookMonth||'').slice(0,7))===FYA).reduce((t,i)=>t+ctx.invRevenueGross(i),0);
    eq('税込の売上 ＝ 請求書の税込合計（前年度）', S(ctx.plView(FYA,'actual').revenue), demoInvGross+realInvGross);
    eq('デモの税込売上 ＝ 88,000,000（課税10%）', demoInvGross, 88000000);
    eq('税抜に戻すと 計算の本体と同じ', (ctx.setTaxView('net'), S(ctx.plView(FYA,'actual').ordinary)), S(ctx.plBook(FYA,'actual').ordinary));
    ctx.setTaxView('gross');
    const salary=ctx.grossRateOf(FYA,'6110'), rent=ctx.grossRateOf(FYA,'6201');
    eq('予算の換算: 給与（対象外）は 1.0、家賃（課税10%）は 約1.1', [salary, Math.round(rent*100)/100], [1, 1.1]);
    const hd=ctx.viewDashboard();
    eq('ダッシュボードに 税込／税抜 のボタン', hd.includes('setTaxView') && hd.includes('売上高（税込）'), true);
    eq('ダッシュボードの売上（税込）', hd.includes(ctx.__x.moneyPlain(S(ctx.plView(FYA,'actual').revenue))), true);
    ['viewYojitsu','viewCompare','viewMikomi'].forEach(fn=>{
      const h=ctx[fn](); eq(fn+' に 税込／税抜 のボタン', h.includes('setTaxView'), true);
      /* ★ 2026-09-16: 画面に説明文は置かない（説明は 入力ガイドへ） */
      eq(fn+' に説明の帯は出さない', /class="infobar"|税込で表示中/.test(h), false);
    });
    ctx.setTaxView('net');
    ctx.setTaxView('gross');
  }

  /* 会社ごとに払い方のくせが違う ＝ タイムラインの色が全部見られる */
  const sakura=_db.companies.find(c=>c.name.includes('さくら製作所'));
  const kita  =_db.companies.find(c=>c.name.includes('北関東物流'));
  eq('さくらは期日内100%', ctx.ledPerf(sakura.id,'ar').rate, 100);
  eq('北関東はいま超過中がある', ctx.ledPerf(kita.id,'ar').openOver>0, true);
  eq('北関東は遅れの平均が出る', ctx.ledPerf(kita.id,'ar').avgLate>0, true);
  eq('台帳の残高＝売掛残高（さくら）', ctx.ledEvents(sakura.id,'ar').pop().bal, ctx.arBalanceOf(sakura.id));
  eq('台帳の残高＝売掛残高（北関東）', ctx.ledEvents(kita.id,'ar').pop().bal, ctx.arBalanceOf(kita.id));

  /* 物件に費用が集まっているか */
  const pr = ctx.propRowsOf(ctx.__x.CUR_FY ? ctx.__x.CUR_FY : 2025);
  const rowsWithMoney = ctx.propRowsOf(2025).rows.filter(r=>r.cells.some(v=>v>0));
  eq('物件ごとに毎月の金額が集まる', rowsWithMoney.length>0, true);
  eq('家賃は買掛（支払請求から読む）', ctx.propRowsOf(2025).rows[0].items.some(r=>r.ap), true);
  const soon=_db.properties.filter(p=>{ const d=ctx.propDaysLeft(p); return d!==null && d<=90; });
  eq('満了が近い物件がデモに入っている', soon.length>0, true);
  eq('ベルが契約満了を知らせる', ctx.notifItems().some(x=>x.key==='prop-end'), true);

  /* 予実にもちゃんと乗る */
  eq('デモで売上が立つ', ctx.actualSeries(2025,'revenue').some(v=>v>0), true);
  eq('デモで売上原価が立つ（通訳費）', ctx.actualSeries(2025,'cogs').some(v=>v>0), true);
  eq('デモで販管費が立つ（家賃・光熱費）', ctx.actualSeries(2025,'sga').some(v=>v>0), true);

  /* 画面がデモの量でも落ちないか（少量の作り物より、こちらが本番に近い） */
  eq('支払先の一覧は仕入先だけ', ctx.viewCompanies('vendor').includes('丸山不動産'), true);
  eq('支払先の一覧に得意先は出ない', ctx.viewCompanies('vendor').includes('さくら製作所'), false);
  ['viewDashboard','viewInvoices','viewReceipts','viewAging','viewBills','viewPayouts','viewApAging',
   'viewCashflow','viewExpenses','viewProperties','viewCompanies','viewYojitsu','viewMikomi'].forEach(fn=>{
    try{ const h=ctx[fn](); const ok=typeof h==='string'&&h.length>80;
      console.log((ok?'  ok  ':'  NG  ')+fn+'（デモ入り）  →  '+(ok?h.length+' 文字':'空')); ok?pass++:fail++;
    }catch(e){ console.log('  NG  '+fn+'（デモ入り）  →  '+e.message); fail++; }
  });
  ctx.setLedCo(kita.id); ctx.setLedTab('timeline');
  try{ const h=ctx.viewLedger(); const ok=h.length>2000;
    console.log((ok?'  ok  ':'  NG  ')+'viewLedger（デモ・タイムライン）  →  '+h.length+' 文字'); ok?pass++:fail++; }catch(e){ fail++; }

  /* ── 取引先別（回収）／支払先別 ── */
  console.log('\n― 取引先別・支払先別（デモの量で） ―');
  {
    const kita2=_db.companies.find(c=>c.name.includes('北関東物流'));
    const saku2=_db.companies.find(c=>c.name.includes('さくら製作所'));
    ctx.setCoPeriod('fy');
    const rowsAr = ctx.coRows('ar');
    eq('回収の一覧に得意先が出る', rowsAr.some(r=>r.c.id===kita2.id), true);
    eq('回収の一覧に支払先（大家）は出ない', rowsAr.some(r=>r.c.name.includes('丸山不動産')), false);
    const rk = rowsAr.find(r=>r.c.id===kita2.id);
    eq('一覧の未回収＝売掛残高（同じ数字）', rk.bal, ctx.arBalanceOf(kita2.id));
    eq('遅れがちな会社は評価 D（いま30日超の超過あり）', ctx.payGrade(kita2.id,'ar').g, 'D');
    eq('期日どおりの会社は評価 A', ctx.payGrade(saku2.id,'ar').g, 'A');
    const nb = ctx.coNextBilling(kita2.id);
    eq('繰越額 ＝ 未回収 − 過入金', nb.carry, nb.unpaid - nb.over);
    eq('今回ご請求額 ＝ 繰越額 ＋ 今回お買上額', nb.total, nb.carry + nb.current);
    eq('今回お買上額は請求ルールから（月額固定 70,000＋税）', nb.current, 77000);
    const rowsAp = ctx.coRows('ap');
    eq('支払先別に大家が出る', rowsAp.some(r=>r.c.name.includes('丸山不動産')), true);
    eq('支払先別に得意先は出ない', rowsAp.some(r=>r.c.id===saku2.id), false);
    ['arco','apco'].forEach(pg=>{
      try{ ctx.coOpen(pg==='apco'?'ap':'ar', null); const h=ctx.viewCoList(pg==='apco'?'ap':'ar'); const ok=h.length>1500;
        console.log((ok?'  ok  ':'  NG  ')+`一覧 ${pg}  →  `+h.length+' 文字'); ok?pass++:fail++; }catch(e){ console.log('  NG  '+pg+' → '+e.message); fail++; }
    });
    try{ const h=ctx.viewCoDetail('ar', kita2.id); const ok=h.includes('今回ご請求額') && h.includes('評価');
      console.log((ok?'  ok  ':'  NG  ')+'詳細（回収）に 評価 と 繰越式の次回請求額  →  '+h.length+' 文字'); ok?pass++:fail++; }catch(e){ console.log('  NG  詳細 → '+e.message); fail++; }
    /* ★ 2026-09-14: 売掛側の会社名を押す → 売掛元帳（モーダル）。画面は移らない */
    const pgBefore=ctx.__x.CURRENT_PAGE; el.innerHTML='';
    ctx.openLedger(kita2.id,'ar');
    eq('会社名から 売掛元帳 を開く（画面は移らない）', [ctx.__x.CURRENT_PAGE===pgBefore, String(el.innerHTML).includes('売掛元帳')], [true,true]);
    /* ★ 2026-09-15: 売掛元帳に 評価 を戻した（取引先別の一覧と同じ payGrade） */
    eq('売掛元帳に 評価 が出る（遅れがちな会社は D）', String(el.innerHTML).includes('評価（入金の守り方）') && String(el.innerHTML).includes('ar-grade">D<'), true);
    el.innerHTML=''; ctx.openLedger(saku2.id,'ar');
    eq('期日どおりの会社は 売掛元帳でも A', String(el.innerHTML).includes('ar-grade">A<'), true);
    eq('売掛元帳には 督促記録・メールは戻さない', /督促記録|メールを送る/.test(String(el.innerHTML)), false);
    ctx.coOpen('ar', null);
  }

  /* ── 督促（デモの量で） ── */
  console.log('\n― 督促（デモ） ―');
  {
    const kita4=_db.companies.find(c=>c.name.includes('北関東物流'));
    const s=ctx.dunStatus(kita4.id);
    eq('デモの北関東は 約束を過ぎた', s.promise && s.promise.state, 'broken');
    eq('デモの北関東は いちばん上', ctx.dunRows()[0].companyId, kita4.id);
    eq('デモの北関東は 限度超過', ctx.creditOver(kita4.id), true);
    eq('ベルに 今日やる督促', ctx.notifItems().some(x=>x.key==='dunning'), true);
  }

  /* ── メール（CRMと同じ GAS） ── */
  console.log('\n― メール ―');
  {
    const kita3=_db.companies.find(c=>c.name.includes('北関東物流'));
    eq('回収のテンプレは7つ（督促1〜3・手数料差引きを含む）', ctx.mailTemplates('ar').length, 7);
    eq('支払のテンプレは2つ', ctx.mailTemplates('ap').length, 2);
    const v=ctx.mailVars('ar', kita3.id);
    eq('差し込みの次回請求額は 取引先別 と同じ数字', v['次回請求額'], ctx.__x.moneyPlain(ctx.coNextBilling(kita3.id).total));
    eq('差し込みの未回収額は 売掛残高 と同じ', v['未回収額'], ctx.__x.moneyPlain(ctx.arBalanceOf(kita3.id)));
    eq('宛名は 会社名 御中', v['会社名'].endsWith('御中'), true);
    eq('知らない差し込みは そのまま残す（確認画面で気づける）', ctx.__x.mailFill('{{会社名}} {{なぞ}}', v).includes('{{なぞ}}'), true);
    eq('未回収明細に 期日と残高', v['未回収明細'].includes('期日'), true);

    /* 実際に送る: GAS に CRM と同じ形で渡り、送信履歴が残る */
    let sent=null;
    const origFetch=ctx.fetch;
    ctx.fetch=async(url,opt)=>{ if(String(url).startsWith('https://script.google.com')) { sent={url,opt}; return {ok:true}; } return {ok:false,status:404,json:async()=>({})}; };
    ctx.__x.setSession({ email:'test@biglight.jp', name:'テスト', role:'Admin', status:'active', gasUrl:'https://script.google.com/macros/s/ABC/exec', mailAllowed:true });
    ctx.mailCompose('ar', kita3.id);
    ctx.__x.mailCtx().to='keiri@example.co.jp'; ctx.__x.mailCtx().files=[];
    const logBefore=(_db.mailLog||[]).length;
    await ctx.mailSend();
    eq('GAS の URL に送る', sent && sent.url, 'https://script.google.com/macros/s/ABC/exec');
    eq('no-cors で送る（CRM と同じ）', sent && sent.opt.mode, 'no-cors');
    const body=sent? JSON.parse(sent.opt.body) : {};
    eq('CRM の GAS と同じ形（to/subject/body/attachments）', ['to','cc','subject','body','senderName','attachments'].every(k=>k in body), true);
    eq('件名に差し込みが入っている', body.subject.includes('【'), true);
    eq('送信履歴が1件増える', (_db.mailLog||[]).length, logBefore+1);
    eq('回収のメールは そのまま対応記録にもなる', ctx.dunLogs(kita3.id)[0].method, 'メール');
    eq('履歴に宛先と会社', _db.mailLog[_db.mailLog.length-1].to==='keiri@example.co.jp' && _db.mailLog[_db.mailLog.length-1].companyId===kita3.id, true);
    try{ const h=ctx.viewCoDetail('ar', kita3.id); eq('取引先別の詳細に送信履歴が出る', h.includes('keiri@example.co.jp'), true); }catch(e){ console.log('  NG  '+e.message); fail++; }
    ctx.fetch=origFetch;
    ctx.__x.setSession({ email:'test@biglight.jp', role:'Admin', status:'active' });
  }

  /* ── 予実の実績: 費用は actuals だけ（伝票では動かない） ── */
  console.log('\n― 実績の出どころ（デモの量で） ―');
  {
    const S=a=>a.reduce((t,v)=>t+v,0);
    [FYA, FYA+1].forEach(fy=>{
      ['cogs','sga','nonop'].forEach(kind=>{
        const a=Array(12).fill(0);
        (_db.actuals||[]).forEach(x=>{ if(Number(x.fy)===fy && ctx.accountKind(x.accountCode)===kind){ a[Number(x.mIndex)]+=Number(x.amount); } });
        eq(`費用の実績 ＝ 手入力の合計（${fy}/${kind}）`, ctx.actualSeries(fy,kind), a);
      });
      const r=Array(12).fill(0);
      _db.invoices.forEach(i=>{ if(ctx.fyOf((i.bookMonth||'').slice(0,7))===fy) r[ctx.fyIndexOf(i.bookMonth)]+=ctx.invRevenue(i); });
      eq(`売上の実績 ＝ 請求書の合計（${fy}）`, ctx.actualSeries(fy,'revenue'), r);
    });
    /* 支払請求を増やしても 実績は動かない（予定と実績を分けた意味） */
    const before=S(ctx.actualSeries(FYA,'cogs'));
    _db.bills.push({ id:'BX-TEST', companyId:_db.companies[0].id, bookMonth:ctx.fyMonths(FYA)[0], status:'確定',
      dueDate:'2030-01-31', items:[{accountCode:'5100', amount:1234567, taxCat:'課税10%'}] });
    eq('支払請求を足しても 費用の実績は変わらない', S(ctx.actualSeries(FYA,'cogs')), before);
    _db.bills=_db.bills.filter(b=>b.id!=='BX-TEST');
    /* 費用表（予定）を打っても 実績は動かない */
    const it=_db.costItems.find(c=>c.demo && c.kind!=='variable');
    const ym=ctx.fyMonths(FYA)[0], keep=ctx.costCellAmount(it.id, ym);
    const beforeSga=S(ctx.actualSeries(FYA,'sga'));
    ctx.setCostCell(it.id, ym, keep+50000);
    eq('費用表に打っても 実績は変わらない', S(ctx.actualSeries(FYA,'sga')), beforeSga);
    ctx.setCostCell(it.id, ym, keep);
  }

  /* ── 予実 › 入力 › 実績: 収益の行は直せない ── */
  console.log('\n― 予実の入力タブ（実績） ―');
  {
    ctx.setYjTab('input'); ctx.setYjView('actual');
    const h=ctx.viewYojitsu();
    eq('実績のセグメントがある', h.includes('>実績</button>'), true);
    const rows=h.split('<tr').filter(x=>x.includes('cellin'));
    const roRow=rows.find(x=>x.includes('readonly'));
    eq('収益の行は readonly（請求書から）', !!roRow, true);
    eq('費用の行は打てる（onPlanInput に actual）', h.includes(`onPlanInput(this,'actual'`), true);
    eq('年額をまとめて入力は 実績には出さない', h.includes('12等分'), false);
    ctx.setYjView('budget');
    eq('予算の入力には 12等分がある', ctx.viewYojitsu().includes('12等分'), true);
    ctx.setYjTab('pl'); ctx.setYjView('compare');
  }

  /* 消す: デモだけが消え、本物は残る */
  await ctx.demoRemove(true);
  eq('デモは全部消えた', ctx.demoCount(), 0);
  eq('本物の請求は残っている', !!_db.invoices.find(i=>i.id===realId), true);
  eq('本物の件数に戻っている', _db.invoices.length, before.invoices);
  eq('本物の取引先も無事', _db.companies.length, before.companies);

  console.log(`\n結果: ${pass} 件成功 / ${fail} 件失敗\n`);
  process.exit(fail? 1:0);
})().catch(e=>{ console.error('  NG  デモデータのテストが落ちました → '+(e&&e.message)+'\n'+(e&&e.stack||'').split('\n').slice(0,4).join('\n')); process.exit(1); });
/* ※ ここに process.exit を書かないこと。上は非同期なので、書くと途中で殺してしまう。 */
