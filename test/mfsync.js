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
  settings: { mfImportFrom: '2020-01' },   // 日付に左右されないように（前の期の規則は 専用のテストで見る）
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
  /* ★ 2026-09-18: 新しいデータを優先。確定済みでも MF で直したら 上書きし、前後を mfChanges に残す */
  let st = baseState();
  st = S.applyBillings(st, [bill({ updatedAt: '2026-09-01T10:00:00+09:00' })]).state;
  st.invoices[0].confirmStatus = '確定';
  const r = S.applyBillings(st, [bill({ total: 132000, subtotal: 120000, updatedAt: '2026-09-10T10:00:00+09:00' })]);
  const iv = r.state.invoices[0];
  eq('MF の方が新しければ 確定済みでも上書き', [iv.total, iv.confirmStatus, r.stats['更新']], [132000, '確定', 1]);
  eq('変わった項目の前後を残し「MFで変更」にする', [iv.mfChanges[0].fields.total, iv.mfChangeSeen], [{ before: 110000, after: 132000 }, false]);
  const again = S.applyBillings(r.state, [bill({ total: 132000, subtotal: 120000, updatedAt: '2026-09-10T10:00:00+09:00' })]);
  eq('変わっていなければ触らない（何度押しても同じ）', [again.stats['更新'], again.stats['変更なし'], again.state.invoices[0].mfChanges.length], [0, 1, 1]);
  const old = S.applyBillings(r.state, [bill({ total: 99000, subtotal: 90000, updatedAt: '2026-09-05T10:00:00+09:00' })]);
  eq('MF の古いデータでは 新しいデータを上書きしない', [old.state.invoices[0].total, old.stats['古いデータで見送り']], [132000, 1]);
  const csv = S.applyBillings(r.state, [bill({ total: 99000, subtotal: 90000, updatedAt: '' })]);
  eq('時刻の無い CSV で API の分を上書きしない', csv.state.invoices[0].total, 132000);
  /* 金額が下がって 充てた入金の方が多くなったら 知らせる */
  const paidSt = JSON.parse(JSON.stringify(r.state));
  paidSt.payments = [{ id: 'P1', date: '2026-09-30', amount: 132000, allocations: [{ invoiceId: iv.id, amount: 132000 }] }];
  const down = S.applyBillings(paidSt, [bill({ total: 110000, subtotal: 100000, updatedAt: '2026-09-12T10:00:00+09:00' })]);
  eq('下がって入金の方が多い → 警告', [down.state.invoices[0].mfChangeWarn !== '', down.stats['入金が請求額を超過']], [true, 1]);
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
  /* ★ 2026-09-18: 何も似ていない取引先は 得意先 を自動で作る（以前は取り込まず 一覧に出すだけ → 回収 に出てこなかった） */
  const r = S.applyBillings(st, [bill({ mfId: 'x1', partnerId: 'p9', partnerName: '知らない会社' })]);
  const nc = r.state.companies.find(c => c.mfPartnerId === 'p9');
  eq('似ていない取引先は 得意先を自動で作り、請求は回収に入る',
    [r.state.invoices.length, nc && nc.name, nc && nc.kind, nc && nc.source, nc && nc.needsReview, r.state.invoices[0].companyId === (nc && nc.id), r.stats['取引先を自動作成']],
    [1, '知らない会社', '得意先', 'mf', true, true, 1]);
  const r1b = S.applyBillings(r.state, [bill({ mfId: 'x1', partnerId: 'p9', partnerName: '知らない会社' }), bill({ mfId: 'x2', partnerId: 'p9', partnerName: '知らない会社' })]);
  eq('2回目は 作った会社に ID で当たる（会社は増えない・請求は冪等）', [r1b.state.companies.length, r1b.state.invoices.length, r1b.stats['取引先を自動作成']], [4, 2, 0]);
  eq('autoCreate:false なら 待ち行列へ', S.applyBillings(st, [bill({ mfId: 'x1', partnerId: 'p9', partnerName: '知らない会社' })], { autoCreate: false }).state.mfPartnerQueue.length, 1);
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

