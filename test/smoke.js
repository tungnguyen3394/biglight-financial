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
code += '\n;globalThis.__x={ DEFAULT_ACCOUNTS, isApCost, PAY_MODES, LED_LATE_WARN, setDB:v=>{DB=v}, setFY:v=>{CUR_FY=v}, setSession:v=>{SESSION=v} };';

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

console.log('\n― 費用管理（月次費用表）―');
_db.costItems = [
  { id:'CI1', name:'事務所家賃',     accountCode:'6200', kind:'fixed',    monthly:220000, taxCat:'課税10%', vendor:'大家' },
  { id:'CI2', name:'クラウド利用料', accountCode:'6220', kind:'fixed',    monthly:33000,  taxCat:'課税10%' },
  { id:'CI3', name:'旅費交通費',     accountCode:'6300', kind:'variable', monthly:0,      taxCat:'課税10%' },
  { id:'CI4', name:'旧リース',       accountCode:'6900', kind:'fixed',    monthly:11000,  taxCat:'課税10%', endYm:'2025-09' },
];
eq('終了月の月までは入力できる', ctx.costItemActive(_db.costItems[3],'2025-09'), true);
eq('終了月を過ぎたら入力できない', ctx.costItemActive(_db.costItems[3],'2025-10'), false);
ctx.setCostCell('CI1','2025-10',231000);
eq('マスを打つと expenses が1行できる', _db.expenses.filter(e=>e.costItemId==='CI1').length, 1);
eq('マスの値（税込）', ctx.costCellAmount('CI1','2025-10'), 231000);
eq('税抜は予実と同じ式', ctx.netOfGross(231000,'課税10%'), 210000);
eq('10月の販管費（税抜）に入る', ctx.actualSeries(2025,'sga')[2], 210000);
eq('表の行は費目マスタの数', ctx.costRowsOf(2025).rows.length, 4);
eq('定期が先・変動が後に並ぶ', ctx.costRowsOf(2025).rows.map(r=>r.it.id), ['CI1','CI2','CI4','CI3']);
eq('期間外のマスは null（旧リースの10月）', ctx.costRowsOf(2025).rows[2].cells[2], null);
eq('費目なしの経費は別行にまとまる', ctx.costOtherByMonth(2025).n, 2);
ctx.setCostCell('CI1','2025-10',0);
eq('0にするとマスごと消える', ctx.costCellAmount('CI1','2025-10'), 0);
eq('消したら予実からも消える', ctx.actualSeries(2025,'sga')[2], 0);

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
eq('月次費用表は支払請求から読む（税込）', ctx.costBillCell('CI5','2025-11').gross, 110000);
eq('同じ月に二度は作らない', ctx.apPlanFor('2025-11').filter(p=>p.items.length).length, 0);

/* 二重計上しないこと: 買掛の費目は経費（expenses）を作らない */
const exBefore = _db.expenses.length;
ctx.setCostCell('CI5','2025-11', 99000);
eq('買掛の費目に経費は作られない', _db.expenses.length, exBefore);
eq('買掛の月は費用表でも支払請求の額のまま', ctx.costRowsOf(2025).rows.find(r=>r.it.id==='CI5').cells[3], 110000);

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
eq('85日かかっても期日内（会社ごとの期日で判定）', ctx.ledLate('ar', _db.invoices[2]).days, 0);
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

['guideAr','guideAp','guideYj','guideMs','guidePromise'].forEach(fn=>{
  try{ const h=ctx[fn](); const ok=typeof h==='string'&&h.length>200;
    console.log((ok?'  ok  ':'  NG  ')+fn+'  →  '+(ok?h.length+' 文字':'空')); ok?pass++:fail++;
  }catch(e){ console.log('  NG  '+fn+'  →  '+e.message); fail++; }
});

console.log('\n― 画面が落ちずに描けるか ―');
['viewDashboard','viewYojitsu','viewCompare','viewMikomi','viewInvoices','viewReceipts','viewAging',
 'viewBills','viewPayouts','viewCashflow','viewOkr','viewCompanies','viewWorkers','viewExpenses',
 'viewCrmLink','viewUsers','viewAudit','viewSettings','viewApAging'].forEach(fn => {
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

console.log(`\n結果: ${pass} 件成功 / ${fail} 件失敗\n`);
process.exit(fail ? 1 : 0);
