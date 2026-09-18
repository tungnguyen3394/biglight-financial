/* ============================================================================
   chup.mjs — bản tiếng Việt: chụp màn hình nào, bấm gì trước, khung cam ở đâu
   ----------------------------------------------------------------------------
   Mỗi ảnh:
     page    màn hình mở trước (id trong menu, vd 'arbook')
     run     việc làm thêm trước khi chụp (mở hộp thoại, bấm nút…)
     clip    chỉ chụp một vùng (CSS selector), vd hộp thoại '#modal'
     height  chiều cao cửa sổ (mặc định 900)
     marks   tên khung → selector (Playwright: CSS, có thể dùng :has-text("…"))
             tên này dùng ở noidung.mjs › mark: '…'
   Dữ liệu: デモデータ của app (năm tài chính 2025 = 2025/8〜2026/7, đủ 12 tháng).
   ============================================================================ */
const ev = src => async page => { await page.evaluate(src); await page.waitForTimeout(500) }
const nav = label => `#navList button:has-text("${label}")`
const tab = label => `.sectabs button:has-text("${label}")`
const tool = label => `.toolbar-left :is(button,summary):has-text("${label}")`
/* 取引先の確認 の見本: MF から自動で作った会社 1社 ＋ 似た会社があって止めている取引先 1件（何度呼んでも同じ） */
const seedReview = async page => { await page.evaluate(() => {
  if (!DB.companies.some(c => c.id === 'CO-mfdemo')) {
    DB.companies.push({ id: 'CO-mfdemo', name: '【デモ】株式会社ひかり物産', kind: '得意先', source: 'mf', needsReview: true, autoCreatedAt: '2026-09-18T06:00:00Z', mfPartnerId: 'p77', closingDay: 31, paySite: 1, payDay: 31, taxCat: '課税10%' })
    DB.invoices.push({ id: 'INV-mfdemo', companyId: 'CO-mfdemo', bookMonth: '2026-07', issueDate: '2026-07-31', dueDate: '2026-08-31', total: 165000, subtotal: 150000, taxCat: '課税10%', status: '確定', source: 'mf', mfId: 'mf-demo-1', confirmStatus: '確定', items: [] })
  }
  const base = DB.companies.find(c => c.name.includes('東和フーズ'))
  DB.mfPartnerQueue = [{ id: 'MPQ-demo', key: 'id:p88', partnerId: 'p88', partnerName: '東和フーズ販売 株式会社', n: 2, total: 330000, candidates: base ? [base.id] : [], items: [], status: 'open' }]
  renderPage(CURRENT_PAGE)
}); await page.waitForTimeout(400) }