console.log('\n― 取引先の自動作成・待ち行列・統合（2026-09-18）―');
{
  const st = baseState();
  /* 似ている（名前が含み合う）→ 作らない。待ち行列 */
  const r = S.applyBillings(st, [bill({ mfId: 'q1', partnerId: 'p20', partnerName: '株式会社高山建設' })]);
  eq('似た会社（高山 ⊂ 高山建設）があれば 作らず 待ち行列', [r.state.companies.length, r.state.invoices.length, (r.state.mfPartnerQueue || []).length, r.state.mfPartnerQueue[0].candidates], [3, 0, 1, ['C1']]);
  eq('待ち行列は 冪等（同じものを流しても1件）', S.applyBillings(r.state, [bill({ mfId: 'q1', partnerId: 'p20', partnerName: '株式会社高山建設' })]).state.mfPartnerQueue.length, 1);
  const q = r.state.mfPartnerQueue[0];
  const m = S.resolvePartnerQueue(r.state, q.id, 'map', 'C1', 'me');
  const c1 = m.state.companies.find(c => c.id === 'C1');
  eq('統合（既存に結びつける）→ 請求が入り、ID を追加で覚え、行列から消える',
    [m.state.invoices.length, m.state.invoices[0].companyId, c1.mfPartnerId, c1.mfPartnerIds, m.state.mfPartnerQueue.length], [1, 'C1', 'p1', ['p20'], 0]);
  const again = S.applyBillings(m.state, [bill({ mfId: 'q2', partnerId: 'p20', partnerName: '株式会社高山建設' }), bill({ mfId: 'q3' })]);
  eq('次からは どちらの ID でも C1 に当たる', again.state.invoices.map(i => i.companyId), ['C1', 'C1', 'C1']);
  const n = S.resolvePartnerQueue(r.state, q.id, 'new', '', 'me');
  eq('新規 → 得意先を作って 請求を入れる（確認済み扱い）', [n.state.companies.length, n.state.companies[3].needsReview, n.state.invoices[0].companyId === n.state.companies[3].id], [4, false, true]);
  const sk = S.resolvePartnerQueue(r.state, q.id, 'skip', '', 'me');
  const sk2 = S.applyBillings(sk.state, [bill({ mfId: 'q1', partnerId: 'p20', partnerName: '株式会社高山建設' })]);
  eq('取り込まない → 次の同期でも入れない・会社も作らない', [sk2.state.invoices.length, sk2.state.companies.length, sk2.state.mfPartnerQueue[0].status], [0, 3, 'skipped']);
}
{
  /* 名前で当たったら MF の ID を覚える */
  const st = baseState();
  const r = S.applyBillings(st, [bill({ mfId: 'n1', partnerId: 'p30', partnerName: 'テスト物流株式会社' })]);
  eq('名前で当たった会社に MF の取引先ID を覚える', r.state.companies.find(c => c.id === 'C2').mfPartnerId, 'p30');
  /* 同じ名前でも、別の MF 取引先ID を持つ会社には当てない */
  const r2 = S.applyBillings(r.state, [bill({ mfId: 'n2', partnerId: 'p31', partnerName: 'テスト物流株式会社' })]);
  eq('同名でも 別の MF 取引先ID の会社には当てない → 待ち行列', [r2.state.invoices.length, (r2.state.mfPartnerQueue || []).length], [1, 1]);
}
{
  /* 統合: 自動で作った会社 → 既存の会社 */
  let st = baseState();
  st = S.applyBillings(st, [bill({ mfId: 'z1', partnerId: 'p40', partnerName: 'まったく別の商会' })]).state;
  const auto = st.companies.find(c => c.mfPartnerId === 'p40');
  st.payments = [{ id: 'P1', companyId: auto.id, date: '2026-09-30', amount: 110000, allocations: [] }];
  st.billingRules = [{ id: 'R9', companyId: auto.id, kind: 'fixed', unitPrice: 1 }];
  const m = S.mergeCompanies(st, auto.id, 'C2', 'me');
  const c2 = m.state.companies.find(c => c.id === 'C2');
  eq('統合で 請求・入金・請求ルール が付け替わり、自動の会社は消える',
    [m.state.companies.length, m.state.invoices[0].companyId, m.state.payments[0].companyId, m.state.billingRules[0].companyId, c2.mfPartnerId, c2.mfAliases],
    [3, 'C2', 'C2', 'C2', 'p40', ['まったく別の商会']]);
  eq('統合のあと MF の取り込みは C2 に当たる', S.applyBillings(m.state, [bill({ mfId: 'z2', partnerId: 'p40', partnerName: 'まったく別の商会' })]).state.invoices.every(i => i.companyId === 'C2'), true);
  const crm = baseState(); crm.companies[1] = { ...crm.companies[1], source: 'crm', crmId: 'X' };
  let thrown = ''; try { S.mergeCompanies(crm, 'C2', 'C1', 'me') } catch (e) { thrown = e.message }
  eq('CRM の会社は 統合で消せない', thrown.includes('CRM'), true);
  const ok = S.markCompanyReviewed(st, auto.id, 'me');
  eq('このままでよい → needsReview が消える', ok.state.companies.find(c => c.id === auto.id).needsReview, false);
}
{
  /* 二重の疑い: 手で作った請求 と MF の請求 */
  const st = baseState();
  st.invoices = [{ id: 'I-man', companyId: 'C1', bookMonth: '2026-08', total: 110000, status: '確定' }];
  st.payments = [{ id: 'P1', companyId: 'C1', date: '2026-09-30', amount: 110000, allocations: [{ invoiceId: 'I-man', amount: 110000 }] }];
  const r = S.applyBillings(st, [bill({})]);
  const mf = r.state.invoices.find(i => i.mfId);
  eq('二重の疑い は請求に dupOf で残る', [mf.dupOf, r.stats['二重の疑い']], [['I-man'], 1]);
  const rep = S.resolveDuplicate(r.state, mf.id, 'replace', 'me');
  eq('置き換える → 手の請求は取消、入金は MF の請求へ',
    [rep.state.invoices.find(i => i.id === 'I-man').status, rep.state.payments[0].allocations[0].invoiceId === mf.id, rep.state.invoices.find(i => i.id === mf.id).dupOf], ['取消', true, undefined]);
  const sep = S.resolveDuplicate(r.state, mf.id, 'separate', 'me');
  eq('別物 → 両方残る', [sep.state.invoices.filter(i => i.status !== '取消').length, sep.state.invoices.find(i => i.id === mf.id).dupChecked], [2, 'separate']);
}

