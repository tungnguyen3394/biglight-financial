/* ============================================================================
   Hướng dẫn sử dụng finance.biglight.jp (予実管理システム) — bản TIẾNG VIỆT
   ----------------------------------------------------------------------------
   Sửa chữ ở file này, rồi chạy:   cd guide && node tools/build.mjs vi
   (chỉ sửa chữ thì KHÔNG cần chụp lại màn hình, không cần máy chủ)

   Cách viết
     **chữ**        → in đậm
     `chữ`          → nhãn đúng như trên màn hình (ô xám), dùng cho tên nút/tab tiếng Nhật
     \n             → xuống dòng
     shot: 'ar'     → ảnh vi/shots/ar.jpg
     mark: 'kpi'    → khung cam + số trên ảnh (tên lấy trong chup.mjs › marks)
     modal: true    → ảnh là hộp thoại (không vẽ thanh trình duyệt)
     maxH: 100      → chiều cao tối đa của ảnh (mm). Chữ tràn trang thì giảm số này.
     tip / note     → ô xanh «Mẹo» / ô vàng «Lưu ý»
     blocks         → trang chữ: {h}, {p}, {list}, {table, head}, {qa}, {check, items}, {flow}
   ============================================================================ */
export default {
  lang: 'vi',
  file: 'Huong-dan-su-dung_BIGLIGHT-Finance.pdf',
  kicker: 'Dành cho nhân viên BIGLIGHT',
  title: 'Hướng dẫn sử dụng\n予実管理システム',
  titleLine: 'Hướng dẫn sử dụng finance.biglight.jp',
  short: 'BIGLIGHT · finance.biglight.jp',
  subtitle: 'Kế hoạch và thực tế (予実), tiền phải thu (売掛金),\ntiền phải trả (買掛金) và chi phí dự kiến (費用) — trên một hệ thống.',
  audience: 'Dành cho: nhân viên kế toán và quản lý của BIGLIGHT\nMở bằng: trình duyệt trên máy tính (Chrome, Edge, Safari) — https://finance.biglight.jp',
  version: 'Phiên bản 16/9/2026 · Ảnh chụp dùng dữ liệu mẫu (【デモ】)',
  intro: 'Tài liệu hướng dẫn từng màn hình của hệ thống, theo đúng giao diện thật. Màn hình là tiếng Nhật nên tên nút được giữ nguyên tiếng Nhật và giải thích bằng tiếng Việt. Mọi con số và tên công ty trong ảnh đều là **dữ liệu mẫu**.',

  labels: {
    toc: 'Mục lục', tip: 'Mẹo', note: 'Lưu ý', missing: 'Ảnh màn hình đang được chuẩn bị',
    legend: 'Khung và số màu cam là **chỗ cần bấm hoặc cần xem**. Số trên ảnh trùng với số trong phần giải thích bên dưới ảnh.',
    legendUi: 'Chữ trong ô xám là **tên nút / tên màn hình đúng như trên hệ thống** (tiếng Nhật) — tìm đúng chữ đó trên màn hình.',
  },

  chapters: [
    /* ================================================================== */
    {
      title: 'Tổng quan',
      summary: 'Hệ thống dùng để làm gì · từ ngữ hay gặp · số liệu đi từ đâu tới đâu',
      pages: [
        {
          title: 'Hệ thống này dùng để làm gì?',
          lead: 'finance.biglight.jp là nơi BIGLIGHT quản lý **tiền của công ty**: kế hoạch và thực tế, ai còn nợ mình, mình còn nợ ai, và sắp phải chi những gì.',
          blocks: [
            { h: 'Menu bên trái — mỗi mục một việc' },
            { head: ['Menu', 'Dùng để', 'Trả lời câu hỏi'], table: [
              ['`ダッシュボード`', 'Xem nhanh', 'Kỳ này bán được bao nhiêu, lãi bao nhiêu, còn bao nhiêu tiền chưa thu?'],
              ['`予実管理`', 'Kế hoạch so với thực tế', 'Tháng này đạt bao nhiêu % kế hoạch? Cuối năm dự kiến về đâu?'],
              ['`回収（売掛金）`', 'Tiền phải **thu**', 'Công ty nào còn nợ BIGLIGHT bao nhiêu? Ai quá hạn? Hôm nay phải nhắc ai?'],
              ['`支払（買掛金）`', 'Tiền phải **trả**', 'BIGLIGHT còn nợ ai bao nhiêu? Khoản nào sắp đến hạn? Tiền mặt có đủ không?'],
              ['`費用`', 'Chi phí **dự kiến**', 'Các tháng tới sẽ phải chi những gì (tiền nhà, lương, thuê ngoài…)?'],
              ['`取引先`', 'Danh sách đối tác', 'Khách hàng / nhà cung cấp, ngày chốt sổ, hạn thanh toán'],
              ['`設定`', 'Cài đặt', 'Tài khoản kế toán, người dùng và quyền, số dư đầu kỳ…'],
            ] },
          ],
        },
        {
          title: 'Từ ngữ hay gặp',
          lead: 'Màn hình là tiếng Nhật. Đây là các từ xuất hiện nhiều nhất và nghĩa của chúng.',
          blocks: [
            { head: ['Tiếng Nhật', 'Nghĩa', 'Ghi chú'], table: [
              ['`予算`', 'Ngân sách (kế hoạch)', 'Lập một lần vào đầu năm'],
              ['`見込`', 'Dự báo', 'Cập nhật khi tình hình thay đổi'],
              ['`実績`', 'Thực tế', 'Số kế toán thật'],
              ['`売掛金`', 'Tiền phải thu', 'Đã xuất hoá đơn nhưng khách chưa trả'],
              ['`買掛金`', 'Tiền phải trả', 'Đã nhận hoá đơn nhưng BIGLIGHT chưa trả'],
              ['`請求` / `請求額`', 'Hoá đơn gửi khách / số tiền trên hoá đơn', 'Làm ở Money Forward rồi lấy về đây'],
              ['`入金`', 'Tiền khách chuyển vào', ''],
              ['`支払請求`', 'Hoá đơn BIGLIGHT nhận từ nhà cung cấp', ''],
              ['`支払`', 'Tiền BIGLIGHT chuyển đi', ''],
              ['`計上月`', 'Tháng ghi nhận', 'Tháng mà khoản đó thuộc về (không phải tháng trả tiền)'],
              ['`期日`', 'Hạn thanh toán', '`期限超過` / `期日超過` = đã quá hạn'],
              ['`締日` / `サイト`', 'Ngày chốt sổ / số tháng được trả chậm', 'VD: chốt cuối tháng, trả cuối tháng sau'],
              ['`税込` / `税抜`', 'Đã gồm thuế / chưa gồm thuế tiêu dùng', 'Nút đổi cách xem ở góc phải'],
              ['`残高`', 'Số dư', ''],
              ['`年度` · `四半期` · `上期` `下期` · `通期`', 'Năm tài chính · quý · nửa đầu, nửa sau năm · cả năm', 'Năm tài chính: **1/8 → 31/7 năm sau**'],
              ['`累計`', 'Luỹ kế', 'Cộng dồn từ đầu năm tài chính'],
              ['`督促`', 'Nhắc nợ', ''],
            ] },
          ],
        },
        {
          title: 'Số liệu đi từ đâu tới đâu',
          lead: 'Hiểu sơ đồ này là tránh được gần hết các nhầm lẫn. Mỗi con số chỉ được nhập **ở một chỗ**.',
          blocks: [
            { flow: { title: 'Tiền phải thu — 回収（売掛金）', rows: [[
              { t: 'Money Forward 請求書', s: 'Hoá đơn được làm ở MF', c: 'src' },
              { t: '`Money Forward から取り込む`', s: 'Lấy số tiền hoá đơn về', c: 'in' },
              { t: 'Bảng 売掛金', s: 'Số dư = tháng trước + 請求 − 入金', c: 'out' },
            ], [
              { t: 'Sao kê ngân hàng', s: 'Khách đã chuyển tiền', c: 'src' },
              { t: '`＋ 入金を記録`', s: 'Ghi tiền vào', c: 'in' },
              { t: 'Số dư giảm', s: 'Không làm đổi doanh thu', c: 'out' },
            ]] } },
            { flow: { title: 'Tiền phải trả — 支払（買掛金）', rows: [[
              { t: 'Hoá đơn nhà cung cấp', s: 'Hoặc: khoản định kỳ trong 費用表', c: 'src' },
              { t: '`支払請求` → `確定`', s: 'Đăng ký rồi xác nhận', c: 'in' },
              { t: 'Bảng 買掛金', s: 'Số dư = tháng trước + 支払請求 − 支払', c: 'out' },
            ], [
              { t: 'Chuyển khoản trả tiền', s: '', c: 'src' },
              { t: '`＋ 支払を記録`', s: 'Ghi tiền ra, gán vào hoá đơn', c: 'in' },
              { t: 'Số dư giảm', s: 'Không làm đổi chi phí thực tế', c: 'out' },
            ]] } },
            { flow: { title: 'Kế hoạch và thực tế — 予実管理', rows: [[
              { t: 'Hoá đơn (請求)', s: 'Phần doanh thu, chưa thuế', c: 'src' },
              { t: 'Tự động', s: 'Không phải nhập', c: 'in' },
              { t: '実績 — doanh thu', s: 'Hàng màu xám', c: 'out' },
            ], [
              { t: '試算表 của 会計事務所', s: 'Bảng cân đối thử hằng tháng', c: 'src' },
              { t: '`入力` › `実績`', s: 'Gõ tay, chưa thuế', c: 'in' },
              { t: '実績 — chi phí', s: '', c: 'out' },
            ], [
              { t: '費用表 · 支払請求', s: 'Là dự kiến / lời hứa trả', c: 'src' },
              { t: '✕', s: '', c: 'no', arrow: '→' },
              { t: '**Không** vào 実績', s: 'Vì không phải số kế toán', c: 'no' },
            ]], note: 'Nhờ vậy 予実 luôn khớp với 試算表, không bị lệch vì quên tạo chứng từ.' } },
            { h: '4 điều cần nhớ' },
            { list: [
              '**Chi phí thực tế** (実績) lấy từ **試算表** của văn phòng kế toán và gõ tay. **Doanh thu thực tế** tự tính từ hoá đơn.',
              '**Ghi 入金 / 支払 không làm đổi lãi lỗ.** Chúng chỉ làm giảm số dư phải thu / phải trả.',
              '**費用表 là dự kiến**, không phải thực tế. Gõ vào 費用表 không làm đổi 予実.',
              '**Năm tài chính** bắt đầu 1/8 và kết thúc 31/7 năm sau. Quý 1 = tháng 8–10, quý 2 = 11–1, quý 3 = 2–4, quý 4 = 5–7.',
            ] },
          ],
        },
      ],
    },

    /* ================================================================== */
    {
      title: 'Bắt đầu',
      summary: 'Đăng nhập · màn hình chính · chuông thông báo · tìm kiếm · 入力ガイド',
      pages: [
        {
          title: 'Đăng nhập và quyền',
          lead: 'Hệ thống không dùng mật khẩu riêng — đăng nhập bằng **tài khoản Google công ty (@biglight.jp)**.',
          blocks: [
            { h: 'Lần đầu đăng nhập' },
            { list: [
              'Mở **https://finance.biglight.jp** bằng Chrome, Edge hoặc Safari trên máy tính.',
              'Bấm nút **Đăng nhập bằng Google** và chọn tài khoản **@biglight.jp** của bạn.',
              'Lần đầu, màn hình sẽ báo **đang chờ duyệt** — lúc này bạn chưa xem được gì. Hãy báo quản trị viên để được bật quyền.',
              'Khi quản trị viên đã duyệt, tải lại trang là vào được. Lần sau mở trang là vào thẳng.',
            ] },
            { h: 'Vai trò (役割)' },
            { head: ['Vai trò', 'Làm được gì'], table: [
              ['`管理者（Admin）`', 'Tất cả, kể cả 設定 và người dùng'],
              ['`マネージャー（経営）`', 'Xem và nhập hầu hết các màn hình, lấy hoá đơn từ Money Forward'],
              ['`スタッフ（経理）`', 'Nhập chứng từ: 入金, 支払, 支払請求, 費用表, 予実…'],
              ['`閲覧のみ`', 'Chỉ xem, không sửa được'],
            ] },
            { p: 'Quản trị viên còn có thể **ẩn từng màn hình** với từng người. Nếu bạn không thấy một mục trong menu hoặc không thấy nút như trong tài liệu này, đó là do quyền — hãy hỏi quản trị viên.' },
          ],
          note: 'Hệ thống chứa số tiền của từng khách hàng, tiền nhà, tiền lương. **Không đăng nhập trên máy dùng chung** và nhớ đăng xuất (bấm ảnh đại diện góc phải › `ログアウト`) khi dùng xong ở máy lạ.',
        },
        {
          title: 'Màn hình chính',
          screens: [{
            shot: 'home', maxH: 118,
            steps: [
              { mark: 'menu', text: '**Menu**: bấm để chuyển màn hình. Số đỏ = số việc cần xử lý ở màn đó.', badge: 'left' },
              { mark: 'burger', text: 'Thu gọn / mở lại menu (khi cần chỗ rộng cho bảng).' },
              { mark: 'search', text: '**Tìm nhanh** công ty, hoá đơn, hoá đơn phải trả.' },
              { mark: 'fy', text: '**Chọn năm tài chính** (`2025年度` = 1/8/2025 → 31/7/2026). Mọi bảng đổi theo.' },
              { mark: 'guide', text: '`入力ガイド`: màn nào nhập gì — mở đúng mục của màn đang xem.' },
              { mark: 'bell', text: '**Chuông**: danh sách việc cần làm (quá hạn, nhắc nợ…).' },
              { mark: 'avatar', text: 'Tài khoản của bạn: cài đặt mail, `ログアウト`.' },
              { mark: 'tax', text: '`税込` / `税抜`: xem số **đã gồm** hay **chưa gồm** thuế. Chỉ đổi cách xem.' },
              { mark: 'theme', text: 'Đổi nền sáng / tối.' },
            ],
          }],
          tip: 'Hệ thống tự lưu. Không có nút “Lưu toàn bộ” — gõ xong một ô hoặc bấm `保存` trong hộp thoại là đã lưu. Nếu mạng rớt, thay đổi được giữ lại và gửi khi có mạng.',
        },
        {
          title: 'Chuông thông báo và tìm kiếm',
          side: true,
          screens: [
            { shot: 'bell', modal: true, maxH: 120, label: 'Chuông', steps: [
              { mark: 'menu', text: 'Bấm **chuông** để mở danh sách `やること` (việc cần làm).' },
              { mark: 'items', text: 'Mỗi dòng là một loại việc: hoá đơn quá hạn, nhắc nợ hôm nay, vượt hạn mức, khoản phải trả quá hạn, hợp đồng thuê sắp hết… **Bấm vào để mở đúng màn hình.**' },
            ] },
            { shot: 'search', modal: true, maxH: 70, label: 'Tìm kiếm', steps: [
              { mark: 'box', text: 'Gõ một phần tên (VD `さくら`) vào ô tìm kiếm trên cùng.' },
              { mark: 'list', text: 'Chọn kết quả: công ty, hoá đơn hoặc 支払請求 sẽ mở ra ngay.' },
            ] },
          ],
          tip: 'Mỗi sáng mở chuông trước tiên: đó là danh sách việc của ngày hôm nay.',
        },
        {
          title: '入力ガイド — hướng dẫn ngay trong hệ thống',
          lead: 'Quên màn nào nhập gì? Bấm biểu tượng quyển sách trên thanh trên cùng.',
          screens: [{
            shot: 'guide', modal: true, maxH: 138,
            steps: [
              { mark: 'diagram', text: '**Sơ đồ** của mục đang xem. Ở 予実管理 là sơ đồ ①②③④ “lúc nào — nhập vào đâu — hiện ở đâu”.' },
              { mark: 'tabs', text: 'Chuyển sang mục khác để xem hướng dẫn của mục đó.' },
              { mark: 'table', text: 'Bảng từng màn hình: `順番` (thứ tự nên làm), **nhập gì**, **ảnh hưởng tới đâu**. Bấm tên màn hình để mở.' },
            ],
          }],
        },
      ],
    },

    /* ================================================================== */
    {
      title: 'ダッシュボード',
      summary: 'Xem nhanh doanh thu, lợi nhuận, tiền phải thu / phải trả theo kỳ',
      pages: [
        {
          title: 'Xem nhanh tình hình theo kỳ',
          screens: [{
            shot: 'dash', maxH: 150,
            steps: [
              { mark: 'range', text: '**Chọn tháng cần xem**: bấm giữ một tháng rồi **kéo ngang** để chọn nhiều tháng liền nhau. Cột xanh trong mỗi ô = doanh thu tháng đó.' },
              { mark: 'presets', text: 'Hoặc bấm nhanh: `通期` (cả năm) · `上期` `下期` (nửa năm) · `Q1`–`Q4` (quý) · `期首〜直近` (từ đầu năm tới tháng gần nhất có số thực tế).' },
              { mark: 'kpi', text: '**Doanh thu, lãi gộp, lợi nhuận** của các tháng đã chọn (so với ngân sách), và **số dư phải thu / phải trả** ở cuối kỳ.' },
              { mark: 'staff', text: '**Doanh thu theo người phụ trách** BIGLIGHT. Bấm một dòng để xem các công ty của người đó.' },
            ],
          }],
          tip: 'Kéo xuống dưới còn có danh sách **hoá đơn đã quá hạn** (màu đỏ). Bấm vào tiêu đề đỏ để mở màn 売掛金; muốn nhắc nợ thì vào `督促（今日やること）`.',
        },
      ],
    },

    /* ================================================================== */
    {
      title: '予実管理 — kế hoạch và thực tế',
      summary: 'Đọc bảng 予実 · cách nhập 予算 / 見込 / 実績 · 期間比較 · 見込実績表 · OKR',
      pages: [
        {
          title: 'Đọc bảng 予実対比',
          screens: [{
            shot: 'yj_pl', maxH: 124,
            steps: [
              { mark: 'pills', text: 'Các màn trong 予実管理: `予実` · `期間比較` · `見込実績表` · `目標 OKR`.' },
              { mark: 'kpi', text: 'Doanh thu tháng gần nhất, luỹ kế năm, và **着地見込** (dự báo cả năm = thực tế các tháng đã qua + dự báo các tháng còn lại).' },
              { mark: 'tabs', text: '`損益（予実対比）` bảng lãi lỗ · `勘定科目別` theo từng tài khoản · `入力` **nơi nhập số**.' },
              { mark: 'seg', text: 'Chọn xem `予実対比` (thực tế + ngân sách + chênh lệch) hoặc chỉ `実績` / `予算` / `見込`.' },
              { mark: 'table', text: 'Mỗi ô: số thực tế, dòng `予` là ngân sách, dòng dưới là chênh lệch (**xanh** = tốt hơn kế hoạch, **đỏ** = kém hơn).' },
              { mark: 'tax', text: '`税込` / `税抜` đổi cách xem.' },
            ],
          }],
        },
        {
          title: 'Cách nhập đúng vào 予実管理',
          lead: 'Tất cả đều nhập ở `予実管理` › `入力`. Có 3 nút: `予算` · `見込` · `実績` — là **ba con số khác nhau** của cùng một ô.',
          blocks: [
            { flow: { title: 'Lúc nào — nhìn cái gì → nhập vào đâu → hiện ở đâu', rows: [
              [{ t: '① Đầu năm (tháng 8)', s: 'Một lần · có thể chép từ thực tế năm trước', c: 'src' },
               { t: '`入力` › `予算`', s: 'Kế hoạch của năm (chưa thuế)', c: 'in' },
               { t: '損益・勘定科目別・着地見込', s: '', c: 'out' }],
              [{ t: '② Khi dự báo thay đổi', s: 'Hằng tháng', c: 'src' },
               { t: '`入力` › `見込`', s: 'Dự báo (chưa thuế)', c: 'in' },
               { t: '着地見込', s: 'Ngân sách giữ nguyên', c: 'out' }],
              [{ t: '③ 試算表 của 会計事務所', s: 'Mỗi tháng khi nhận được', c: 'src' },
               { t: '`入力` › `実績` — **hàng chi phí**', s: '売上原価 · 販管費 · 営業外 (chưa thuế)', c: 'in' },
               { t: '損益・勘定科目別', s: '', c: 'out' }],
              [{ t: '④ Hoá đơn (回収 › 売掛金)', s: 'Những hoá đơn đã có', c: 'src' },
               { t: '`実績` — **hàng doanh thu**', s: 'Tự động · màu xám · không sửa được', c: 'in' },
               { t: '損益・勘定科目別', s: '', c: 'out' }],
            ], note: '✕ **費用表 (dự kiến) và 支払請求 (lời hứa trả) không vào 実績** — vì chúng không phải số kế toán.' } },
            { h: 'Mỗi tháng làm thế này' },
            { check: 'Khi nhận được 試算表 của tháng trước', items: [
              'Mở `予実管理` › tab `入力` › bấm `実績`.',
              'Kiểm tra **năm tài chính** ở góc trên đúng năm chưa.',
              'Với từng tài khoản chi phí, gõ số **chưa thuế (税抜)** trong 試算表 vào **cột tháng đó**. Gõ xong là lưu.',
              'Hàng doanh thu (xám) không cần gõ. Nếu doanh thu sai → sửa ở hoá đơn (回収), không sửa ở đây.',
              'Nếu dự báo các tháng còn lại thay đổi → bấm `見込` và sửa.',
              'Mở tab `損益（予実対比）` để xem kết quả.',
            ] },
          ],
          note: 'Số trong `入力` luôn là **chưa thuế (税抜)**, dù nút xem ở góc phải đang để `税込`.',
        },
        {
          title: 'Nhập 実績 (thực tế)',
          screens: [{
            shot: 'yj_input_actual', maxH: 128,
            steps: [
              { mark: 'tab', text: 'Mở tab `入力`.' },
              { mark: 'seg', text: 'Bấm `実績`.' },
              { mark: 'help', text: 'Dòng giải thích ngay trên bảng — đổi theo nút đang chọn.' },
              { mark: 'rev', text: 'Nhóm `収益` (doanh thu) ghi `請求書から`: **tự động từ hoá đơn**, ô màu xám, không gõ được.' },
              { mark: 'cost', text: 'Các hàng chi phí: bấm vào ô của tháng và gõ số chưa thuế theo 試算表.' },
            ],
          }],
          tip: 'Kéo bảng sang phải để thấy các tháng cuối năm. Cột tên tài khoản bên trái luôn đứng yên.',
        },
        {
          title: 'Nhập 予算 (ngân sách)',
          screens: [{
            shot: 'yj_input_budget', maxH: 128,
            steps: [
              { mark: 'seg', text: 'Trong tab `入力`, bấm `予算`. Gõ số từng tháng như 実績.' },
              { mark: 'spread', text: '`年額をまとめて入力（12等分）`: gõ **số cả năm** của một tài khoản, hệ thống chia đều 12 tháng. **Số cũ trong các tháng sẽ bị ghi đè.**' },
              { mark: 'copy', text: '`ツール` › `前年実績から予算を作成`: tạo ngân sách từ **thực tế năm trước** rồi chỉnh lại.' },
            ],
          }],
          tip: '`見込` nhập giống hệt `予算`. Để trống tháng nào thì 着地見込 dùng ngân sách của tháng đó.',
        },
        {
          title: '期間比較 và 見込実績表',
          lead: 'Hai màn **chỉ để xem**, không nhập gì.',
          screens: [
            { shot: 'compare', maxH: 88, label: '期間比較 — so sánh các kỳ', steps: [
              { mark: 'metric', text: 'Chọn chỉ tiêu: doanh thu, lãi gộp, lợi nhuận kinh doanh, lợi nhuận thường xuyên.' },
              { mark: 'base', text: 'Chọn **tháng làm mốc**. Bảng so với ngân sách, tháng trước, cùng kỳ năm trước, luỹ kế quý / nửa năm / năm.' },
            ] },
            { shot: 'mikomi', maxH: 88, label: '見込実績表 — mẫu báo cáo họp', steps: [
              { mark: 'year', text: 'Tổng hợp cả năm: tháng này · luỹ kế · dự báo cả năm, so với ngân sách và năm trước. Bên dưới có từng quý.' },
            ] },
          ],
        },
        {
          title: '目標 OKR — mục tiêu',
          screens: [{
            shot: 'okr', maxH: 128,
            steps: [
              { mark: 'period', text: 'Chọn **quý** (VD `2025-Q4`).' },
              { mark: 'add', text: '`＋ 目標を追加`: tạo mục tiêu (cấp công ty / bộ phận / cá nhân).' },
              { mark: 'kr', text: 'Mỗi mục tiêu có các **Key Result**. Cột `取得元` ghi `自動` nghĩa là **con số tự lấy** từ 予実 hoặc 売掛金 — không cần gõ tay.' },
            ],
          }],
          tip: 'Khi tạo Key Result về doanh thu, lợi nhuận hay nợ quá hạn, hãy chọn loại **tự động**. Chép số bằng tay thì sớm muộn cũng lệch.',
        },
      ],
    },

    /* ================================================================== */
    {
      title: '回収（売掛金）— tiền phải thu',
      summary: 'Bảng số dư · xem theo quý / nửa năm / luỹ kế · lấy hoá đơn từ MF · ghi 入金 · 入金チェック · nhắc nợ',
      pages: [
        {
          title: 'Bảng 売掛金',
          lead: 'Mỗi hàng là một công ty, mỗi cột là một tháng. **Mỗi ô là số tiền công ty đó còn nợ vào cuối tháng.**',
          screens: [{
            shot: 'ar', maxH: 102,
            steps: [
              { mark: 'tabs', text: '4 màn: `売掛金` · `入金` · `入金チェック` · `督促（今日やること）`.' },
              { mark: 'add', text: '`＋ 入金を記録`: ghi tiền khách chuyển vào.' },
              { mark: 'mf', text: '`Money Forward から取り込む`: lấy hoá đơn từ MF (Admin / Manager).' },
              { mark: 'kpi', text: 'Tiền đã xuất hoá đơn, tiền đã thu, số dư và **số quá hạn** (bấm ô đỏ để chỉ xem công ty quá hạn).' },
              { mark: 'filter', text: '`未回収のみ` / `期限超過のみ`: chỉ hiện công ty còn nợ / đã quá hạn.' },
              { mark: 'per', text: 'Gom cột theo `月` · `四半期` · `上期・下期` · `通期` (trang sau).' },
              { mark: 'name', text: 'Bấm **tên công ty** → mở 売掛元帳 (sổ chi tiết).' },
              { mark: 'cell', text: 'Bấm **một ô** → xem hoá đơn và tiền vào của tháng đó.' },
              { mark: 'total', text: '`合計`: tổng số dư của tất cả công ty.' },
              { mark: 'flow', text: '`＋ 請求額`: tiền xuất hoá đơn trong tháng. `− 入金額`: tiền thu được trong tháng.' },
              { mark: 'now', text: 'Cột phải: `現在残高` (số dư hôm nay). Khi xem **năm cũ** → `7月末残高` (cuối năm đó).' },
            ],
          }],
          note: 'Màu chữ: **đỏ** = có khoản quá hạn · **đen đậm** = còn nợ nhưng chưa tới hạn · xám = đã thu đủ.',
        },
        {
          title: 'Xem theo quý, nửa năm, cả năm và luỹ kế',
          screens: [{
            shot: 'ar_q', maxH: 104,
            steps: [
              { mark: 'per', text: 'Chọn cách gom cột: `月` (tháng) · `四半期` (quý) · `上期・下期` (nửa năm) · `通期` (cả năm).' },
              { mark: 'cum', text: '`当期` = số **trong kỳ đó** · `累計` = số **cộng dồn từ đầu năm tài chính**.' },
              { mark: 'head', text: 'Tiêu đề cột ghi rõ kỳ gồm những tháng nào (VD `8月〜10月 Q1`).' },
              { mark: 'flow', text: 'Hai dòng dưới `合計` đổi theo nút `当期` / `累計`.' },
            ],
          }],
          blocks: [
            { h: 'Cách đọc' },
            { list: [
              '**Ô của công ty** = số dư **cuối kỳ** (tháng cuối của kỳ). Số dư **không cộng dồn** — nó vốn đã là số tích luỹ.',
              '**Kỳ đang diễn ra** (có tháng hiện tại) → lấy số dư hôm nay.',
              'Luôn đúng công thức: **số dư cuối kỳ = số dư kỳ trước + 請求 − 入金**. Ví dụ Q2 trong ảnh mẫu: 10,395,000 + 22,275,000 − 19,235,200 = **13,434,800**.',
              'Với `累計`: **請求 luỹ kế − 入金 luỹ kế = số dư** (VD cuối Q4: 88,000,000 − 77,266,200 = 10,733,800).',
              'Khi đã gom theo kỳ, bấm một ô sẽ mở **sổ chi tiết** (xem từng tháng ở đó).',
            ] },
          ],
          tip: 'Lựa chọn được **nhớ trên trình duyệt của bạn** và dùng chung cho cả 売掛金 và 買掛金. File CSV (`ツール` › `CSV出力`) luôn xuất **theo tháng**, kèm cột 請求額 và 入金額 từng tháng.',
        },
        {
          title: 'Xem chi tiết: một ô và sổ chi tiết (売掛元帳)',
          screens: [
            { shot: 'ar_pop', modal: true, maxH: 58, label: 'Bấm một ô', steps: [
              { mark: 'cell', text: 'Bấm vào một ô số dư.' },
              { mark: 'pop', text: 'Hộp nhỏ: số dư đầu tháng, hoá đơn và tiền vào **của tháng đó**, nguồn (`MF` / `手入力`).' },
            ] },
            { shot: 'ar_ledger', modal: true, maxH: 104, label: 'Bấm tên công ty', steps: [
              { mark: 'grade', text: '**Đánh giá** cách trả tiền: A = luôn đúng hạn … D = hay trễ.' },
              { mark: 'table', text: 'Từng tháng: `前月残高` + `請求額` − `入金額` = `月末残高`.' },
              { mark: 'pay', text: 'Ghi tiền vào ngay từ đây.' },
            ] },
          ],
          tip: 'In sổ chi tiết ra là có ngay **bảng đối chiếu công nợ** để gửi khách.',
        },
        {
          title: 'Lấy hoá đơn từ Money Forward',
          lead: 'Hoá đơn được làm ở **Money Forward クラウド請求書**. Hệ thống này chỉ lấy về **tên công ty, ngày, hạn, số tiền** — không lấy chi tiết hay PDF.',
          screens: [
            { shot: 'mf', modal: true, maxH: 70, label: 'Money Forward から取り込む', steps: [
              { mark: 'api', text: '**Cách 1 — qua API**: chọn khoảng ngày xuất hoá đơn.' },
              { mark: 'fetch', text: 'Bấm `請求書を取得`, kiểm tra danh sách rồi lưu.' },
              { mark: 'csv', text: '**Cách 2 — CSV**: xuất danh sách hoá đơn từ MF rồi kéo file vào đây.' },
            ] },
            { shot: 'arbill', maxH: 70, label: 'Hoá đơn không có trong MF', crop: 520, steps: [
              { mark: 'item', text: '`ツール` › `＋ 請求額を手入力（MF にない分）`: gõ tay số tiền cho hoá đơn **không làm ở MF**. Nhập cả `うち税抜` (phần chưa thuế) — đây là số vào doanh thu 予実.' },
            ] },
          ],
          note: 'Hoá đơn đã có trong MF thì **luôn lấy từ MF**, đừng gõ tay — sẽ bị tính hai lần.',
        },
        {
          title: 'Ghi tiền vào (入金を記録)',
          screens: [{
            shot: 'payment', modal: true, maxH: 70,
            steps: [
              { mark: 'date', text: '`入金日`: ngày tiền vào tài khoản (theo sao kê).' },
              { mark: 'co', text: '`取引先`: công ty đã chuyển tiền. Bên dưới hiện **số dư hiện tại** của công ty đó để đối chiếu.' },
              { mark: 'amt', text: '`入金額`: số tiền **thực nhận** trên sao kê.' },
              { mark: 'fee', text: '`振込手数料`: nếu khách **trừ phí chuyển khoản** trước khi chuyển, ghi phí đó ở đây. Số dư sẽ giảm cả phần phí.' },
              { mark: 'save', text: 'Bấm `保存`.' },
            ],
          }],
          blocks: [
            { h: 'Không cần chọn hoá đơn' },
            { p: 'Tiền vào được **trừ vào số dư của công ty**, tự động gán cho hoá đơn **cũ nhất** trước. Khách trả nhiều hơn → phần dư được giữ lại và trừ vào lần sau. Khách trả thiếu → phần thiếu vẫn nằm trong số dư.' },
          ],
          tip: 'Màn `入金` (tab thứ hai) là danh sách mọi khoản tiền vào. Bấm `修正` ở cuối dòng để sửa khi ghi nhầm.',
        },
        {
          title: 'Kiểm tra tiền vào (入金チェック)',
          screens: [{
            shot: 'archeck', maxH: 125,
            steps: [
              { mark: 'cards', text: 'Mỗi hoá đơn được xếp vào một nhóm: `全額・期日内` (đủ, đúng hạn) · `全額・遅れ` (đủ nhưng trễ) · `分割で全額` (trả nhiều lần) · `手数料を引いて` (trừ phí) · `過入金` (trả thừa) · `不足` (trả thiếu) · `未入金` (chưa trả) · `期日前` (chưa tới hạn). **Bấm một ô để lọc.**' },
            ],
          }],
          tip: 'Cuối tháng hãy xem `不足` và `過入金`: đó là những khách cần liên hệ để xác nhận.',
        },
        {
          title: 'Nhắc nợ (督促 — 今日やること)',
          screens: [
            { shot: 'dunning', maxH: 80, label: 'Danh sách hôm nay', steps: [
              { mark: 'filter', text: '`今日やる`: công ty **cần liên hệ hôm nay** (đến lịch nhắc, quá ngày hẹn trả…). `すべて`: mọi công ty đang quá hạn.' },
              { mark: 'mine', text: '`自分の担当だけ`: chỉ công ty do bạn phụ trách.' },
              { mark: 'row', text: 'Mỗi dòng: số quá hạn, số ngày trễ nhất, **mức nhắc** (`督促1` nhẹ nhàng → `督促3` gọi điện cho người phụ trách), lần liên hệ trước, ngày hẹn trả và **việc cần làm**.' },
              { mark: 'rec', text: 'Liên hệ xong bấm `記録`.' },
            ] },
            { shot: 'dunlog', modal: true, maxH: 62, label: 'Ghi lại lần liên hệ', steps: [
              { mark: 'method', text: 'Chọn cách liên hệ (điện thoại, mail, gặp trực tiếp…) và ghi **đã nói gì, với ai**.' },
              { mark: 'promise', text: 'Khách hẹn ngày trả → nhập **ngày hẹn** và **số tiền**. Ngày cần liên hệ lại tự đặt là hôm sau ngày hẹn.' },
            ] },
          ],
          tip: 'Nút ✉ cạnh `記録` mở mẫu mail nhắc nợ theo đúng mức 督促.',
        },
      ],
    },

    /* ================================================================== */
    {
      title: '支払（買掛金）— tiền phải trả',
      summary: 'Bảng số dư · đăng ký 支払請求 · khoản định kỳ hằng tháng · ghi 支払 · 資金繰り',
      pages: [
        {
          title: 'Bảng 買掛金',
          lead: 'Giống hệt 売掛金 nhưng theo chiều ngược lại: **mỗi ô là số BIGLIGHT còn nợ nhà cung cấp vào cuối tháng.**',
          screens: [{
            shot: 'ap', maxH: 122,
            steps: [
              { mark: 'tabs', text: '4 màn: `買掛金` · `支払請求` · `支払実行` · `資金繰り`.' },
              { mark: 'pay', text: '`＋ 支払を記録`: ghi tiền BIGLIGHT đã chuyển.' },
              { mark: 'bill', text: '`＋ 支払請求を登録`: đăng ký hoá đơn nhận được.' },
              { mark: 'kpi', text: 'Hoá đơn phải trả, tiền đã trả, số dư và **số quá hạn** của tháng.' },
              { mark: 'total', text: '`合計` và hai dòng `＋ 支払請求` / `− 支払` — đọc giống 売掛金. Nút `四半期` / `累計`… cũng giống.' },
            ],
          }],
          note: 'Hoá đơn ở trạng thái `作成中` (đang soạn) **chưa vào bảng này**. Khung vàng phía trên sẽ nhắc nếu còn hoá đơn chưa `確定`.',
        },
        {
          title: 'Khoản trả định kỳ mỗi tháng',
          lead: 'Tiền nhà, thuê ngoài, quảng cáo… đã khai báo là `買掛` trong 費用表 thì **không phải đăng ký tay từng tháng**.',
          screens: [
            { shot: 'bills', maxH: 76, label: 'Màn 支払請求', steps: [
              { mark: 'gen', text: 'Bấm `定期の支払を作成（月まとめ）`.' },
              { mark: 'status', text: 'Hoá đơn vừa tạo ở trạng thái `作成中`. Kiểm tra rồi bấm `確定` ở cuối dòng.', badge: 'right' },
            ] },
            { shot: 'genbills', modal: true, maxH: 70, label: 'Hộp thoại tạo', steps: [
              { mark: 'month', text: 'Chọn **tháng** (計上月). Danh sách gom theo nhà cung cấp; số tiền lấy từ 費用表 của tháng đó (không có thì lấy 月額).' },
              { mark: 'go', text: 'Bấm `この内容で作成`.' },
            ] },
          ],
          note: 'Chỉ sau khi `確定` hoá đơn mới vào 買掛金 và có hạn trả. Đã `確定` thì **không xoá được**, chỉ `取消` (huỷ).',
        },
        {
          title: 'Đăng ký một hoá đơn phải trả',
          screens: [{
            shot: 'bill_form', modal: true, maxH: 120,
            steps: [
              { mark: 'co', text: '`支払先`: nhà cung cấp gửi hoá đơn.' },
              { mark: 'book', text: '`計上月`: tháng mà khoản chi **thuộc về** (không phải tháng trả tiền).' },
              { mark: 'due', text: '`支払期日`: hạn phải trả. Nếu `計上月` đã có sẵn khi chọn `支払先`, hạn tự điền theo 締日・サイト của nhà cung cấp — sửa được.' },
              { mark: 'lines', text: '`＋ 行を追加`: thêm từng dòng — tài khoản, nội dung, số lượng, đơn giá, thuế.' },
            ],
          }],
          tip: 'Đặt `状態` là `確定` rồi `保存` nếu đã chắc chắn. Để `作成中` nếu còn phải kiểm tra.',
        },
        {
          title: 'Ghi tiền đã trả (支払を記録)',
          screens: [{
            shot: 'payout', modal: true, maxH: 100,
            steps: [
              { mark: 'co', text: '`支払先`: chọn nhà cung cấp. Danh sách hoá đơn chưa trả của họ hiện ra bên dưới.' },
              { mark: 'amt', text: '`支払額`: số tiền đã chuyển.' },
              { mark: 'auto', text: '`期日の古い順に自動で割り当て`: tự gán tiền cho hoá đơn **hạn sớm nhất** trước.' },
              { mark: 'alloc', text: 'Hoặc tự gõ số tiền vào cột `消込額` của từng hoá đơn. Một lần chuyển có thể trả nhiều hoá đơn.' },
              { mark: 'save', text: 'Kiểm tra `未消込 0` rồi bấm `保存`.' },
            ],
          }],
        },
        {
          title: 'Dòng tiền (資金繰り)',
          screens: [{
            shot: 'cashflow', maxH: 126,
            steps: [
              { mark: 'seg', text: 'Xem theo `週ごと（12週）` hoặc `月ごと（12か月）`.' },
              { mark: 'start', text: '`開始残高を設定`: nhập **số dư tài khoản ngân hàng hiện tại**. Không có số này thì cột số dư dự kiến sẽ không đúng.' },
            ],
          }],
          blocks: [
            { p: 'Bảng tự tính: **tiền sẽ vào** (theo hạn của hoá đơn đã gửi khách) − **tiền sẽ ra** (theo hạn của 支払請求) → **số dư dự kiến** từng tuần / tháng. Không cần nhập gì thêm.' },
          ],
          tip: 'Nếu có tuần nào số dư dự kiến thấp, hãy xem sớm để kịp xoay tiền.',
        },
      ],
    },

    /* ================================================================== */
    {
      title: '費用 — chi phí dự kiến',
      summary: '費用表 (bảng dự kiến) · tạo khoản chi · 物件 (toà nhà thuê)',
      pages: [
        {
          title: '費用表 — bảng chi phí dự kiến',
          lead: 'Đây là **kế hoạch chi tiêu** 12 tháng, theo cây tài khoản (lớn › vừa › nhỏ › khoản chi). Số ở đây **đã gồm thuế** và **không phải thực tế**.',
          screens: [{
            shot: 'expenses', maxH: 114,
            steps: [
              { mark: 'add', text: '`＋ 対象を追加`: thêm một khoản chi (tiền nhà, lương, thuê ngoài…).' },
              { mark: 'grp', text: 'Bấm hàng tài khoản (▼) để **đóng / mở** các khoản bên dưới.' },
              { mark: 'cell', text: 'Bấm một ô và **gõ số dự kiến** của tháng đó. Gõ xong là lưu. Xoá trống hoặc gõ 0 = bỏ số của tháng đó.' },
              { mark: 'r12', text: '`→12`: điền các **ô trống** từ tháng này tới cuối năm (lấy số của tháng gần nhất bên trái, không có thì lấy 月額). Ô đã có số giữ nguyên.' },
              { mark: 'all12', text: '`定期をすべて→12`: làm như trên cho **mọi khoản định kỳ** cùng lúc.' },
              { mark: 'badge', text: 'Nhãn `買掛`: khoản này sẽ tạo 支払請求 mỗi tháng (xem chương 支払).' },
            ],
          }],
          tip: 'Bảng có nhiều cột — kéo ngang để xem các tháng cuối năm. Cột tên khoản bên trái luôn đứng yên, các dòng tổng không bị che.',
          note: 'Muốn biết **đã chi thực tế** bao nhiêu → xem `予実管理` (số từ 試算表), không xem ở đây.',
        },
        {
          title: 'Tạo một khoản chi (対象)',
          screens: [{
            shot: 'costitem', modal: true, maxH: 118,
            steps: [
              { mark: 'name', text: '`対象名`: tên dễ hiểu, VD “Tiền nhà ký túc xá A”.' },
              { mark: 'acc', text: '`勘定科目`: tài khoản kế toán. Chỉ chọn được tài khoản **cấp nhỏ nhất**. Thiếu tài khoản → `設定` › `勘定科目の登録`.' },
              { mark: 'kind', text: '`区分`: `定期` (tháng nào cũng như nhau) hoặc `変動` (mỗi tháng một khác).' },
              { mark: 'pay', text: '`払い方`: `即払い` (trả ngay, không theo dõi hoá đơn) hoặc `買掛` (**tạo 支払請求 mỗi tháng** và theo dõi hạn trả). Chọn `買掛` thì phải chọn `支払先`.' },
              { mark: 'amt', text: '`月額（税込）`: số tiền mỗi tháng đã gồm thuế. Có thể nhập thêm `物件`, tháng bắt đầu / kết thúc.' },
            ],
          }],
        },
        {
          title: '物件（建物）— toà nhà đang thuê',
          screens: [{
            shot: 'properties', maxH: 124,
            steps: [
              { mark: 'add', text: '`＋ 物件を追加`: nhập toà nhà (ký túc xá, văn phòng, bãi xe), chủ nhà, thời hạn hợp đồng, tiền nhà, phí chung, phí đỗ xe.' },
              { mark: 'alert', text: 'Hợp đồng **sắp hết hạn** (còn dưới 90 ngày) được nhắc ở đây và trên chuông.' },
            ],
          }],
          blocks: [
            { p: 'Số tiền từng tháng của một toà nhà lấy từ **費用表**: khi tạo khoản chi (tiền nhà, điện, nước…), chọn `物件` là toà nhà đó thì số sẽ gom về đây.' },
          ],
        },
      ],
    },

    /* ================================================================== */
    {
      title: '取引先 — khách hàng và nhà cung cấp',
      summary: 'Danh sách · thêm mới · điều kiện thanh toán',
      pages: [
        {
          title: 'Danh sách đối tác',
          screens: [{
            shot: 'companies', maxH: 124,
            steps: [
              { mark: 'tabs', text: '`一覧（すべて）`: tất cả · `支払先`: chỉ nhà cung cấp (BIGLIGHT trả tiền cho họ).' },
              { mark: 'add', text: '`＋ 取引先を追加`: thêm đối tác.' },
              { mark: 'filter', text: 'Bấm ▼ ở tiêu đề cột để lọc. Cột `支払いぶり` cho biết họ trả / nhận tiền đúng hạn đến đâu.' },
            ],
          }],
          blocks: [
            { p: 'Khách hàng (所属機関) được **đồng bộ từ CRM** (`設定` › `CRM連携`): tên, địa chỉ, người liên hệ. Các mục kế toán như ngày chốt, hạn trả, tài khoản ngân hàng **chỉ nhập ở đây** và không bị CRM ghi đè.' },
          ],
          note: 'Cột `請求ルール` và lời nhắc “chưa có 請求ルール” là của chức năng **tự tạo hoá đơn**, hiện không dùng vì hoá đơn làm ở Money Forward. **Không cần thiết lập.**',
        },
        {
          title: 'Thêm / sửa đối tác',
          screens: [{
            shot: 'company_form', modal: true, maxH: 112,
            steps: [
              { mark: 'kind', text: '`区分`: `得意先` (khách hàng — BIGLIGHT **nhận** tiền) · `支払先` (nhà cung cấp — BIGLIGHT **trả** tiền) · `両方` (cả hai). Các ô bên dưới đổi theo lựa chọn này.' },
              { mark: 'terms', text: '**Điều kiện thanh toán**: `締日` (ngày chốt, 31 = cuối tháng) · `サイト` (sau mấy tháng, 1 = tháng sau) · ngày trả · xử lý khi rơi vào ngày nghỉ. Dòng ví dụ bên dưới cho biết hạn trả sẽ là ngày nào.' },
              { mark: 'owner', text: '`BIGLIGHT担当者`: người phụ trách (dùng cho doanh thu theo người và danh sách nhắc nợ của từng người).' },
            ],
          }],
          tip: 'Nhập đúng 締日・サイト một lần là **hạn thanh toán của mọi hoá đơn** sau này tự tính đúng.',
        },
      ],
    },

    /* ================================================================== */
    {
      title: '設定 — cài đặt',
      summary: 'Tài khoản kế toán · cài đặt cơ bản · người dùng (dành cho quản trị viên)',
      pages: [
        {
          title: 'Tài khoản kế toán (勘定科目の登録)',
          screens: [{
            shot: 'accounts', maxH: 128,
            steps: [
              { mark: 'add', text: '`＋ 大分類を追加`: thêm nhóm lớn. Phân loại (doanh thu / giá vốn / chi phí bán hàng & quản lý / ngoài kinh doanh) quyết định ở **nhóm lớn**.' },
              { mark: 'row', text: 'Mỗi dòng: `＋子` thêm cấp con · `編集` sửa · `↑` `↓` đổi thứ tự. Cột `使用中` cho biết đang được dùng bao nhiêu lần.' },
            ],
          }],
          note: 'Chỉ **tài khoản cấp nhỏ nhất** mới chọn được khi nhập. Không đổi mã (コード) của tài khoản đang dùng.',
        },
        {
          title: 'Cài đặt cơ bản (基本設定)',
          screens: [{
            shot: 'settings', maxH: 132,
            steps: [
              { mark: 'cash', text: '`資金繰りの開始残高`: số dư ngân hàng dùng cho 資金繰り. Bấm `変更` để cập nhật.' },
              { mark: 'demo', text: '**Dữ liệu mẫu** (tên bắt đầu bằng 【デモ】): `デモデータを作り直す` / `デモデータを全部消す`. Chỉ xoá dòng có dấu mẫu, không đụng dữ liệu thật.' },
              { mark: 'cache', text: '`キャッシュを消して再読み込み`: khi màn hình hiển thị sai hoặc cũ.' },
            ],
          }],
          note: 'Trên hệ thống thật, **không** bấm `デモデータを作り直す` nếu không có mục đích — màn hình sẽ lẫn dữ liệu mẫu.',
        },
        {
          title: 'Người dùng (ユーザー)',
          screens: [{
            shot: 'users', maxH: 122,
            steps: [
              { mark: 'pending', text: 'Người mới đăng nhập nằm ở `承認待ち` (chờ duyệt) và **chưa xem được gì**. Bấm `見せる画面を決める` để chọn màn hình được xem, rồi `有効にする`. Không đồng ý thì `断る`.' },
            ],
          }],
          blocks: [
            { h: 'Các màn khác trong 設定' },
            { head: ['Màn', 'Dùng để'], table: [
              ['`CRM連携`', 'Lấy danh sách khách hàng (所属機関) từ CRM. Bấm `今すぐ同期`.'],
              ['`API・AI連携`', 'Cấp khoá cho hệ thống khác / AI **đọc** số liệu (chỉ đọc). Mỗi người một khoá.'],
              ['`操作履歴`', 'Ai sửa gì, lúc nào, thành bao nhiêu. **Khôi phục** được dữ liệu đã xoá.'],
            ] },
          ],
        },
      ],
    },

    /* ================================================================== */
    {
      title: 'Lịch làm việc và hỏi đáp',
      summary: 'Việc hằng ngày / hằng tháng / đầu năm · câu hỏi thường gặp',
      pages: [
        {
          title: 'Việc cần làm theo lịch',
          blocks: [
            { check: 'Mỗi ngày', items: [
              'Mở **chuông** — xem danh sách `やること`.',
              '`回収` › `督促（今日やること）` → liên hệ các công ty trong `今日やる`, bấm `記録` sau mỗi lần liên hệ.',
              'Có tiền vào → `＋ 入金を記録`. Có chuyển tiền đi → `＋ 支払を記録`.',
            ] },
            { check: 'Đầu mỗi tháng', items: [
              '`回収` › `Money Forward から取り込む` → lấy hoá đơn tháng trước.',
              '`支払` › `支払請求` › `定期の支払を作成（月まとめ）` → kiểm tra → `確定`.',
              'Hoá đơn phải trả khác nhận được → `＋ 支払請求を登録`.',
              '`回収` › `入金チェック` → xem `不足` / `過入金` / `未入金`.',
            ] },
            { check: 'Khi nhận được 試算表 của văn phòng kế toán', items: [
              '`予実管理` › `入力` › `実績` → gõ chi phí tháng đó (chưa thuế).',
              'Cập nhật `見込` nếu dự báo thay đổi.',
              'Xem `損益（予実対比）` và `見込実績表` → chuẩn bị họp.',
            ] },
            { check: 'Đầu năm tài chính (tháng 8)', items: [
              'Đổi năm ở góc trên sang năm mới.',
              '`予実管理` › `入力` › `予算` → lập ngân sách (có thể `前年実績から予算を作成`).',
              '`費用` › `費用表` → kiểm tra các khoản chi, bấm `定期をすべて→12`.',
              '`取引先` → kiểm tra điều kiện thanh toán, người phụ trách.',
              '`設定` › `基本設定` → cập nhật `資金繰りの開始残高`.',
              '`目標 OKR` → đặt mục tiêu quý.',
            ] },
          ],
        },
        {
          title: 'Câu hỏi thường gặp',
          blocks: [
            { qa: [
              ['Tôi đã gõ số vào **費用表** nhưng **予実** không đổi?',
                'Đúng như thiết kế. 費用表 là **dự kiến**. Chi phí thực tế nhập ở `予実管理` › `入力` › `実績` theo 試算表.'],
              ['Ghi **入金** rồi mà doanh thu không tăng?',
                'Đúng. Doanh thu tính theo **hoá đơn** (計上月), không theo ngày nhận tiền. 入金 chỉ làm giảm số dư phải thu.'],
              ['Số `請求額` ở 売掛金 khác doanh thu ở 予実?',
                '`請求額` là **toàn bộ hoá đơn, đã gồm thuế**. Doanh thu 予実 chỉ tính **phần doanh thu, chưa thuế**. Hai số khác nhau là bình thường.'],
              ['Đổi sang năm cũ thì các ô số trên cùng của 売掛金 đổi nhãn?',
                'Khi xem năm cũ, các ô và cột bên phải lấy **cuối năm đó** (VD `7月末残高`) để cả màn hình cùng một mốc thời gian. Xem năm hiện tại thì là **hôm nay** (`現在残高`).'],
              ['Không thấy một màn hình hoặc một nút?',
                'Do **quyền** của tài khoản. Hỏi quản trị viên (`設定` › `ユーザー`).'],
              ['Màn hình hiển thị cũ, hoặc số không cập nhật?',
                'Tải lại trang bằng **Cmd + Shift + R** (Mac) / **Ctrl + Shift + R** (Windows). Vẫn chưa được → `設定` › `基本設定` › `キャッシュを消して再読み込み`.'],
              ['Lỡ xoá hoặc sửa nhầm?',
                'Báo quản trị viên: `設定` › `操作履歴` lưu mọi thay đổi và **khôi phục** được. Chứng từ đã `確定` không xoá được, chỉ `取消`.'],
              ['Dòng nào có chữ **【デモ】**?',
                'Là **dữ liệu mẫu**, không phải thật. Quản trị viên xoá được bằng `デモデータを全部消す`.'],
              ['Kéo bảng sang ngang thì có mất số không?',
                'Không. Cột tên bên trái và cột số dư bên phải **đứng yên**, các cột tháng trượt bên dưới. Muốn thấy cả năm trên một màn → chọn `四半期` hoặc `上期・下期`.'],
            ] },
          ],
        },
      ],
    },
  ],

  contact: {
    title: 'Liên hệ',
    lines: [
      '**Quyền truy cập, tài khoản, lỗi hệ thống**',
      'Quản trị viên hệ thống: n-tung@biglight.jp',
      '',
      '**Cách hỏi nhanh nhất**',
      'Chụp màn hình đang gặp vấn đề, ghi rõ: bạn đang ở màn nào, đã bấm gì, mong đợi gì.',
      '',
      '**Trong hệ thống**',
      'Bấm biểu tượng quyển sách (`入力ガイド`) ở thanh trên cùng để xem hướng dẫn ngắn của màn đang mở.',
    ],
  },
}