export default {
  fy: 2025,
  shots: {
    /* ── 1. Bắt đầu ── */
    home: {
      page: 'dashboard',
      marks: {
        menu: '#navList', fy: '.fy-bar', cmp: '#cmpBtn', guide: 'button[aria-label="入力ガイド"]', bell: '#notif > .icon-btn',
        search: '.topsearch', avatar: '#avatarBox', tax: '.toolbar-left .seg', theme: '#themeToggle', burger: '#menuBtn',
      },
    },
    bell: {
      page: 'dashboard', run: ev(`toggleNotif()`), clip: ['#notif > .icon-btn', '#notifMenu'], clipPad: 16,
      marks: { menu: '#notifMenu', items: '#notifMenu .nm-item >> nth=0', att: '#notifMenu .nm-item:has-text("証憑")' },
    },
    search: {
      page: 'dashboard',
      run: async p => { await p.fill('#quickSearch', 'さくら'); await p.evaluate(() => globalSearch('さくら')); await p.waitForTimeout(300) },
      clip: ['.topsearch', '#searchResults'], clipPad: 16,
      marks: { box: '.topsearch input', list: '#searchResults' },
    },
    guide: {
      page: 'yojitsu', run: ev(`openGuide('sec-yj')`), clip: '#modal',
      marks: { tabs: '#modal .sectabs', diagram: '#modal svg >> nth=0', table: '#modal .gtbl' },
    },

    /* ── 期 ── */
    period_cmp: {
      page: 'yojitsu', height: 760,
      run: async p => { await p.evaluate(() => { CMP_ON = true; paintPeriodBar(); renderPage('yojitsu') }); await p.waitForTimeout(400) },
      marks: { bar: '.fy-bar', cmp: '#cmpBtn', cell: '#main table tbody tr >> nth=0 >> td >> nth=1', tot: '#main table tbody tr >> nth=0 >> td >> nth=13' },
    },
    period_guard: {
      page: 'arbook',
      run: async p => { await p.evaluate(() => { CMP_ON = false; paintPeriodBar(); openPayment(); PAY_CTX.companyId = DB.companies.find(c => c.kind === '得意先').id; PAY_CTX.amount = 1000; PAY_CTX.date = (CUR_FY + 1) + '-09-10'; paySave() }); await p.waitForTimeout(500) },
      clip: '#modal2',
      marks: { msg: '#modal2 .alertbar', go: '#modal2 button:has-text("切り替える")' },
    },
    period_close: {
      page: 'settings', height: 1000,
      run: async p => { await p.evaluate(() => { window.confirm = () => true; periodClose(CUR_FY - 1, true); goto('settings'); [...document.querySelectorAll('.panel')].find(x => x.innerText.includes('会計期間')).scrollIntoView() }); await p.waitForTimeout(500) },
      clip: '.panel:has-text("会計期間（期）")',
      marks: { first: '.panel:has-text("会計期間（期）") button:has-text("第1期を変える")', closed: '.panel:has-text("会計期間（期）") tr:has-text("締め済み")', btn: '.panel:has-text("会計期間（期）") button:has-text("を締める") >> nth=0' },
    },
    /* ── 2. Dashboard ── */
    dash: {
      page: 'dashboard', height: 1180,
      marks: { range: '.drange-bar', presets: '.drange-pre', kpi: '.drange + *', staff: '.dash-section.c-teal' },
    },

    /* ── 3. 予実管理 ── */
    yj_pl: {
      page: 'yojitsu',
      marks: { pills: '.sectabs', kpi: '.kpi-grid', tabs: '#main .tabs', seg: '#main .tabs + div .seg', table: '#main .table-wrap', tax: '.toolbar-left .seg' },
    },
    yj_input_actual: {
      page: 'yojitsu', run: ev(`setYjTab('input'); setYjView('actual')`),
      marks: {
        tab: '#main .tabs button:has-text("入力")', seg: '#main .seg button:has-text("実績")', help: '#main .infobar',
        rev: '#main tr.totrow:has-text("収益")', cost: '#main tbody tr:has(input.cellin.ed) >> nth=0',
      },
    },
    yj_input_budget: {
      page: 'yojitsu', run: async p => { await p.evaluate(`setYjTab('input'); setYjView('budget')`); await p.waitForTimeout(300); await p.click('.toolbar-left summary') },
      marks: { seg: '#main .seg button:has-text("予算")', spread: 'button:has-text("年額をまとめて入力")', copy: '.more-panel button:has-text("前年実績から予算を作成")' },
    },
    yj_acct: {
      page: 'yojitsu', run: ev(`setYjTab('acct')`),
      marks: { tabs: '#main .tabs button:has-text("勘定科目別")' },
    },
    compare: { page: 'compare', marks: { metric: '#main .seg >> nth=1', base: '#main select, #main .seg >> nth=2' } },
    mikomi: { page: 'mikomi', marks: { year: '#main .panel >> nth=0' } },
    okr: { page: 'okr', run: ev(`setOkrPeriod('2025-Q4')`), marks: { period: '.toolbar-left select[onchange^="setOkrPeriod"]', add: tool('目標を追加'), kr: '#main .table-wrap >> nth=0' } },

    /* ── 4. 回収（売掛金） ── */
    ar: {
      page: 'arbook',
      marks: {
        tabs: '.sectabs', add: tool('入金を記録'), tools: '.toolbar-left summary',
        kpi: '.ar-kpis', filter: '.ar-filters input[data-sb]', per: '.ar-filters .seg >> nth=0', cum: '.ar-filters .seg >> nth=1',
        name: '.ar-tbl tbody tr >> nth=0 >> .ar-name', cell: '.ar-tbl tbody tr >> nth=0 >> td.ar-c >> nth=3',
        total: '.ar-tbl tr.totrow', flow: '.ar-tbl tr.ar-flow >> nth=0', flow2: '.ar-tbl tr.ar-flow >> nth=1', now: '.ar-tbl th.ar-now',
      },
    },
    ar_q: {
      page: 'arbook', run: ev(`setBookView('per','q'); setBookView('cum',true)`),
      marks: { per: '.ar-filters .seg >> nth=0', cum: '.ar-filters .seg >> nth=1', head: '.ar-tbl thead', flow: '.ar-tbl tr.ar-flow >> nth=0' },
    },
    ar_pop: {
      page: 'arbook',
      run: async p => { await p.locator('.ar-tbl tbody tr >> nth=0 >> td.ar-c >> nth=3').click(); await p.waitForTimeout(300) },
      clip: ['#arPop', '.ar-tbl tbody tr >> nth=0 >> td.ar-c >> nth=3', '.ar-tbl tbody tr >> nth=0 >> .ar-name'], clipPad: 24,
      marks: { pop: '#arPop', cell: '.ar-tbl tbody tr >> nth=0 >> td.ar-c >> nth=3' },
    },
    ar_ledger: {
      page: 'arbook', run: async p => {
        await p.locator('.ar-tbl tbody tr:has-text("東和フーズ") .ar-name').click(); await p.waitForTimeout(500)
        await p.evaluate(() => { LED_OPEN.open = { '2026-06': true, '2026-07': true }; ledRedraw(); ledScrollEnd() }); await p.waitForTimeout(500)
      },
      clip: '#modal',
      marks: { grade: '#modal :text("評価")', col: '#ledTbl th:has-text("証憑")', row: '#ledTbl tr.ledrow:has-text("2026/06")',
        det: '#ledTbl tr.leddet >> nth=0', miss: '#ledTbl tr.ledrow .attbtn.miss >> nth=0', pay: '#modal button:has-text("入金を記録")' },
    },
    payment: {
      page: 'arbook',
      run: async p => {
        await p.evaluate(`openPayment()`); await p.waitForTimeout(300)
        const sel = p.locator('#modal select').first()
        const v = await p.evaluate(() => DB.companies.find(c => c.name.includes('東和フーズ')).id)
        await sel.selectOption(v); await sel.dispatchEvent('change'); await p.waitForTimeout(300)
        const t = await p.evaluate(id => payShortPreview(id, 1, null).target, v)
        const amt = p.locator('#modal input.num').first(); await amt.fill(String(t - 440)); await amt.dispatchEvent('input')
      },
      clip: '#modal',
      marks: { date: '#modal input[type="date"]', co: '#modal select >> nth=0', amt: '#modal label:has-text("入金額") + *', diff: '#payDiff',
        files: '#modal .attpend', save: '#modal button:has-text("保存")' },
    },
    mf: {
      page: 'arbook', run: ev(`openMfImport()`), clip: '#modal',
      marks: { api: '#modal :text("① API から取得")', fetch: '#modal button:has-text("取得する")', csv: '#modal :text("② CSV を読み込む")' },
    },
    arbill: {
      page: 'arbook', run: async p => { await p.click('.toolbar-left summary'); await p.waitForTimeout(200) },
      clip: '.more-panel', clipPad: 14,
      marks: { sort: '.tp-row >> nth=0', filt: '.tp-row >> nth=1', owner: '.tp-row >> nth=2', item: '.more-panel button:has-text("請求を手入力")',
        tpl: '.more-panel button:has-text("CSVテンプレート")', up: '.more-panel .tp-file', mf: '.more-panel button:has-text("Money Forward")', out: '.tp-two' },
    },
    ab_bulk: {
      page: 'arbook',
      run: async p => {
        await p.evaluate(() => {
          const cs = abCustomers();
          const mk = (c, total, tax) => { const r = abBlank(); r.companyId = c.id; r.total = total; if (tax) r.taxCat = tax; abFill(r); return r };
          const bad = abBlank(); bad.hint = '株式会社みらい（見つからない）'; bad.total = 88000; abFill(bad);
          openArBillBulk([mk(cs[0], 110000), mk(cs[1], 50000, '非課税'), mk(cs[2], 330000), bad])
        }); await p.waitForTimeout(400)
      },
      clip: '#modal',
      marks: { co: '#abBox tbody tr >> nth=0 >> td >> nth=1', tax: '#abBox tbody tr >> nth=1 >> td >> nth=4', auto: '#abBox tbody tr >> nth=0 >> td >> nth=6',
        due: '#abBox tbody tr >> nth=0 >> td >> nth=7', bad: '#abBox tbody tr >> nth=3', add: '#modal button:has-text("行を追加")', copy: '#modal button:has-text("最後の行をコピー")',
        del: '#abBox tbody tr >> nth=0 >> .ab-x', save: '#abSave' },
    },
    receipts: { page: 'receipts', marks: { add: tool('入金を記録'), filter: '#main th >> nth=1' } },
    archeck: { page: 'archeck', height: 1000, marks: { cards: '#main .kpi-grid >> nth=0' } },
    dunning: {
      page: 'dunning',
      marks: { filter: '#main button:has-text("今日やる")', mine: '#main button:has-text("自分の担当だけ")', rec: '#main a.pillbtn:has-text("記録") >> nth=0', row: '#main tbody tr >> nth=0' },
    },
    dunlog: {
      page: 'dunning',
      run: async p => { await p.locator('#main a.pillbtn:has-text("記録")').first().click(); await p.waitForTimeout(400) },
      clip: '#modal2',
      marks: { method: '#modal2 #dlMethod', promise: '#modal2 :text("約束") >> nth=0' },
    },

    /* ── 5. 支払（買掛金） ── */
    ap: {
      page: 'apbook',
      marks: { tabs: '.sectabs', pay: tool('支払を記録'), bill: tool('支払請求を登録'), kpi: '.ar-kpis', total: '.ar-tbl tr.totrow', flow: '.ar-tbl tr.ar-flow >> nth=0' },
    },
    bills: {
      page: 'bills',
      marks: { gen: tool('定期の支払を作成'), add: tool('支払請求を登録'), status: '#main th:has-text("状態")' },
    },
    genbills: { page: 'bills', run: ev(`openGenBills()`), clip: '#modal', marks: { month: '#modal select, #modal input >> nth=0', go: '#modal button:has-text("この内容で作成")' } },
    bill_form: {
      page: 'bills', run: ev(`openForm('bills')`), clip: '#modal',
      marks: { co: '#modal label:has-text("支払先") >> ..', book: '#modal label:has-text("計上月") >> ..', due: '#modal label:has-text("支払期日") >> ..', lines: '#modal a:has-text("行を追加")', files: '#modal .attpend' },
    },
    payout: {
      page: 'apbook',
      run: async p => {
        await p.evaluate(`openPayout()`); await p.waitForTimeout(300)
        const sel = p.locator('#modal select').first()
        const v = await sel.evaluate(s => [...s.options].find(o => o.text.includes('クリーンサポート'))?.value)
        if (v) { await sel.selectOption(v); await sel.dispatchEvent('change') }
        await p.waitForTimeout(300)
        const amt = p.locator('#modal label:has-text("支払額") ~ input, #modal label:has-text("支払額") + input').first()
        await amt.fill('33000'); await amt.dispatchEvent('input')
        await p.locator('#modal :text("期日の古い順に自動で割り当て")').click().catch(() => {})
        await p.waitForTimeout(300)
      },
      clip: '#modal',
      marks: { inv: '#modal table .attbtn >> nth=0', files: '#modal .attpend', amt: '#modal label:has-text("支払額") ~ input, #modal label:has-text("支払額") + input', auto: '#modal :text("期日の古い順に自動で割り当て")', co: '#modal select >> nth=0', alloc: '#modal table', save: '#modal button:has-text("保存")' },
    },
    cashflow: { page: 'cashflow', marks: { seg: '#main .seg', start: '#main button:has-text("開始残高を設定")' } },

    arshort: {
      page: 'arshort', height: 760,
      marks: { kpi: '#main .kpi-grid', open: '#main tbody tr:has-text("あおば") td >> nth=3', btn: '#main tbody tr:has-text("あおば") button:has-text("次回請求に加算")',
        abs: '#main tbody tr:has-text("あおば") button:has-text("当社負担")', mail: '#main tbody tr:has-text("あおば") button:has-text("✉")', burden: '#main tbody tr:has-text("みどり") td >> nth=0' },
    },
    fee_burden: {
      page: 'companies',
      run: ev(`openForm('companies', DB.companies.find(c=>c.name.includes('あおば')).id)`), clip: '#modal',
      marks: { fee: '#modal select[name="feeBurden"]' },
    },
    /* ── 証憑（ファイル）── */
    att_window: {
      page: 'arbook',
      run: async p => {
        await p.evaluate(() => { const c = DB.companies.find(x => x.name.includes('東和フーズ')); const f = arFacts(c.id);
          const b = f.bills.slice().sort((a, b) => a.ym.localeCompare(b.ym)).reverse().find(x => x.ym < '2026-07'); attOpen('invoices', b.doc.id) })
        await p.waitForTimeout(1800)
      },
      clip: '#modal2',
      marks: { head: '#modal2 h3', drop: '#attDrop', type: '#attDocType', list: '#attList .attrow >> nth=0', rowtype: '#attList .attrow select >> nth=0', prev: '#attPrev' },
    },
    att_missing: {
      page: 'bills', run: ev(`ATT_MISS_ONLY.bills=true; renderPage('bills')`),
      marks: { toggle: '.toolbar-left label.ar-chk', miss: '#main .attbtn.miss >> nth=0' },
    },
    bill_gate: {
      page: 'bills',
      run: async p => {
        const id = await p.evaluate(() => { const c = DB.companies.find(x => x.name.includes('クリーンサポート'));
          apCreateBills('2026-07', [{ company: c, items: [{ accountCode: '6900', name: '寮 共用部清掃', amount: 30000, taxCat: '課税10%' }] }]);
          return DB.bills.filter(b => b.status === '作成中').map(b => b.id).pop() })
        await p.evaluate(() => renderPage('bills')); await p.waitForTimeout(300)
        await p.evaluate(id => confirmBill(id), id); await p.waitForTimeout(900)
      },
      clip: '#modal2',
      marks: { head: '#modal2 h3', drop: '#attDrop', btn: '#attConfirmBtn' },
    },

    /* ── 6. 費用 ── */
    expenses: {
      page: 'expenses',
      marks: {
        add: tool('対象を追加'), all12: tool('定期をすべて→12'), grp: '.cost-table tr.cgrp >> nth=1',
        cell: '.cost-table tbody tr:not(.cgrp) >> nth=0 >> input.cellin >> nth=1', r12: '.cost-table button:has-text("→12") >> nth=0',
        badge: '.cost-table .badge:has-text("買掛") >> nth=0',
      },
    },
    costitem: {
      page: 'expenses', run: ev(`openForm('costItems',null,{kind:'fixed',taxCat:'課税10%',payMode:'即払い'})`), clip: '#modal',
      marks: { name: '#modal label:has-text("対象名") >> ..', acc: '#modal label:has-text("勘定科目") >> ..', kind: '#modal label:has-text("区分") >> ..', pay: '#modal label:has-text("払い方") >> ..', amt: '#modal label:has-text("月額") >> ..' },
    },
    properties: { page: 'properties', marks: { add: tool('物件を追加'), alert: '#main .alertbar, #main .warnbar' } },

    /* ── 7. 取引先 ── */
    companies: { page: 'companies', run: seedReview,
      marks: { menu: '.sectabs', tabs: '.co-tabs', review: '#main .warnbar >> nth=0', add: tool('を追加'), kind: '#main th >> nth=1' } },
    coreview: { page: 'coreview', run: seedReview,
      marks: { queue: '.cr-sec >> nth=0', qact: '.cr-act >> nth=0', auto: '.cr-sec >> nth=1', aact: '.cr-act >> nth=1' } },
    company_form: {
      page: 'companies', run: ev(`openForm('companies',null,{kind:'得意先',closingDay:31,paySite:1,payDay:31,taxCat:'課税10%'})`), clip: '#modal',
      marks: { kind: '#modal label:has-text("区分") >> ..', terms: '#modal :text("② ") >> ..', owner: '#modal label:has-text("BIGLIGHT担当者") >> ..' },
    },

    /* ── 8. 設定 ── */
    accounts: { page: 'accounts', marks: { add: tool('大分類を追加'), row: '#main tbody tr >> nth=1' } },
    settings: { page: 'settings', height: 1100, marks: { cash: '#main :text("資金繰りの開始残高") >> ..', demo: '#main button:has-text("デモデータを作り直す")', cache: '#main button:has-text("キャッシュを消して")' } },
    mfpanel: { page: 'apilink', run: async p => { await seedReview(p); await p.evaluate(() => mfPanelLoad()); await p.waitForSelector('.mfp-cards'); await p.waitForTimeout(500) },
      clip: '#mfPanel', clipPad: 6,
      marks: { key: '.mfp-key', inv: '.mfp-card >> nth=0', acc: '.mfp-card >> nth=1', auto: '.mfp-auto', review: '#mfPanel .warnbar' } },
    users: { page: 'users', marks: { pending: '#main :text("承認待ち（1人）") >> ..' } },
  },
}