console.log('\n― MF の取引先の行き先（なぜ 取引先 に無いか）―');
{
  const st = baseState();
  const items = [bill({}), bill({ mfId: 'r2', partnerId: 'p50', partnerName: '株式会社奥田スチール' }),
    bill({ mfId: 'r3', partnerId: 'p51', partnerName: '高山建設' }), bill({ mfId: 'r4', partnerId: 'p52', partnerName: '島田業務', mfStatus: '下書き' })];
  const r = S.applyBillings(st, items);
  const rep = S.partnerReport(r.state, items);
  const by = n => rep.find(x => x.partnerName.includes(n)) || {};
  eq('当たった／自動で作った／似ていて待ち／下書きだけ が分かる',
    [by('高山').result, by('奥田').result, by('高山建設').result, by('島田').result], ['matched', 'created', 'queued', 'draft']);
}

console.log('\n― 前の期は 絶対に入れない・CSV と API の同じ請求・片づけ（2026-09-19）―');
{
  const st = baseState(); st.settings.mfImportFrom = '2026-08';
  const items = [bill({ mfId: 'o1', salesDate: '2026-07-31', billingDate: '2026-07-31' }),
    bill({ mfId: 'o2', partnerId: 'p70', partnerName: '前の期だけの会社', salesDate: '2026-06-30', billingDate: '2026-06-30' }),
    bill({ mfId: 'n1' })];
  const r = S.applyBillings(st, items);
  eq('前の期の請求は入らない（今の期の分だけ）', [r.state.invoices.map(i => i.mfId), r.stats['前の期で見送り']], [['n1'], 2]);
  eq('前の期にしか請求の無い会社は 作らない', r.state.companies.some(c => c.name === '前の期だけの会社'), false);
  eq('行き先には「前の期だけ」と出る', S.partnerReport(r.state, items).find(x => x.partnerName === '前の期だけの会社').result, 'old');
  const tx = S.applyTransactions(st, [{ extId: 't1', date: '2026-07-31', amount: 1000, payerName: 'x' }, { extId: 't2', date: '2026-08-01', amount: 1000, payerName: 'y' }]);
  eq('前の期の入金も入らない', [tx.stats['新規'], tx.stats['前の期で見送り']], [1, 1]);
  eq('既定は 今日の期の8月から', /^\d{4}-08$/.test(S.importFromYm({})), true);
}
{
  /* CSV で入れた請求を API が持ってきた → 2つにしない */
  const st = baseState(); st.settings.mfImportFrom = '2026-08';
  const c = S.applyBillings(st, S.parseBillingCsv('取引先名,請求日,合計金額,請求書番号\n株式会社高山,2026/08/31,110000,B-1\n').items).state;
  eq('CSV で1件', [c.invoices.length, /^csv/.test(c.invoices[0].mfId)], [1, true]);
  const r = S.applyBillings(c, [bill({})]);
  eq('API の同じ請求は 新しく作らず 同じ行に MF の id を付ける', [r.state.invoices.length, r.state.invoices[0].mfId, r.stats['CSVの請求と同じ']], [1, 'm1', 1]);
  eq('そのあと何度同期しても 1件', S.applyBillings(r.state, [bill({})]).state.invoices.length, 1);
}
{
  /* 片づけ: 前の期に入ってしまった MF の請求・自動の会社 */
  const st = baseState(); st.settings.mfImportFrom = '2026-08';
  st.companies.push({ id: 'CO-x', name: '自動の会社', source: 'mf', needsReview: true });
  const mk = (id, co, ym, created, src) => ({ id, companyId: co, bookMonth: ym, total: 1000, status: '確定', source: src || 'mf', mfId: 'mf-' + id, createdAt: created });
  st.invoices = [mk('A', 'CO-x', '2026-05', '2026-09-18T21:00:00Z'), mk('B', 'C1', '2026-06', '2026-09-18T21:00:00Z'),
    mk('C', 'C1', '2026-06', '2026-09-18T21:00:00Z'), mk('D', 'C1', '2026-06', '2026-09-01T00:00:00Z'), mk('E', 'C1', '2026-08', '2026-09-18T21:00:00Z'),
    { ...mk('F', 'C1', '2026-06', '2026-09-18T21:00:00Z', 'manual'), mfId: '' }];
  st.payments = [{ id: 'P', companyId: 'C1', date: '2026-07-01', amount: 1000, allocations: [{ invoiceId: 'C', amount: 1000 }] }];
  const r = S.cleanupBeforeImport(st, { since: '2026-09-18' });
  eq('消すのは 前の期・MF・その日以降・入金なし だけ（手入力・今の期・前から有るもの・入金済みは残す）',
    [r.state.invoices.map(i => i.id), r.stats['入金が充ててあり残す'], r.stats['取引先を消す'], r.state.companies.some(c => c.id === 'CO-x')], [['C', 'D', 'E', 'F'], 1, 1, false]);
}

