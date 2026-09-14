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
code += '\n;globalThis.__x={ ENTITIES, DEFAULT_ACCOUNTS, isApCost, PAY_MODES, LED_LATE_WARN, SECTIONS, PAGE_GUIDE, PROPERTY_KINDS, get CUR_FY(){return CUR_FY}, get CURRENT_PAGE(){return CURRENT_PAGE}, ATT_PAGE, canCreate, canEdit, canDelete, mailCtx:()=>MAIL_CTX, moneyPlain, mailFill, DB:()=>DB, setAttCounts:v=>{ATT_COUNTS=v},\n  accountRoots, accountChildren, accountByCode, accountById, accountIsLeaf, accountPathLabel, accountCodesUnder, accountKindOf, accTreeReady, setDB:v=>{DB=v}, setFY:v=>{CUR_FY=v}, setSession:v=>{SESSION=v} };';

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
  ['users','audit','apilink','crmlink','invoices','expenses','ledger'].forEach(pg=>{
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

  await ctx.demoSeed();
  const n = ctx.demoCount();
  eq('デモが入った（件数）', n>300, true);
  eq('取引先は9社', _db.companies.filter(c=>c.demo).length, 9);
  eq('特定技能者は作らない', _db.workers.filter(w=>w.demo).length, 0);
  eq('物件は4件', _db.properties.filter(p=>p.demo).length, 4);
  eq('14か月 × 3社 の請求', _db.invoices.filter(i=>i.demo).length, 42);
  eq('全部に【デモ】の印', _db.companies.filter(c=>c.demo).every(c=>c.name.startsWith('【デモ】')), true);

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
    /* 会社名を押す（どの画面からでも）→ 取引先別の詳細で開く */
    ctx.openLedger(kita2.id,'ar');
    eq('会社名から 取引先別 の詳細へ', ctx.__x.CURRENT_PAGE, 'arco');
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
    eq('回収のテンプレは6つ（督促1〜3を含む）', ctx.mailTemplates('ar').length, 6);
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

  /* ── 分類別集計: いちばん大事なのは「予実と1円も違わない」こと ── */
  console.log('\n― 分類別集計（デモの量で） ―');
  [2025, 2026].forEach(fy=>{
    ['revenue','cogs','sga','nonop'].forEach(kind=>{
      const a=Array(12).fill(0);
      ctx.moneyLines(fy).filter(l=>l.kind===kind).forEach(l=>{ a[l.i]+=l.amount; });
      eq(`分類別の合計＝予実（${fy}/${kind}）`, a, ctx.actualSeries(fy,kind));
    });
  });
  /* 建物ごとに分かれているか（A棟の電気・水道・ガス・家賃） */
  const aTou=_db.properties.find(p=>p.name.includes('A棟'));
  const aLines=ctx.moneyLines(2025).filter(l=>String(l.propertyId)===String(aTou.id));
  eq('A棟に費用が紐づく', aLines.length>0, true);
  eq('A棟には複数の科目がある（家賃・電気・水道・ガス）', new Set(aLines.map(l=>l.code)).size>=3, true);
  eq('デモは 地代家賃 の下に建物別の小分類を作る', !!ctx.__x.accountByCode('6201'), true);
  eq('水道光熱費 の下は 電気・水道・ガス', ctx.__x.accountChildren(ctx.__x.accountByCode('6210').id).length, 3);
  eq('電気代の道筋', ctx.__x.accountPathLabel('6211').includes('水道光熱費'), true);
  eq('小分類でも区分は受け継ぐ', ctx.accountKind('6211'), 'sga');
  eq('建物なしの行もちゃんと残る', ctx.moneyLines(2025).some(l=>!l.propertyId), true);
  ['account','property'].forEach(ax=>{
    try{ ctx.setKbAxis(ax); const h=ctx.viewKbunrui(); const ok=h.length>1000;
      console.log((ok?'  ok  ':'  NG  ')+`viewKbunrui(${ax}）  →  `+h.length+' 文字'); ok?pass++:fail++;
    }catch(e){ console.log(`  NG  viewKbunrui(${ax}） → `+e.message); fail++; }
  });

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
