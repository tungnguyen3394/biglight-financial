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
              ['`第N期` · `四半期` · `上期` `下期` · `通期`', 'Kỳ (năm tài chính) · quý · nửa đầu, nửa sau năm · cả năm', '**1/8 → 31/7 năm sau**. 第5期 = 2025/8〜2026/7'],
              ['`前期` · `締め`', 'Kỳ trước · khoá kỳ', ''],
              ['`累計`', 'Luỹ kế', 'Cộng dồn từ đầu năm tài chính'],
              ['`督促`', 'Nhắc nợ', ''],
              ['`証憑` · `証憑なし`', 'File chứng từ gốc · chưa có file', 'Hoá đơn PDF, sao kê chuyển khoản, biên lai, hợp đồng'],
              ['`差額` · `手数料差引き` · `不足`', 'Chênh lệch · bị trừ phí chuyển khoản · trả thiếu', 'Ngưỡng 1,000 yên'],
              ['`先方負担` · `当社負担`', 'Khách chịu · BIGLIGHT chịu', 'Ai chịu phí chuyển khoản'],
              ['`税区分`', 'Loại thuế', '`課税10%` · `軽減8%` · `非課税` (miễn thuế) · `対象外` (không thuộc diện thuế)'],
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
              { mark: 'fy', text: '**Chọn kỳ** (`第5期` = 1/8/2025 → 31/7/2026) bằng ◀ ▶ hoặc danh sách. Mọi bảng đổi theo; **chỉ nhập được ngày trong kỳ đang chọn**.' },
              { mark: 'cmp', text: '`前期と比べる`: hiện số kỳ trước và % tăng giảm ở các bảng.' },
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
              { mark: 'att', text: '`証憑（ファイル）が無い伝票`: chứng từ 3 tháng gần nhất **chưa có file**. Bấm để mở danh sách đã lọc sẵn.' },
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
      title: '期 — kỳ kế toán',
      summary: 'Chuyển kỳ · chỉ nhập trong kỳ · so sánh với kỳ trước · khoá kỳ (締め)',
      pages: [
        {
          title: 'Chuyển kỳ và so sánh với kỳ trước',
          lead: 'BIGLIGHT tính kỳ từ **1/8 đến 31/7 năm sau**. 2025/8〜2026/7 là **第5期**.',
          screens: [{
            shot: 'period_cmp', maxH: 104,
            steps: [
              { mark: 'bar', text: '◀ ▶ hoặc chọn trong danh sách để **đổi kỳ**. Kỳ đã khoá có 🔒. Mọi màn hình đổi theo kỳ này.' },
              { mark: 'cmp', text: '`前期と比べる`: bật / tắt so sánh (máy nhớ lựa chọn).' },
              { mark: 'cell', text: 'Dưới mỗi số: `前` = số của **cùng tháng kỳ trước**, và **% tăng giảm**.' },
              { mark: 'tot', text: 'Cột tổng: so **luỹ kế đến cùng tháng** (kỳ đang chạy dở không bị so với cả năm kỳ trước).', badge: 'right' },
            ],
          }],
          blocks: [
            { p: 'Màu theo **ý nghĩa**: doanh thu, lợi nhuận tăng → **xanh** ▲; chi phí, số dư phải thu tăng → **đỏ**. Có ở `予実管理` (損益・勘定科目別), `売掛金` / `買掛金` (dòng tổng và 請求 / 入金), `費用表` (so với dự kiến kỳ trước), `ダッシュボード`, `差額`.' },
            { p: 'Sang kỳ mới: số dư phải thu / phải trả **tự chuyển sang**. `費用表` › `ツール` › `第N期の予定をコピー` lấy dự kiến kỳ trước làm điểm bắt đầu; `予実管理` › `ツール` › `前年実績から予算を作成` cho ngân sách.' },
          ],
        },
        {
          title: 'Chỉ nhập được dữ liệu của kỳ đang chọn',
          lead: 'Ví dụ đang xem **第5期** mà ghi tiền vào ngày 2026/9/10 (thuộc **第6期**) → hệ thống chặn.',
          screens: [{
            shot: 'period_guard', modal: true, maxH: 60,
            steps: [
              { mark: 'msg', text: 'Lý do: ngày nằm ngoài kỳ đang chọn, thuộc kỳ nào.' },
              { mark: 'go', text: 'Bấm để **chuyển sang kỳ đúng** — form đang nhập vẫn giữ nguyên, bấm `保存` lại là xong.' },
            ],
          }],
          blocks: [
            { list: [
              'Áp dụng cho: `入金`, `支払`, `請求` (nhập tay / CSV / Money Forward), `支払請求`, `費用表`, `予実管理` › `入力`.',
              'Ngày mặc định trong form: hôm nay nếu thuộc kỳ đang chọn; nếu xem kỳ cũ thì là **31/7** (cuối kỳ).',
              'Lấy hoá đơn từ Money Forward: hoá đơn ngoài kỳ **không được lấy** (có ghi số lượng) — chuyển kỳ rồi lấy lại.',
            ] },
          ],
        },
        {
          title: 'Khoá kỳ (締め)',
          lead: 'Khi đã chốt sổ với văn phòng kế toán, **Admin** khoá kỳ đó để không ai sửa nhầm.',
          screens: [{
            shot: 'period_close', modal: true, maxH: 100,
            steps: [
              { mark: 'closed', text: 'Kỳ đã khoá: 🔒 `締め済み（見るだけ）`. Mọi màn hình của kỳ này có dải thông báo và **không nhập / sửa / xoá được** — kể cả Admin.' },
              { mark: 'btn', text: '`第N期を締める`: khoá kỳ (chỉ kỳ đã qua; không khoá được kỳ hiện tại).' },
              { mark: 'first', text: '`第1期を変える`: nếu cách đánh số kỳ khác (mặc định 第1期 = 2021/8).' },
            ],
          }],
          note: 'Cần sửa kỳ đã khoá → Admin bấm `締めを外す`, sửa xong khoá lại. Mọi lần khoá / mở đều được ghi lại. File chứng từ (📎) vẫn đính thêm được vào kỳ đã khoá.',
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
              { mark: 'seg', text: 'Chọn xem `予実対比` (thực tế + ngân sách + chênh lệch) hoặc chỉ `実績` / `予算` / `見込`. Trong `予実対比`, **tháng chưa có thực tế hiện `見` + số 見込** (chữ nghiêng).' },
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
              { mark: 'kpi', text: 'Tiền đã xuất hoá đơn, tiền đã thu, số dư và **số quá hạn** (bấm ô đỏ để chỉ xem công ty quá hạn).' },
              { mark: 'tools', text: '`ツール`: sắp xếp, lọc, nhập hoá đơn, CSV, Money Forward, xuất file (trang sau).' },
              { mark: 'filter', text: 'Tìm công ty. Bên cạnh hiện **chip** các bộ lọc đang bật — bấm × để bỏ.' },
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
          title: 'Xem chi tiết một ô',
          screens: [
            { shot: 'ar_pop', modal: true, maxH: 80, steps: [
              { mark: 'cell', text: 'Bấm vào một ô số dư trong bảng 売掛金.' },
              { mark: 'pop', text: 'Hộp nhỏ: số dư đầu tháng, hoá đơn (có **loại thuế**) và tiền vào **của tháng đó**, nguồn (`MF` / `手入力`). Bấm 📎 ở mỗi dòng để xem file.' },
            ] },
          ],
        },
        {
          title: 'Sổ chi tiết (売掛元帳) và file chứng từ',
          lead: 'Bấm **tên công ty** trong bảng 売掛金. Sổ chi tiết của 買掛金 (`買掛元帳`) dùng y hệt.',
          screens: [
            { shot: 'ar_ledger', modal: true, maxH: 118, steps: [
              { mark: 'grade', text: '**Đánh giá** cách trả tiền: A = luôn đúng hạn … D = hay trễ.' },
              { mark: 'col', text: 'Cột `証憑`: số file của tháng. Chữ đỏ `証憑なし` = có chứng từ **chưa có file**.', badge: 'right' },
              { mark: 'row', text: '**Bấm vào dòng tháng** (▶) để mở danh sách từng chứng từ của tháng đó.' },
              { mark: 'det', text: 'Mỗi dòng: `請求` (hoá đơn) hoặc `入金` (tiền vào), ngày, số, số tiền. Bấm 📎 để **xem file ngay** hoặc đính thêm.' },
              { mark: 'miss', text: 'Tháng có chứng từ thiếu file → bấm dòng tháng rồi bấm `証憑なし` để đính.', badge: 'right' },
              { mark: 'pay', text: 'Ghi tiền vào ngay từ đây.' },
            ] },
          ],
          tip: 'Công thức mỗi tháng: `前月残高` + `請求額（税込）` − `入金額` = `月末残高`. In sổ chi tiết ra là có ngay **bảng đối chiếu công nợ** để gửi khách.',
        },
        {
          title: 'Menu ツール của 売掛金',
          lead: 'Mọi chức năng phụ gom vào nút `ツール`. Bên ngoài chỉ còn `＋ 入金を記録` (dùng hằng ngày).',
          screens: [{
            shot: 'arbill', modal: true, maxH: 118,
            steps: [
              { mark: 'sort', text: '**並び順**: quá hạn lên trên · số dư lớn nhất · tên công ty · người phụ trách.' },
              { mark: 'filt', text: '**絞り込み**: `未回収のみ` (còn nợ) · `期限超過のみ` (quá hạn).' },
              { mark: 'owner', text: '**担当**: chỉ xem công ty của một người phụ trách.' },
              { mark: 'item', text: '`＋ 請求を手入力（複数行）`: nhập hoá đơn không có trong MF (trang sau).' },
              { mark: 'tpl', text: '`CSVテンプレート`: tải file mẫu để điền nhiều hoá đơn bằng Excel.' },
              { mark: 'up', text: '`CSVを取り込む`: tải file lên → mở bảng nhập để **kiểm tra trước khi lưu**.' },
              { mark: 'mf', text: '`Money Forward から取り込む` (Admin / Manager).' },
              { mark: 'out', text: 'Xuất CSV (theo tháng, kèm 請求額 / 入金額) · In.' },
            ],
          }],
        },
        {
          title: 'Nhập nhiều hoá đơn một lần',
          lead: 'Mỗi dòng là một hoá đơn. Dùng cho hoá đơn **không làm ở Money Forward**.',
          screens: [{
            shot: 'ab_bulk', modal: true, maxH: 92,
            steps: [
              { mark: 'co', text: 'Chọn **取引先** → `税区分` và `入金期日` tự điền theo công ty. Nếu công ty đã có hoá đơn cùng tháng sẽ hiện ⚠.' },
              { mark: 'tax', text: '`税区分`: `課税10%` · `軽減8%` · `非課税` · `対象外（不課税）`. Khoản không chịu thuế thì **税抜 = 税込** — doanh thu 予実 không bị trừ thuế oan.' },
              { mark: 'auto', text: '`税抜` **tự tính** (ô xám). Gõ tay nếu hoá đơn lẫn nhiều loại thuế.', badge: 'right' },
              { mark: 'due', text: '`入金期日` tự tính theo 締日・サイト, sửa được.', badge: 'right' },
              { mark: 'bad', text: 'Dòng **đỏ** = thiếu thông tin (VD tên công ty trong CSV không tìm thấy) → chọn lại. Dòng đỏ không được lưu.' },
              { mark: 'add', text: '`＋ 行を追加`: thêm dòng trống (giữ tháng và ngày).' },
              { mark: 'copy', text: '`↓ 最後の行をコピー`: chép nguyên dòng cuối.' },
              { mark: 'del', text: '× xoá dòng.', badge: 'right' },
              { mark: 'save', text: 'Nút hiện **số dòng sẽ lưu**. Bấm để lưu; dòng lỗi được giữ lại để sửa tiếp.', badge: 'right' },
            ],
          }],
          blocks: [
            { h: 'Nhập bằng CSV' },
            { list: [
              '`ツール` › `CSVテンプレート` → mở bằng Excel, điền từ dòng 2 (dòng bắt đầu bằng `例）` sẽ bị bỏ qua).',
              'Cột bắt buộc: `取引先名` · `計上月` · `請求額(税込)`. Để trống `税抜` / `入金期日` / `請求番号` → tự tính.',
              '`ツール` › `CSVを取り込む` → bảng trên hiện ra → kiểm tra → lưu.',
            ] },
          ],
          note: 'File chứng từ (PDF hoá đơn) đính **sau khi lưu**, bằng 📎 trong sổ chi tiết.',
        },
        {
          title: 'Lấy hoá đơn từ Money Forward',
          lead: 'Hoá đơn được làm ở **Money Forward クラウド請求書**. Mở: `ツール` › `Money Forward から取り込む`. Hệ thống chỉ lấy về **tên công ty, ngày, hạn, số tiền** — không lấy chi tiết hay PDF.',
          screens: [
            { shot: 'mf', modal: true, maxH: 70, steps: [
              { mark: 'api', text: '**Cách 1 — qua API**: chọn khoảng ngày xuất hoá đơn.' },
              { mark: 'fetch', text: 'Bấm `請求書を取得`, kiểm tra danh sách rồi lưu.' },
              { mark: 'csv', text: '**Cách 2 — CSV**: xuất danh sách hoá đơn từ MF rồi kéo file vào đây.' },
            ] },
          ],
          blocks: [
            { p: '**Công ty trên hoá đơn MF**: khớp được thì dùng luôn; không có công ty nào giống thì **tự tạo 得意先** (hoá đơn vào 回収 ngay); có công ty na ná thì hoá đơn **chờ** ở `取引先` › `取引先の確認` (xem chương 取引先).' },
            { p: 'Hoá đơn lấy từ MF được **tự gắn loại thuế**: nếu 税込 = 税抜 thì là `対象外` (hoặc `非課税` theo 取引先), tỉ lệ 10% → `課税10%`, 8% → `軽減8%`, lẫn nhiều loại → `混在`.' },
          ],
          note: 'Hoá đơn đã có trong MF thì **luôn lấy từ MF**, đừng gõ tay — sẽ bị tính hai lần. Nếu lỡ có cả hai (cùng công ty, cùng tháng), `請求の確認` sẽ báo `二重の疑い`: bấm `置き換える` (huỷ hoá đơn gõ tay, giữ bản MF) hoặc `別物` (hai hoá đơn khác nhau). File PDF của hoá đơn MF **không tự lấy về** — đính tay bằng 📎.',
        },
        {
          title: 'Ghi tiền vào (入金を記録)',
          screens: [{
            shot: 'payment', modal: true, maxH: 96,
            steps: [
              { mark: 'date', text: '`入金日`: ngày tiền vào tài khoản (theo sao kê).' },
              { mark: 'co', text: '`取引先`: công ty đã chuyển tiền. Bên dưới hiện **số dư hiện tại** của công ty đó để đối chiếu.' },
              { mark: 'amt', text: '`入金額`: số tiền **thực nhận** trên sao kê.' },
              { mark: 'diff', text: '**Ô so sánh tự hiện**: `請求の残り − 入金 = 差額`. Thiếu ≤ 1,000 yên → **trừ phí chuyển khoản**; thiếu nhiều hơn → **trả thiếu**. Không cần gõ phí.' },
              { mark: 'files', text: '**File chứng từ**: kéo thả sao kê / giấy báo có, chọn loại (`振込明細`…). File được gửi sau khi lưu.' },
              { mark: 'save', text: 'Bấm `保存`.' },
            ],
          }],
          blocks: [
            { h: 'Không cần chọn hoá đơn' },
            { p: 'Tiền vào được **trừ vào số dư của công ty**, tự động gán cho hoá đơn **cũ nhất** trước (các khoản lẻ do trừ phí được để sau cùng). Khách trả nhiều hơn → phần dư được giữ lại và trừ vào lần sau. Khách trả thiếu → phần thiếu vẫn nằm trong số dư.' },
          ],
          tip: 'Màn `入金` (tab thứ hai) là danh sách mọi khoản tiền vào; cột `差額` hiện nhãn đỏ `手数料差引き` khi khách trừ phí. Bấm `修正` để sửa khi ghi nhầm.',
        },
        {
          title: 'Kiểm tra tiền vào (入金チェック)',
          screens: [{
            shot: 'archeck', maxH: 125,
            steps: [
              { mark: 'cards', text: 'Mỗi hoá đơn được xếp vào một nhóm: `全額・期日内` (đủ, đúng hạn) · `全額・遅れ` (đủ nhưng trễ) · `分割で全額` (trả nhiều lần) · `手数料差引き` (bị trừ phí, **chưa xử lý**) · `次回請求に加算` · `手数料 当社負担` · `過入金` (trả thừa) · `不足` (trả thiếu) · `未入金` (chưa trả) · `期日前` (chưa tới hạn). **Bấm một ô để lọc.**' },
            ],
          }],
          tip: 'Cuối tháng hãy xem `不足` và `過入金`: đó là những khách cần liên hệ để xác nhận.',
        },
        {
          title: 'Tiền thiếu và phí chuyển khoản bị trừ (差額)',
          lead: 'Nhiều công ty **tự trừ phí chuyển khoản** (~440 yên) hoặc **trả thiếu**. Màn này gom lại để không khoản nào bị mất mà không ai biết.',
          screens: [{
            shot: 'arshort', maxH: 72,
            steps: [
              { mark: 'kpi', text: 'Tổng: phí bị trừ **chưa xử lý** · số cần **cộng vào hoá đơn tháng sau** · **trả thiếu** đã quá hạn · tổng phí bị trừ trong năm.' },
              { mark: 'open', text: 'Mỗi công ty: số lần bị trừ, tổng tiền, phần **chưa xử lý** (đỏ).', badge: 'right' },
              { mark: 'btn', text: '`次回請求に加算`: đòi lại ở hoá đơn tháng sau. Nhớ **thêm số tiền đó vào hoá đơn Money Forward**, rồi bấm `MFの請求書に入れた`.' },
              { mark: 'abs', text: '`当社負担にする`: BIGLIGHT chấp nhận chịu (chỉ Admin / Manager, có ghi lại người quyết định).' },
              { mark: 'mail', text: '✉: gửi mail mẫu **振込手数料差引きのご連絡** (tự điền số lần và tổng tiền).' },
              { mark: 'burden', text: 'Dòng dưới tên: công ty này **ai chịu phí**.' },
            ],
          }],
          blocks: [
            { flow: { title: 'Cách hệ thống phân loại khi ghi tiền vào', rows: [
              [{ t: 'Thiếu 1〜1,000 yên', s: 'coi là phí chuyển khoản', c: 'src' },
               { t: 'Công ty `先方負担` (mặc định)', s: 'khách phải chịu phí', c: 'in' },
               { t: '`手数料差引き` — còn nợ', s: 'hiện ở màn này, chờ xử lý', c: 'no' }],
              [{ t: 'Thiếu 1〜1,000 yên', s: '', c: 'src' },
               { t: 'Công ty `当社負担`', s: 'BIGLIGHT đã đồng ý chịu phí', c: 'in' },
               { t: 'Tự coi là phí, số dư về 0', s: '', c: 'out' }],
              [{ t: 'Thiếu hơn 1,000 yên', s: '', c: 'src' },
               { t: 'Trả một phần', s: '', c: 'in' },
               { t: '`不足` — nhắc nợ như bình thường', s: 'nút `督促へ`', c: 'warn' }],
            ] } },
          ],
          note: 'Khoản trừ phí **không** được đưa vào danh sách 督促 (nhắc nợ theo cấp) — xử lý ở màn này.',
        },
        {
          title: 'Đặt ai chịu phí chuyển khoản cho từng công ty',
          screens: [{
            shot: 'fee_burden', modal: true, maxH: 100,
            steps: [
              { mark: 'fee', text: '`取引先` › mở công ty › mục ② › `振込手数料`: `先方負担` (mặc định — trừ phí là **thiếu**) hoặc `当社負担` (BIGLIGHT chịu).' },
            ],
          }],
          tip: 'Chỉ đổi sang `当社負担` với những công ty đã **thoả thuận** BIGLIGHT chịu phí. Để trống = `先方負担`.',
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
            shot: 'bill_form', modal: true, maxH: 128,
            steps: [
              { mark: 'co', text: '`支払先`: nhà cung cấp gửi hoá đơn.' },
              { mark: 'book', text: '`計上月`: tháng mà khoản chi **thuộc về** (không phải tháng trả tiền).' },
              { mark: 'due', text: '`支払期日`: hạn phải trả. Nếu `計上月` đã có sẵn khi chọn `支払先`, hạn tự điền theo 締日・サイト của nhà cung cấp — sửa được.' },
              { mark: 'lines', text: '`＋ 行を追加`: thêm từng dòng — tài khoản, nội dung, số lượng, đơn giá, **loại thuế**.' },
              { mark: 'files', text: '**File hoá đơn** (`*確定に必要`): bắt buộc nếu muốn lưu ở trạng thái `確定`.' },
            ],
          }],
          tip: 'Đặt `状態` là `確定` + kéo file hoá đơn vào → `保存`: hệ thống tự lưu `作成中` → gửi file → chuyển `確定`. Chưa có file thì để `作成中`.',
        },
        {
          title: 'Ghi tiền đã trả (支払を記録)',
          screens: [{
            shot: 'payout', modal: true, maxH: 118,
            steps: [
              { mark: 'co', text: '`支払先`: chọn nhà cung cấp. Danh sách hoá đơn chưa trả của họ hiện ra bên dưới.' },
              { mark: 'inv', text: 'Cột `請求書`: bấm 📎 để **xem file hoá đơn trước khi trả**.' },
              { mark: 'amt', text: '`支払額`: số tiền đã chuyển.' },
              { mark: 'auto', text: '`期日の古い順に自動で割り当て`: tự gán tiền cho hoá đơn **hạn sớm nhất** trước.' },
              { mark: 'alloc', text: 'Hoặc tự gõ số tiền vào cột `消込額` của từng hoá đơn. Một lần chuyển có thể trả nhiều hoá đơn.' },
              { mark: 'files', text: 'Kéo thả file sao kê chuyển khoản / biên lai (gửi sau khi lưu).' },
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
      title: '証憑 — file chứng từ',
      summary: 'Xem trước PDF · loại chứng từ · chứng từ thiếu file · 支払請求 phải có file mới 確定 · AI đọc file',
      pages: [
        {
          title: 'Xem và đính file chứng từ',
          lead: 'Bấm 📎 ở bất kỳ đâu (danh sách 入金 / 支払請求 / 支払実行, sổ chi tiết, hộp chi tiết một ô). File gắn vào **từng chứng từ**.',
          screens: [{
            shot: 'att_window', modal: true, maxH: 104,
            steps: [
              { mark: 'head', text: 'Dòng trên cùng cho biết file này thuộc **chứng từ nào**: loại, số, công ty, tháng, số tiền (税込).' },
              { mark: 'drop', text: '**Kéo thả** file vào đây (hoặc bấm `選ぶ`). PDF, ảnh, Excel, Word — tối đa 10MB/file.' },
              { mark: 'type', text: 'Chọn **loại chứng từ** trước khi thả: `請求書` · `領収書` · `振込明細` · `契約書` · `その他`.' },
              { mark: 'list', text: 'Danh sách file. **Bấm vào một file** để xem bên phải.' },
              { mark: 'rowtype', text: 'Chọn sai loại? Đổi ngay ở đây (có ghi lại lịch sử). `保存` tải về, `削除` xoá (theo quyền).' },
              { mark: 'prev', text: '**Xem trước PDF / ảnh ngay trong hộp** — phóng to, in, tải về bằng thanh công cụ của PDF.', badge: 'right' },
            ],
          }],
          tip: 'Đặt đúng loại chứng từ giúp người khác và **AI** tìm đúng file (VD: “hoá đơn của nhà cung cấp A tháng 7”).',
        },
        {
          title: 'Chứng từ còn thiếu file (証憑なし)',
          screens: [{
            shot: 'att_missing', maxH: 104,
            steps: [
              { mark: 'toggle', text: 'Tích `証憑なしのみ` để chỉ xem chứng từ **chưa có file**. Số đỏ bên cạnh = số chứng từ thiếu. Có ở `入金` · `支払請求` · `支払実行`.' },
              { mark: 'miss', text: 'Nhãn đỏ `証憑なし` ở cột 添付 — **bấm vào để đính file ngay**.' },
            ],
          }],
          blocks: [
            { h: 'Chứng từ nào cần file?' },
            { head: ['Chứng từ', 'Cần file khi'], table: [
              ['`支払請求` (hoá đơn phải trả)', 'đã `確定` (không tính `作成中` / `取消`)'],
              ['`請求` (hoá đơn gửi khách)', 'đã xác nhận (không tính `作成中` / `取消`)'],
              ['`入金` · `支払`', 'mọi khoản, trừ `取消`'],
            ] },
            { p: 'Chuông thông báo đếm chứng từ thiếu file của **3 tháng gần nhất**. Dữ liệu mẫu 【デモ】 không được đếm.' },
          ],
        },
        {
          title: '支払請求 phải có file hoá đơn mới 確定 được',
          lead: 'Quy định từ 16/9/2026: hoá đơn phải trả **không có file hoá đơn thì không xác nhận được** — kể cả khi gửi thẳng lên máy chủ.',
          screens: [{
            shot: 'bill_gate', modal: true, maxH: 100,
            steps: [
              { mark: 'head', text: 'Bấm `確定` ở một 支払請求 chưa có file → hệ thống báo lỗi và **mở ngay hộp đính file** của khoản đó.' },
              { mark: 'drop', text: 'Kéo thả file hoá đơn của nhà cung cấp vào.' },
              { mark: 'btn', text: 'Khi đã có file, nút `この支払請求を確定する` sáng lên → bấm để xác nhận.' },
            ],
          }],
          blocks: [
            { h: 'Quy trình hằng tháng cho khoản định kỳ' },
            { list: [
              '`定期の支払を作成（月まとめ）` → các khoản được tạo ở trạng thái `作成中`.',
              'Khi nhận hoá đơn của nhà cung cấp: bấm 📎 ở khoản đó → thả file → `この支払請求を確定する`.',
              'Khoản đã `確定` **từ trước ngày 16/9/2026** không bị khoá lại, nhưng sẽ hiện `証憑なし` cho đến khi đính file.',
            ] },
          ],
          note: 'Chỉ **支払請求** bắt buộc. 入金 / 支払 / 請求 thiếu file chỉ bị **nhắc** (nhãn đỏ, chuông), vẫn lưu bình thường.',
        },
        {
          title: 'AI đọc file chứng từ như thế nào',
          lead: 'AI (ChatGPT qua MCP) và hệ thống khác (API) **chỉ được đọc**. Không có cách nào để AI đính, xoá hay đổi file.',
          blocks: [
            { head: ['Công cụ của AI', 'Làm gì'], table: [
              ['`list_attachments`', 'Liệt kê file của một chứng từ, kèm loại chứng từ, công ty, tháng, số tiền'],
              ['`get_attachment`', 'Mở một file: PDF và ảnh được gửi cho AI đọc (tối đa 5MB). Excel / Word chỉ trả thông tin'],
              ['`list_missing_attachments`', 'Tìm chứng từ **chưa có file** — theo tháng, theo công ty'],
            ] },
            { h: 'Quyền' },
            { list: [
              'AI chỉ thấy file của những màn hình mà **khoá API** được phép đọc (VD: khoá không có `bills.read` thì không thấy file hoá đơn phải trả).',
              'Hỏi file ngoài quyền → AI nhận câu trả lời **“không có”** (không lộ là file có tồn tại).',
              'Mỗi lần AI / hệ thống bên ngoài đọc file đều được ghi lại — xem ở `設定` › `API・AI連携` › `連携ログ`.',
            ] },
            { h: 'Để AI làm việc tốt' },
            { list: [
              'Chọn đúng **loại chứng từ** khi đính file.',
              'Mỗi chứng từ **một file** hoá đơn tương ứng (không gộp nhiều hoá đơn vào một PDF).',
              'Đặt tên file dễ hiểu, VD `請求書_丸山不動産_2026-07.pdf`.',
            ] },
          ],
          tip: 'Ví dụ câu hỏi cho AI: “Liệt kê các 支払請求 tháng 7 chưa có file hoá đơn” · “Đọc hoá đơn của 支払請求 BIL-202607-001 và cho biết số tiền”.',
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
      summary: 'Danh sách 3 tab · thêm mới · điều kiện thanh toán · 取引先の確認 (đối tác đến từ Money Forward)',
      pages: [
        {
          title: 'Danh sách đối tác',
          screens: [{
            shot: 'companies', maxH: 124,
            steps: [
              { mark: 'menu', text: '`取引先`: danh sách · `取引先の確認`: xử lý đối tác mà Money Forward mang vào (trang sau).' },
              { mark: 'tabs', text: '`得意先` (khách hàng — BIGLIGHT **nhận** tiền) · `支払先` (nhà cung cấp — BIGLIGHT **trả** tiền) · `すべて` (tất cả). Số bên cạnh là số công ty. Công ty `両方` có mặt ở cả hai tab. **Cột đổi theo tab**: 得意先 có `売掛残`, `入金サイト`, `最終入金`; 支払先 có `買掛残`, `支払条件`, `最終支払`.' },
              { mark: 'review', text: 'Khi Money Forward mang vào đối tác cần xem lại, thanh vàng này hiện ra — bấm `確認する`.' },
              { mark: 'add', text: 'Nút `＋` tạo đối tác **theo tab đang mở** (đang ở tab 支払先 thì tạo 支払先).' },
              { mark: 'kind', text: 'Nếu `区分` không khớp thực tế (vd ghi 得意先 nhưng có 支払請求), dưới ô sẽ ghi lý do màu đỏ và link `両方にする`. Hệ thống **không tự đổi** — người bấm mới đổi.' },
            ],
          }],
          blocks: [
            { p: 'Khách hàng (所属機関) được **đồng bộ từ CRM** (`設定` › `CRM連携`): tên, địa chỉ, người liên hệ. Các mục kế toán như ngày chốt, hạn trả, tài khoản ngân hàng **chỉ nhập ở đây** và không bị CRM ghi đè.' },
          ],
          note: 'Cột `請求ルール` và lời nhắc “chưa có 請求ルール” là của chức năng **tự tạo hoá đơn**, hiện không dùng vì hoá đơn làm ở Money Forward. **Không cần thiết lập.**',
        },
        {
          title: 'Xử lý đối tác từ Money Forward (取引先の確認)',
          lead: 'Khi lấy hoá đơn từ Money Forward, hệ thống tự tìm công ty tương ứng. **Không có gì giống** → tự tạo 得意先 mới (hoá đơn vào 回収 ngay). **Có công ty na ná** → không tạo, hoá đơn **chờ ở đây** cho người quyết.',
          screens: [{
            shot: 'coreview', maxH: 110,
            steps: [
              { mark: 'queue', text: '① **Đang chờ vì có công ty na ná** (tên chứa nhau, trùng 法人番号 hoặc kana). Hoá đơn của dòng này **chưa** vào 回収.' },
              { mark: 'qact', text: 'Cùng một công ty → chọn công ty ở ô chọn (★ = công ty na ná) rồi `統合`. Công ty khác → `新規`. Không muốn lấy → `取り込まない` (sáng nào cũng bỏ qua; mở lại được ở cuối trang). Bấm xong là hoá đơn vào ngay.' },
              { mark: 'auto', text: '② **Công ty tự tạo** từ Money Forward (nhãn `MF`). Hoá đơn đã nằm trong 回収.' },
              { mark: 'aact', text: 'Thật ra là công ty đã có → chọn công ty rồi `統合`: hoá đơn, tiền vào, 請求ルール chuyển sang công ty đó, công ty tự tạo bị xoá (**không hoàn tác được**). Là khách mới thật → `このままでよい`.' },
            ],
          }],
          blocks: [
            { p: '**CRM là gốc**: nếu sau này CRM đồng bộ một công ty trùng tên (hoặc trùng 法人番号) với công ty tự tạo, hệ thống **tự biến công ty tự tạo thành công ty CRM** — hoá đơn giữ nguyên, không cần 統合.' },
            { p: 'Sau khi 統合 hoặc chọn công ty, lần lấy hoá đơn sau Money Forward sẽ **tự khớp** vào đúng công ty đó.' },
          ],
          note: 'Chỉ `管理者` và `マネージャー` bấm được các nút ở trang này.',
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
          title: 'Kết nối Money Forward (API・AI連携)',
          lead: 'Ở `設定` › `API・AI連携`. Hệ thống chỉ **đọc** từ Money Forward, không ghi gì vào MF.',
          screens: [{
            shot: 'mfpanel', modal: true, maxH: 118,
            steps: [
              { mark: 'key', text: 'Khoá (ClientID / Secret) của ứng dụng MF. Chỉ `管理者` đổi được.' },
              { mark: 'inv', text: '**請求書**: đọc hoá đơn (công ty, ngày, số tiền). Trạng thái → nút kết nối/ngắt → `請求を取り込む` và kết quả lần lấy gần nhất.' },
              { mark: 'acc', text: '**会計**: đọc sao kê ngân hàng và 試算表. Cùng bố cục với thẻ bên trái; chọn tài khoản ngân hàng dùng để lấy tiền vào.' },
              { mark: 'auto', text: '**Tự đồng bộ** mỗi sáng (mặc định 06:00): hoá đơn → tiền vào → tự khớp. `今すぐ同期` chạy ngay (đang chạy thì nút bị khoá, không chạy hai lần).' },
              { mark: 'review', text: 'Có đối tác hoặc hoá đơn cần xem lại → bấm `確認する`.' },
            ],
          }],
          note: 'Tiền vào lấy **cả từ MF lẫn file CSV ngân hàng** cũng không bị tính hai lần: hệ thống so ngày + số tiền + tên người chuyển. Hai lần chuyển thật giống hệt nhau trong cùng ngày vẫn được giữ đủ hai.',
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
              'Có tiền vào → `＋ 入金を記録`. Có chuyển tiền đi → `＋ 支払を記録`. **Kéo luôn file sao kê vào form.**',
            ] },
            { check: 'Đầu mỗi tháng', items: [
              '`回収` › `Money Forward から取り込む` → lấy hoá đơn tháng trước.',
              '`支払` › `支払請求` › `定期の支払を作成（月まとめ）` → đính file hoá đơn (📎) → `確定`.',
              'Hoá đơn phải trả khác nhận được → `＋ 支払請求を登録`.',
              '`回収` › `入金チェック` → xem `不足` / `過入金` / `未入金`.',
              'Tích `証憑なしのみ` ở `入金` / `支払請求` / `支払実行` → đính file còn thiếu.',
              '`回収` › `差額` → với từng công ty bị trừ phí: `次回請求に加算` (rồi thêm vào hoá đơn MF → `MFの請求書に入れた`) hoặc `当社負担にする`.',
            ] },
            { check: 'Khi nhận được 試算表 của văn phòng kế toán', items: [
              '`予実管理` › `入力` › `実績` → gõ chi phí tháng đó (chưa thuế).',
              'Cập nhật `見込` nếu dự báo thay đổi.',
              'Xem `損益（予実対比）` và `見込実績表` → chuẩn bị họp.',
            ] },
            { check: 'Đầu năm tài chính (tháng 8)', items: [
              'Chuyển ◀ ▶ sang kỳ mới (VD 第6期).',
              'Sau khi chốt sổ kỳ cũ với văn phòng kế toán: Admin `設定` › `基本設定` › `第N期を締める`.',
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
              ['Bấm `確定` 支払請求 thì bị báo lỗi?',
                'Khoản đó **chưa có file hoá đơn**. Hệ thống mở sẵn hộp đính file — thả file vào rồi bấm `この支払請求を確定する`.'],
              ['Khách trừ 440 yên phí chuyển khoản thì làm gì?',
                'Chỉ cần ghi đúng số tiền thực nhận. Hệ thống tự nhận ra, giữ 440 yên là **còn nợ** và đưa vào `回収` › `差額`. Cuối tháng quyết định: cộng vào hoá đơn sau, hoặc BIGLIGHT chịu.'],
              ['Hoá đơn không chịu thuế thì nhập thế nào?',
                'Ở `請求額を手入力` chọn `税区分` = `非課税` hoặc `対象外` → 税抜 = 税込. Nên đặt luôn `税区分` của 取引先 để lần sau tự chọn.'],
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
