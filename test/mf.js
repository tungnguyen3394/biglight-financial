/* ============================================================================
   Money Forward 請求書 API（読むだけの口）のテスト — 本物の MF には繋ぎません
   実行:  node test/mf.js
   ・トークンの取得／期限切れ前の refresh／ページをたどる／金額と日付の形
   ・未設定なら動かない／取り込みは管理者・マネージャーだけ／state は 1回きり
   ========================================================================== */
const path = require('path'), fs = require('fs'), http = require('http');
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
const MF = loadTs(ROOT + '/backend/src/mfinvoice.ts');
const express = require(require.resolve('express', { paths: [path.join(ROOT, 'backend', 'node_modules')] }));

let pass = 0, fail = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b);
  ok ? pass++ : fail++; console.log((ok ? '  ok  ' : '  NG  ') + name + (ok ? '' : `  → ${JSON.stringify(a)} (期待 ${JSON.stringify(b)})`)); };

const ENV = { MF_CLIENT_ID: 'cid', MF_CLIENT_SECRET: 'sec', MF_PUBLIC_URL: 'https://finance.example.jp' };
function makeDeps(opts = {}) {
  const store = {}; const calls = [];
  let now = opts.now || 1_000_000;
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const u = new URL(String(url));
    if (u.href.startsWith(MF.MF_TOKEN_URL)) {
      const body = new URLSearchParams(init.body);
      if (body.get('grant_type') === 'authorization_code' && body.get('code') !== 'good')
        return { ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) };
      const n = calls.filter(c => c.url.startsWith(MF.MF_TOKEN_URL)).length;
      return { ok: true, status: 200, json: async () => ({ access_token: 'AT' + n, refresh_token: 'RT' + n, expires_in: 3600 }) };
    }
    if (u.pathname.endsWith('/billings')) {
      const page = Number(u.searchParams.get('page'));
      const mk = i => ({ id: 'b' + i, billing_number: 'N-' + i, partner_id: 'p1', partner_name: '株式会社テスト', title: 't',
        billing_date: '2026-08-31', sales_date: '2026-08-31', due_date: '2026-09-30',
        subtotal_price: '100000.0', excise_price: '10000.0', total_price: '110000.0', updated_at: '2026-09-01T00:00:00+09:00' });
      return { ok: true, status: 200, json: async () => ({ data: page === 1 ? [mk(1), mk(2)] : [mk(3)], pagination: { total_count: 3, total_pages: 2, per_page: 2, current_page: page } }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { store, calls, setNow: v => { now = v }, deps: {
    fetch, env: opts.env || ENV, now: () => now,
    cfgGet: async k => store[k] ?? null, cfgSet: async (k, v) => { store[k] = v },
  } };
}

(async () => {
  console.log('\n― 設定 ―');
  eq('未設定なら configured=false', MF.mfConfigured({}), false);
  eq('ID と シークレットがあれば configured', MF.mfConfigured(ENV), true);
  eq('戻り先は /api/mf/callback', MF.mfConfig(ENV).redirectUri, 'https://finance.example.jp/api/mf/callback');
  const au = new URL(MF.authorizeUrl('st123', ENV));
  eq('認可URL（MF 公開仕様）', au.origin + au.pathname, 'https://api.biz.moneyforward.com/authorize');
  eq('スコープは読み取りだけ', au.searchParams.get('scope'), 'mfc/invoice/data.read');
  eq('state を付ける', au.searchParams.get('state'), 'st123');

  console.log('\n― トークン ―');
  { const t = makeDeps();
    await MF.exchangeCode('good', 'admin@biglight.jp', t.deps);
    const tok = JSON.parse(t.store.mf_token);
    eq('認可コード → トークン保存', [tok.access_token, tok.refresh_token, tok.connected_by], ['AT1', 'RT1', 'admin@biglight.jp']);
    eq('クライアント認証は Basic（既定）', String(t.calls[0].init.headers.authorization).startsWith('Basic '), true);
    eq('期限内はそのまま使う', await MF.accessToken(t.deps), 'AT1');
    t.setNow(1_000_000 + 3600_000 - 30_000);
    eq('切れる1分前なら refresh する', await MF.accessToken(t.deps), 'AT2');
    eq('refresh は refresh_token で', new URLSearchParams(t.calls[1].init.body).get('refresh_token'), 'RT1');
    let msg = ''; try { await MF.exchangeCode('bad', 'x', makeDeps().deps) } catch (e) { msg = e.message }
    eq('失敗したら分かる言葉で止まる', msg.includes('トークン取得に失敗'), true);
    let msg2 = ''; try { await MF.accessToken(makeDeps().deps) } catch (e) { msg2 = e.message }
    eq('未接続なら「接続されていません」', msg2.includes('接続されていません'), true);
    const p = makeDeps({ env: { ...ENV, MF_TOKEN_AUTH: 'post' } });
    await MF.exchangeCode('good', 'a', p.deps);
    eq('MF_TOKEN_AUTH=post なら本文で送る', new URLSearchParams(p.calls[0].init.body).get('client_secret'), 'sec');
  }

  console.log('\n― 請求書の一覧 ―');
  { const t = makeDeps();
    await MF.exchangeCode('good', 'a', t.deps);
    const items = await MF.fetchBillings('2026-08-01', '2026-09-14', t.deps);
    eq('ページをたどって全部取る', items.map(x => x.mfId), ['b1', 'b2', 'b3']);
    const q = new URL(t.calls.find(c => c.url.includes('/billings')).url).searchParams;
    eq('期間は請求日・100件ずつ', [q.get('range_key'), q.get('from'), q.get('to'), q.get('per_page')], ['billing_date', '2026-08-01', '2026-09-14', '100']);
    eq('Bearer で呼ぶ', t.calls.find(c => c.url.includes('/billings')).init.headers.authorization, 'Bearer AT1');
    eq('金額は数値・日付は YYYY-MM-DD', [items[0].total, items[0].subtotal, items[0].tax, items[0].billingDate, items[0].dueDate, items[0].partnerName],
      [110000, 100000, 10000, '2026-08-31', '2026-09-30', '株式会社テスト']);
  }

  console.log('\n― 画面からの口（権限） ―');
  { const t = makeDeps();
    const who = { current: { email: 'staff@biglight.jp', role: 'Staff' } };
    const app = express(); app.use(express.json());
    app.use(MF.mfRouter({ ...t.deps, verify: async () => who.current }));
    const srv = await new Promise(r => { const s = app.listen(0, () => r(s)) });
    const base = `http://127.0.0.1:${srv.address().port}`;
    const call = async (m, u, body) => { const r = await fetch(base + u, { method: m, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' }); return { status: r.status, loc: r.headers.get('location'), j: await r.json().catch(() => ({})) } };

    eq('状態は誰でも見られる（秘密は返さない）', (await call('GET', '/mf/status')).j, { configured: true, connected: false, connectedBy: '', connectedAt: '', redirectUri: 'https://finance.example.jp/api/mf/callback' });
    eq('スタッフは接続できない', (await call('POST', '/mf/connect')).status, 403);
    eq('スタッフは取り込めない', (await call('POST', '/mf/billings', { from: '2026-08-01', to: '2026-09-01' })).status, 403);
    who.current = { email: 'boss@biglight.jp', role: 'Admin' };
    const c = await call('POST', '/mf/connect');
    const st = new URL(c.j.url).searchParams.get('state');
    eq('管理者は接続URLをもらう', !!st, true);
    eq('state が違えば接続しない', (await call('GET', '/mf/callback?code=good&state=wrong')).loc.includes('mf=error'), true);
    eq('state は1回きり（違う state で使い切ったあとは本物でも通らない）', (await call('GET', `/mf/callback?code=good&state=${st}`)).loc.includes('mf=error'), true);
    const c2 = await call('POST', '/mf/connect'); const st2 = new URL(c2.j.url).searchParams.get('state');
    const ok = await call('GET', `/mf/callback?code=good&state=${st2}`);
    eq('正しい state なら接続して 売掛金 に戻る', ok.loc, 'https://finance.example.jp/?mf=connected#arbook');
    eq('接続したら connected', (await call('GET', '/mf/status')).j.connected, true);
    eq('期間がおかしければ 400', (await call('POST', '/mf/billings', { from: '2026-09-01', to: '2026-08-01' })).status, 400);
    const b = await call('POST', '/mf/billings', { from: '2026-08-01', to: '2026-09-14' });
    eq('管理者は一覧を取れる（DBには書かない）', [b.status, b.j.count, Object.keys(t.store).sort()], [200, 3, ['mf_oauth_state', 'mf_token']]);
    who.current = { email: 'mgr@biglight.jp', role: 'Manager' };
    eq('マネージャーも取れる', (await call('POST', '/mf/billings', { from: '2026-08-01', to: '2026-09-14' })).status, 200);
    eq('マネージャーは切断できない', (await call('POST', '/mf/disconnect')).status, 403);
    srv.close();
  }
  { const t = makeDeps({ env: {} });
    const app = express(); app.use(express.json());
    app.use(MF.mfRouter({ ...t.deps, verify: async () => ({ email: 'a', role: 'Admin' }) }));
    const srv = await new Promise(r => { const s = app.listen(0, () => r(s)) });
    const r = await fetch(`http://127.0.0.1:${srv.address().port}/mf/connect`, { method: 'POST' });
    eq('未設定のまま接続しようとすると 503', r.status, 503);
    srv.close();
  }

  console.log(`\n結果: ${pass} 件成功 / ${fail} 件失敗`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('  NG  ' + e.stack); process.exit(1); });
