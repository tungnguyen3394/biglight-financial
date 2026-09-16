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

export default {
  fy: 2025,
  shots: {
    /* ── 1. Bắt đầu ── */
    home: {
      page: 'dashboard',
      marks: {
        menu: '#navList', fy: '#fyPick', guide: 'button[aria-label="入力ガイド"]', bell: '#notif > .icon-btn',
        search: '.topsearch', avatar: '#avatarBox', tax: '.toolbar-left .seg', theme: '#themeToggle', burger: '#menuBtn',
      },
    },
    bell: {
      page: 'dashboard', run: ev(`toggleNotif()`), clip: ['#notif > .icon-btn', '#notifMenu'], clipPad: 16,
      marks: { menu: '#notifMenu', items: '#notifMenu .nm-item >> nth=0' },
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
        tabs: '.sectabs', add: tool('入金を記録'), mf: tool('Money Forward'), tools: '.toolbar-left summary',
        kpi: '.ar-kpis', filter: '.ar-filters label.ar-chk >> nth=0', per: '.ar-filters .seg >> nth=0', cum: '.ar-filters .seg >> nth=1',
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
      page: 'arbook', run: async p => { await p.locator('.ar-tbl tbody tr >> nth=0 >> .ar-name').click(); await p.waitForTimeout(400) },
      clip: '#modal',
      marks: { grade: '#modal :text("評価")', table: '#modal table >> nth=0', pay: '#modal button:has-text("入金を記録")' },
    },
    payment: {
      page: 'arbook',
      run: async p => {
        await p.evaluate(`openPayment()`); await p.waitForTimeout(300)
        const sel = p.locator('#modal select').first()
        const v = await sel.evaluate(s => [...s.options].find(o => o.text.includes('北関東物流'))?.value)
        if (v) { await sel.selectOption(v); await sel.dispatchEvent('change') }
        await p.waitForTimeout(200)
        await p.locator('#modal label:has-text("入金額") + input, #modal label:has-text("入金額") ~ input').first().fill('150000').catch(() => {})
      },
      clip: '#modal',
      marks: { date: '#modal input[type="date"]', co: '#modal select >> nth=0', amt: '#modal label:has-text("入金額") + *', fee: '#modal label:has-text("振込手数料") + *', save: '#modal button:has-text("保存")' },
    },
    mf: {
      page: 'arbook', run: ev(`openMfImport()`), clip: '#modal',
      marks: { api: '#modal :text("① API で取得")', fetch: '#modal button:has-text("請求書を取得")', csv: '#modal :text("② CSV を読み込む")' },
    },
    arbill: {
      page: 'arbook', run: async p => { await p.click('.toolbar-left summary'); await p.waitForTimeout(200) },
      marks: { item: '.more-panel button:has-text("請求額を手入力")', csv: '.more-panel button:has-text("CSV出力")' },
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
      marks: { co: '#modal label:has-text("支払先") >> ..', book: '#modal label:has-text("計上月") >> ..', due: '#modal label:has-text("支払期日") >> ..', lines: '#modal a:has-text("行を追加")' },
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
      marks: { amt: '#modal label:has-text("支払額") ~ input, #modal label:has-text("支払額") + input', auto: '#modal :text("期日の古い順に自動で割り当て")', co: '#modal select >> nth=0', alloc: '#modal table', save: '#modal button:has-text("保存")' },
    },
    cashflow: { page: 'cashflow', marks: { seg: '#main .seg', start: '#main button:has-text("開始残高を設定")' } },

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
    companies: { page: 'companies', marks: { tabs: '.sectabs', add: tool('取引先を追加'), filter: '#main th >> nth=1' } },
    company_form: {
      page: 'companies', run: ev(`openForm('companies',null,{kind:'得意先',closingDay:31,paySite:1,payDay:31,taxCat:'課税10%'})`), clip: '#modal',
      marks: { kind: '#modal label:has-text("区分") >> ..', terms: '#modal :text("② ") >> ..', owner: '#modal label:has-text("BIGLIGHT担当者") >> ..' },
    },

    /* ── 8. 設定 ── */
    accounts: { page: 'accounts', marks: { add: tool('大分類を追加'), row: '#main tbody tr >> nth=1' } },
    settings: { page: 'settings', height: 1100, marks: { cash: '#main :text("資金繰りの開始残高") >> ..', demo: '#main button:has-text("デモデータを作り直す")', cache: '#main button:has-text("キャッシュを消して")' } },
    users: { page: 'users', marks: { pending: '#main :text("承認待ち（1人）") >> ..' } },
  },
}