console.log('\n― 入金の二重取り込み（指紋）―');
{
  const st = baseState();
  st.payments = [{ id: 'P1', date: '2026-09-10', amount: 55000, payerName: 'ﾀｶﾔﾏ(ｶ', extId: 'mf-1', companyId: 'C1', allocations: [] }];
  const csv = '日付,摘要,入金金額\n2026/09/10,ﾀｶﾔﾏ(ｶ,55000\n2026/09/10,ﾃｽﾄﾌﾞﾂﾘｭｳ,33000\n';
  const t = S.parseBankCsv(csv).items;
  const r = S.applyTransactions(st, t);
  eq('MF で入った入金は ID の無い CSV からは入らない', [r.stats['新規'], r.stats['同じ入金が別の道で入り済み']], [1, 1]);
  const t2 = S.parseBankCsv('日付,摘要,入金金額\n2026/09/11,ﾀｶﾔﾏ(ｶ,10000\n2026/09/11,ﾀｶﾔﾏ(ｶ,10000\n').items;
  eq('同じファイルの 二重振込（同じ日・名義・金額）は 2件とも入る', [t2.length, t2[1].extId.endsWith('#2'), S.applyTransactions(st, t2).stats['新規']], [2, true, 2]);
  const r2 = S.applyTransactions(S.applyTransactions(st, t2).state, t2);
  eq('同じ CSV をもう一度 → 0件', r2.stats['新規'], 0);
  const man = baseState();
  man.payments = [{ id: 'PM', date: '2026-09-12', amount: 77000, companyId: 'C3', allocations: [] }];
  const t3 = S.parseBankCsv('日付,摘要,入金金額\n2026/09/12,ｻﾝﾌﾟﾙｾｲｷ(ｶ,77000\n').items;
  eq('手で入れた入金（名義なし）と 同じ日・金額・取引先なら入らない', S.applyTransactions(man, t3).stats['新規'], 0);
  const mfTwo = baseState();
  mfTwo.payments = [{ id: 'P1', date: '2026-09-10', amount: 5000, payerName: 'ﾀｶﾔﾏ(ｶ', extId: 'mf-1', allocations: [] }];
  const api = [{ extId: 'mf-1', date: '2026-09-10', amount: 5000, payerName: 'ﾀｶﾔﾏ(ｶ' }, { extId: 'mf-2', date: '2026-09-10', amount: 5000, payerName: 'ﾀｶﾔﾏ(ｶ' }];
  eq('API の二重振込の2件目は 指紋に食われない', S.applyTransactions(mfTwo, api).stats['新規'], 1);
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
