# THIẾT KẾ — BIGLIGHT 予実管理システム (bản làm lại 2026-08-27)

> Xây theo `CONG-THUC-XAY-DUNG-APP.md`: SPA 1 file + Express + PostgreSQL, `app_state` JSONB,
> ghi theo record qua `/state-delta`, audit 4 lớp, phân quyền 3 lớp.
> Năm tài chính **8/1 〜 7/31** (`2025年度` = 2025-08-01〜2026-07-31), Q1=8〜10月.

---

## 1. BỐN MỤC TIÊU → BỐN KHỐI

| # | Mục tiêu | Trang | Câu hỏi màn hình trả lời |
|---|---|---|---|
| 1 | 予実管理 | `yojitsu` `compare` `mikomi` | Tháng này so kế hoạch bao nhiêu %? Cuối năm về đâu (着地見込)? — **費用の実績 nhập tay từ 試算表, 売上 tự lấy từ 請求書** |
| 2 | 売掛金 | `arbook` `receipts` `archeck` `dunning` | Ai còn nợ mình? Quá hạn bao lâu? Tháng này thu được bao nhiêu? |
| 3 | 買掛金 | `apbook` `bills` `payouts` `cashflow` | Mình còn nợ ai? Tuần này phải trả bao nhiêu? Tiền có đủ không? |
| 4 | 費用 | `expenses` `properties` | Mỗi tháng **dự kiến** chi bao nhiêu, cho科目/対象 nào? (không phải số thực tế) |
| 5 | OKR | `okr` | Mục tiêu quý đang ở đâu? Ai chịu trách nhiệm? Số liệu tự lấy từ 予実. |

> **Ba điều chủ dự án chốt 2026-09-16**: ① 予実 kiểm soát được — 実績 chi phí nhập tay từ 試算表 của 会計事務所,
> 売上 vẫn tự lấy từ 請求書 (Money Forward). ② 売掛金 / 買掛金 = công nợ thật. ③ 費用 = bảng CHI PHÍ DỰ KIẾN
> theo cây 勘定科目 大›中›小›対象. Ngoài ra: màn hình không viết lời giải thích (dồn vào 入力ガイド),
> bảng nhập và màn chi tiết phải nhìn một màn là thấy.

---

## 2. LUẬT NỀN — HAI NGUỒN DỮ LIỆU

> Đây là logic quan trọng nhất của cả hệ. CRM là nguồn *sự thật về người và công ty đặc định kỹ năng*.
> 予実 là nguồn *sự thật về tiền*. Hai bên không được ghi đè nhau.

```
crm.biglight.jp                        finance.biglight.jp (予実)
┌────────────────────┐   1 CHIỀU   ┌──────────────────────────────┐
│ 所属機関情報 (C~)   │ ──────────► │ companies  source='crm'      │
│ 特定技能者情報 (W~) │ ──────────► │ workers    source='crm' RO   │
└────────────────────┘             │                              │
                                   │ companies  source='manual'   │ ← công ty ngoài CRM
        KHÔNG BAO GIỜ ghi ngược    │ (nhà cung cấp, đối tác chi phí)│
                                   └──────────────────────────────┘
```

### 2.1 Ba loại trường trong một bản ghi công ty

| Nhóm | Ví dụ | Nguồn | Sửa được? |
|---|---|---|---|
| **CRM** | 会社名, カナ, 法人番号, 住所, 電話, 担当者, 分野 | đồng bộ từ CRM | ❌ khoá, hiện badge `CRM連携` |
| **会計** | 支払サイト, 締日, 請求書送付先, 銀行口座, 与信限度, 税区分 | **luôn nhập tay** | ✅ kể cả công ty CRM |
| **上書き** | khi CRM sai/thiếu và cần sửa gấp | nhập tay đè lên | ✅ lưu riêng ở `overrides{}` |

Luật `overrides`: **không ghi đè lên giá trị CRM**, mà lưu song song.
Hiển thị = `overrides[field] ?? crmValue`. Lần đồng bộ sau, giá trị CRM đổi thì phần override vẫn còn
và hệ hiện cảnh báo `⚠ CRMと相違` để người dùng quyết định giữ hay bỏ. Không tự quyết.

### 2.2 Công ty ngoài CRM

`source:'manual'` — nhập tay đầy đủ, không bao giờ bị đồng bộ đụng tới.
Dùng cho: nhà cung cấp (家賃, 通信費, 外注), khách hàng ngoài mảng 特定技能, đối tác một lần.
Hai loại sống chung một bảng, phân biệt bằng badge + bộ lọc `データ元`.

### 2.3 特定技能者 mirror

Chỉ đọc, chỉ lấy đúng thứ cần cho tiền:
`code · name · companyId · joinDate · exitDate · status · nationality · visaExp`
Dùng để **đếm số người tại chỗ trong từng tháng** → sinh 請求 tự động (§3).
予実 không sửa, không xoá; CRM xoá người thì mirror đánh dấu `_gone:true` chứ không biến mất
(hoá đơn cũ vẫn phải tra được ra người).

### 2.4 Ba đường nạp dữ liệu CRM — cùng một đích

```
① API tự động   : cron 03:00 mỗi đêm + nút「今すぐ同期」  ← chính
② CSV dự phòng  : xuất từ CRM → 📥取込                    ← khi API hỏng / CRM đổi
③ Nhập tay      : thêm công ty/người không có trong CRM   ← luôn có
```

Cả ba đi qua **một hàm `commitRecord()`** (công thức §6). Không có luồng ghi riêng.
Mỗi lần đồng bộ ghi `crmSync` log: lấy được bao nhiêu, thêm mấy, sửa mấy, bỏ qua mấy, lỗi gì.

---

## 3. TIỀN ĐẾN TỪ ĐÂU — 請求ルール (mấu chốt "đối ứng tất cả")

Mỗi công ty có **0..n quy tắc tính tiền**. Đây là dữ liệu của 予実, **nhập tay 1 lần**, sau đó chạy tự động.

| `kind` | Ý nghĩa | Cách tính hàng tháng |
|---|---|---|
| `per_worker` | 支援委託料 — tính theo đầu người | `số người tại chỗ trong tháng × 単価` (đếm từ mirror workers) |
| `fixed` | 顧問料, 月額固定 | `単価` |
| `spot` | 紹介料, 更新申請費用, 実費 | **không tự sinh** — nhập tay khi phát sinh |

### Đếm "người tại chỗ trong tháng"

```
在籍 trong tháng M  ⟺  joinDate ≤ cuối tháng M  AND  (exitDate rỗng OR exitDate ≥ đầu tháng M)
```

Chế độ tính (chọn theo công ty): `月末在籍` (mặc định) · `月初在籍` · `日割り` (theo số ngày).
Người vào giữa tháng / nghỉ giữa tháng là chỗ hay cãi nhau với khách — nên **ghi rõ chế độ trên hoá đơn**.

### Quy trình mỗi tháng

```
①「請求を作成 (2026年8月分)」
     └─ hệ quét mọi công ty có quy tắc → sinh 請求書案 (draft)
        · dòng tự động: 支援委託料 12名 × 30,000 = 360,000
        · kèm SNAPSHOT danh sách 12 người (tên + ngày vào/nghỉ)
② Người phụ trách xem lại → sửa số, THÊM DÒNG TAY (紹介料, 実費, 値引き)
③「確定」 → thành 請求書 chính thức, khoá snapshot
        · từ đây CRM sửa ngày vào/nghỉ cũng KHÔNG làm đổi hoá đơn cũ (công thức §0.8)
```

Công ty không có quy tắc nào → không bị bỏ sót: màn hình 請求作成 liệt kê riêng khối
`ルール未設定の会社` để người dùng biết mà xử lý tay.

---

## 4. MÔ HÌNH DỮ LIỆU (collection trong `app_state`)

### 4.1 Master

| Key | Nội dung | Nguồn |
|---|---|---|
| `companies` | 取引先 (khách + nhà cung cấp) | CRM + tay |
| `workers` | 特定技能者 mirror | CRM |
| `departments` | 部門 | tay |
| `accounts` | 勘定科目 (cây: `kind` = revenue/cogs/sga/nonop) | tay (có bộ mặc định) |
| `billingRules` | 請求ルール theo công ty | tay |

### 4.2 Chứng từ (発生主義 — ghi nhận theo tháng phát sinh)

| Key | Nội dung | Trường chính |
|---|---|---|
| `invoices` | 請求書 (売掛) | `no · companyId · bookMonth · issueDate · dueDate · items[] · tax · total · status · workerSnapshot[]` |
| `payments` | 入金 | `date · companyId · amount · fee · allocations[{invoiceId, amount}]` |
| `bills` | 支払請求 (買掛) | `no · companyId · bookMonth · recvDate · dueDate · items[] · total · status` |
| `payouts` | 支払実行 | `date · companyId · amount · allocations[{billId, amount}]` |
| `costPlans` | **費用表の1マス** (予定・税込) | `costItemId · ym('YYYY-MM') · amount(税込・予定)` |
| `expenses` | 経費 — **di sản**, không dùng nữa từ 2026-09-16 | `date · bookMonth · accountCode · vendor · amount · taxCat · deptCode · costItemId` |
| `costItems` | 対象 (費目マスタ) — **hàng** của 費用表 | `name · accountCode · kind(fixed/variable) · companyId(支払先) · payMode(即払い/買掛) · propertyId · monthly(月額・税込) · taxCat · startYm · endYm`（`vendor` · `method` giữ dữ liệu, đã bỏ khỏi form） |

**費用 = 費用表 1 tấm (làm lại 2026-09-16).** Bảng = cây 勘定科目 `大 › 中 › 小 › 対象` (hàng) × 12 tháng của năm tài chính (cột).
Mỗi ô = **1 dòng `costPlans`** khoá bằng `costItemId + ym`, nhập **税込** và là **số dự kiến, không phải thực tế**.
Ô = 0/để trống → xoá luôn dòng đó. Ngoài `startYm`〜`endYm` → `—`, không nhập được.
Hàng 科目 là tổng của các con, đóng/mở bằng ▼ (nhớ trong `localStorage: bl_yj_cost_open`, mặc định mở hết).
Cột: `勘定科目 › 対象 · 支払先 · 月額 · 12 tháng · 年間計`. **Cột 物件 đã bỏ khỏi bảng (2026-09-16)** —
nhiều loại chi phí (通信・リース・給与…) không gắn với toà nhà nào nên cột đó luôn trống và gây rối.
Trường `costItems.propertyId` vẫn còn trong form và vẫn là nguồn của màn 物件（建物）.
Ô nhập 12 tháng trong bảng này **không vẽ khung** (khung chỉ hiện khi rê chuột/focus) — 27 hàng × 12 ô
mà vẽ khung hết thì đọc số rất mệt. Bảng nhập 予実 vẫn giữ khung như cũ (`.cellin.ed`).
Nút **「→12」** (hàng 定期) và **「定期をすべて→12」** (toolbar): từ tháng hiện tại (nếu `CUR_FY` là năm hiện tại, không thì tháng đầu)
tới hết năm, **chỉ điền các ô trống** bằng số của tháng gần nhất bên trái (không có thì `monthly`) — ô đã có số không đổi.
Đối tượng 買掛 dùng chính ô đó để sinh 支払請求 (`apPlanFor`: ô của tháng → không có thì `monthly`).
**Số thực tế (実績) không nằm ở đây**: xem §4.3 — nhập tay từ 試算表 của 会計事務所.

**Luật kế toán (viết ra để không ai làm sai về sau):**

- `bookMonth` (計上月) quyết định **予実**. `dueDate` / ngày thu-chi quyết định **資金繰り**.
  → Thu tiền chậm 2 tháng **không** làm doanh thu tháng đó tụt.
- `payments` / `payouts` **không** đụng vào P/L. Chúng chỉ làm giảm số dư công nợ.
- 1 lần chuyển khoản trả nhiều hoá đơn → `allocations[]` nhiều-nhiều. Bắt buộc, vì khách Nhật
  hay gộp thanh toán và trừ phí chuyển khoản (`fee`).

### 4.2b 回収（売掛金）= bảng 取引先 × tháng (quyết định 2026-09-14)

Hoá đơn (tạo · 明細 · thuế · PDF · gửi · trạng thái) do **Money Forward クラウド請求書** giữ. Hệ này chỉ trả lời:
đã 請求 bao nhiêu · đã 入金 bao nhiêu · còn nợ bao nhiêu · quá hạn bao nhiêu — theo từng tháng.

```
当月末残高 = 前月末残高 + 当月請求額 − 当月入金額          (web: arMonthly — nơi DUY NHẤT tính)
前月末残高 = Σ 請求(計上月 < 当月) − Σ 入金(入金日 < 当月)
当月請求額 = Σ invoices.total 税込 (bookMonth = 当月, trừ 作成中/取消)
当月入金額 = Σ payments.amount + fee (tháng của date, trừ 取消)
期限超過額(D) = max(0, min(残高, Σ 請求 có effDue < D − Σ 入金 date ≤ D))   ← nhận tiền trả hoá đơn cũ trước
```

- **Không lưu bảng tháng** (`accounts_receivable_monthly` = kết quả của `arMonthly`, luôn tính lại) — cùng luật "実績 không lưu".
- **Không dựa vào status hay allocations** để tính nợ. `allocations` vẫn được điền tự động (cũ → mới, `arFifoAlloc`)
  để 督促・資金繰り・API v1 (vẫn tính theo từng hoá đơn) không lệch với bảng mới.
- **請求 từ MF**: `invoices` với `source:'mf' · mfId · no(billing_number) · bookMonth(=sales_date, không có thì billing_date)
  · issueDate(billing_date) · dueDate(due_date) · total(total_price) · subtotal(subtotal_price) · items:[]`.
  Trùng thì nhận ra bằng `mfId` (CSV không có ID → `no`). 予実 dùng `subtotal` làm 税抜 khi không có `items`.
- **Mapping 取引先**: `companies.mfPartnerId / mfPartnerName` → không có thì so tên (bỏ 株式会社/㈱/khoảng trắng) → không có thì người chọn.
- **Đường lấy MF**: ① API (backend `mfinvoice.ts`, chỉ đọc, OAuth scope `mfc/invoice/data.read`, token ở `server_config`;
  tắt khi không có `MF_CLIENT_ID/SECRET`) ② CSV xuất từ MF. Cả hai chỉ **đọc** — ghi vào DB qua `/state-delta` như mọi thao tác (có audit, có phân quyền).
- **入金**: `payments.source` = `manual` hiện tại; sau này ngân hàng/MF → `source:'bank'|'mf'` + `extId`. Công thức không nhìn `source`.
- **売掛金・買掛金 (2026-09-16)**: dưới dòng 合計 có 2 dòng chuyển động `＋ 請求額 / − 入金額` (買掛: `＋ 支払請求 / − 支払`),
  lấy từ `arMonthly().billed/payment`, cột phải là **年度計**. **Không** thêm 月次売上 vào đây: 請求額 = toàn bộ dòng・税込,
  còn 売上 = chỉ 収益科目・税抜 — hai số lệch nhau hợp lệ, đặt cạnh nhau sẽ bị hiểu là sai. 売上 theo tháng xem ở 予実管理/ダッシュボード.
  KPI và cột bên phải theo `bookAnchor(fy)`: năm hiện tại → hôm nay (現在残高); năm cũ → tháng cuối năm (`7月末残高`); năm sau → tháng đầu.
  CSV thêm cột `YYYY-MM 請求額 / 入金額` ở cuối (cột cũ giữ nguyên tên và thứ tự).
  Chọn cách gom cột: `月 / 四半期 / 上期・下期 / 通期` + `当期 / 累計` (`bookGrid()`, nhớ trong `localStorage: bl_yj_bookview`).
  Ô công ty = số dư cuối kỳ (tháng cuối kỳ, chưa tới thì lấy tháng hiện tại) — số dư KHÔNG cộng dồn. 2 dòng chuyển động = tổng trong kỳ,
  bấm 累計 = cộng từ đầu năm. Khi gom kỳ, bấm ô mở 元帳 (không mở chi tiết tháng). CSV vẫn xuất theo tháng.
- Menu: 回収 = 売掛金 · 入金 · 督促. 請求管理 / 年齢表 / 取引先別 **gỡ khỏi menu** (code còn, `PAGE_REDIRECT` dẫn về 売掛金).

### 4.3 予実

| Key | Khoá | Ý nghĩa |
|---|---|---|
| `budgets` | `fy · month · accountCode · deptCode` | 予算 — nhập cả năm 1 lần |
| `forecasts` | `fy · month · accountCode · deptCode` | 見込 — cập nhật hàng tháng |
| `actuals` | `fy · mIndex · accountCode` | **実績（費用）** — nhập tay từ 試算表 của 会計事務所 (税抜), từ 2026-09-16 |
| `actualAdjust` | `fy · month · accountCode · deptCode` | 実績調整 — **di sản**: không nhập nữa, nhưng vẫn cộng vào 実績 (không làm đổi số cũ) |

**実績 (quyết định 2026-09-16 của chủ dự án):**

```
売上の実績   = Σ invoices.items(bookMonth, 収益科目)  (invRevenue — KHÔNG lưu, tính lại mỗi lần)
              + actualAdjust(revenue)                 ← di sản
費用の実績   = Σ actuals(fy, mIndex, accountCode)     ← nhập tay từ 試算表 (税抜)
              + actualAdjust(cogs/sga/nonop)          ← di sản
```

- `bills` (支払請求) và `costPlans` (費用表) **không** vào 実績 nữa: chúng là *lời hứa/dự kiến*, không phải số kế toán.
  Nhờ vậy 予実 luôn khớp 試算表, không lệch vì quên tạo chứng từ.
- Nhập ở 予実 › 入力 › 実績: hàng 収益 để **readonly** (lấy từ hoá đơn), hàng 売上原価/販管費/営業外 là ô nhập (税抜).
- **Sơ đồ cách nhập** nằm trong 入力ガイド, mục 予実管理 (`guideYjDiagram()`): ①予算 (đầu năm) → ②見込 (hàng tháng)
  → ③実績 費用 (từ 試算表, 税抜) → ④売上 tự động từ 請求書. Kèm thanh đỏ nhắc 費用表/支払請求 **không** vào 実績.
  Nút ガイド trên topbar mở đúng mục của màn đang xem. Giữ SVG ≤ 600px rộng: 入力ガイド phải không cuộn ở 1366×768
  (đã đo `#modal` clientHeight == scrollHeight cho cả 7 mục).
- Xem 税込: 実績 費用 quy đổi bằng thuế suất của 勘定科目 (`grossRateOf` — lấy `taxCat` của `costItems` cùng科目, không có thì 10%, 営業外 0%).
- `lastActualIdx` = tháng cuối có hoá đơn **hoặc** có `actuals`.
- `backend/src/apiv1/finance.ts` là bản sao của đúng các công thức này (`test/apiv1.js` so từng con số).

### 4.3b Chứng từ đính kèm (証憑) và thuế của doanh thu — 2026-09-16

**File** nằm ở bảng `attachments` (BYTEA, không vào `app_state`), gắn vào 請求 / 入金 / 支払請求 / 支払 / 取引先 / 費目 / 物件.
- Mỗi file có `doc_type`: `請求書 · 領収書 · 振込明細 · 契約書 · その他` (lạ → その他). Đổi bằng `PATCH /files/:id`.
- Hộp 📎: danh sách bên trái, **xem trước PDF/ảnh ngay bên phải** (blob → iframe). Không mở tab mới.
- Form `入金を記録` · `支払を記録` · `請求額を手入力` · `支払請求` có ô kéo thả; file giữ trong `ATT_PEND`, gửi **sau khi** bản ghi đã lên server (`attPushNow` → `attPendFlush`) vì server chỉ nhận file cho bản ghi đã tồn tại.
- `売掛元帳 / 買掛元帳`: bấm dòng tháng → danh sách chứng từ của tháng, mỗi dòng có 📎; cột `証憑` = tổng file / số chứng từ thiếu.
- **証憑なし** (thiếu file): 支払請求・請求 đã xác nhận (không phải 作成中/取消), 入金・支払 không 取消. Dữ liệu `demo` không tính.
  Hiện: nhãn đỏ ở cột 📎, ô lọc `証憑なしのみ` (入金 / 支払請求 / 支払実行), chuông (3 tháng gần nhất).
  Web `ATT_NEEDS` và backend `apiv1/attachments.ts NEEDS_FILE` phải giống nhau.
- **支払請求 không có file thì không 確定 được** — kiểm ở 2 nơi: màn hình (`confirmBill`, `saveBillForm`) và
  server (`authz.ts billsNeedingFile` + đếm `attachments` trong `/state-delta` → 403 `bill-needs-file`).
  Chỉ áp cho bản ghi đang 作成中/取消/mới chuyển sang trạng thái xác nhận; bản đã 確定 từ trước không bị khoá lại; `demo` bỏ qua.
  Form chọn 確定 + có file: lưu 作成中 → gửi file → đổi sang 確定.
- **AI/API chỉ đọc**: `list_attachments · get_attachment · list_missing_attachments`, REST `/api/v1/attachments/…`.
  Quyền = scope đọc của bảng chứng từ. Không có đường ghi.

**Thuế của hoá đơn doanh thu không có dòng chi tiết** (MF / 請求額を手入力): `invoices.taxCat` = `課税10% · 軽減8% · 非課税 · 対象外` (MF có thể ra `混在`).
```
税抜 = subtotal (nếu có)  ·  không có → 税込 ÷ (1 + thuế suất của docTaxCat)
docTaxCat = invoice.taxCat → 取引先.taxCat → 課税10%          (web docTaxCat = backend finance.ts docTaxCat)
```
- Trước đây luôn ÷1.1 → hoá đơn không chịu thuế bị trừ thuế oan.
- MF: 税抜=税込 → `対象外` (công ty là 非課税/対象外 thì theo công ty); tỉ lệ 1.10/1.08 → 課税10%/軽減8%; khác → `混在`.
  CSV thiếu 小計 → theo 取引先 và tính luôn `subtotal`.
- Tiêu đề số tiền ở 売掛金/買掛金/元帳 ghi `（税込）`; 入金額/支払額 ghi "số tiền thực nhận/thực trả".
- `test/attachments.js` so từng con số giữa web và backend.

### 4.3c Phí chuyển khoản bị trừ và tiền thiếu (差額) — 2026-09-16

Vấn đề: khoảng 5–10/50 công ty trả thiếu hoặc tự trừ phí chuyển khoản (~440 yên). Trước đây nếu gõ ô 振込手数料 thì số dư về 0 và 440 yên biến mất; không gõ thì lẫn với nợ thật.

- `companies.feeBurden`: `先方` (mặc định, trống = 先方) / `当社`.
- `FEE_MAX = 1000`: chênh lệch 1〜1,000 yên = **手数料差引き**; > 1,000 = **不足** (trả một phần).
- `入金を記録`: bỏ ô gõ phí. Ô so sánh `請求の残り − 入金 = 差額` hiện khi gõ số (`payShortPreview` = cùng phép tính với lúc lưu).
  - 先方負担 → `payments.feeShort` = chênh lệch (chỉ để ghi nhận), phần thiếu **còn nằm trong 売掛金**.
  - 当社負担 → `payments.fee` = chênh lệch, số dư về 0 (giống cách cũ).
- **FIFO bỏ qua khoản lẻ** (`arFifoPlan`): hoá đơn đã trả một phần và còn ≤ FEE_MAX được xếp sau cùng. Nếu không, 440 của tháng trước ăn vào tháng sau và tiền thiếu trượt mãi.
- Xử lý một khoản lẻ = thêm vào `payments.adjust[]` `{type, invoiceId, amount, at, by, done}`, cộng thêm vào allocations:
  - `carry` (次回請求に加算): hiện ở "次回の請求に足す額" cho đến khi bấm `MFの請求書に入れた` (`done`).
  - `absorb` (当社負担): chỉ Admin/Manager.
  - `received(p) = amount + fee + Σadjust`. Backend tính số dư theo allocations nên không phải sửa.
- Màn `arshort` "差額（手数料・不足）" (quyền = invoices): theo công ty — số lần bị trừ (năm), tổng bị trừ, chưa xử lý, cần cộng vào hoá đơn sau, 不足 quá hạn, các nút xử lý và mail `d-ar-fee`.
- 入金チェック: thêm `feeShort` (đỏ), `carry`; `fee` = 当社負担. Chuông: `fee-short`, `fee-carry`.
- 督促 **không** tính khoản lẻ (`isFeeResidual`) — xử lý ở màn 差額.
- Dữ liệu cũ có `fee>0` được hiểu là 当社負担 (đã đóng).

### 4.4 OKR

| Key | Trường chính |
|---|---|
| `objectives` | `title · level(会社/部門/個人) · ownerEmail · deptCode · period(2026-Q1) · parentId · status` |
| `keyResults` | `objectiveId · title · target · current · unit · autoSource` |
| `checkins` | `krId · date · value · confidence(0-100) · comment` |

`autoSource` = điểm khác biệt: KR có thể **tự lấy số từ 予実** thay vì gõ tay.

```js
autoSource: { type:'yojitsu', metric:'revenue', scope:'ytd' }   // 売上高 累計
autoSource: { type:'ar',      metric:'overdue' }                // 延滞債権残高
autoSource: { type:'workers', metric:'active' }                 // 在籍者数
```

---

## 5. SƠ ĐỒ MÀN HÌNH

**Thứ tự menu trái đang chạy (`SECTIONS`, đổi 2026-09-16 theo chỉ thị người dùng):**
`ダッシュボード → 予実管理 → 回収（売掛金）→ 支払（買掛金）→ 費用 → 取引先 → 設定`.
Xem tình hình trước (予実), rồi tiền vào–tiền ra, cuối cùng mới tới sổ đối tác và cài đặt.
Chỉ đổi thứ tự — ID màn hình, phân quyền, link, chuông đều giữ nguyên.
Sơ đồ dưới đây là bản ý niệm ban đầu (nhóm theo nghiệp vụ), không phải thứ tự menu.

```
ダッシュボード      ① 予実サマリー ② 資金繰り(今週/今月) ③ 延滞債権 ④ OKR信号
─ 予実管理 ─
  予実管理          bảng 12 tháng × 勘定科目 (予算/実績/差異/達成率) — nhập 予算・見込
  期間比較          当月/前月/前年同月/Q/半期/年度 + so nhiều năm + 着地見込
  見込実績表        bảng kiểu 会議資料 (đã có ở bản cũ, giữ nguyên tinh thần)
─ 債権・債務 ─
  請求管理 (売掛)   danh sách 請求書 + 請求作成(tự sinh) + 消込
  入金管理          ghi nhận 入金 + 消込 nhiều-nhiều
  債権年齢表        aging 0-30/31-60/61-90/90+ theo công ty
  支払管理 (買掛)   danh sách 支払請求 + 支払予定
  支払実行          ghi nhận 支払
  資金繰り          入金予定 − 支払予定 → số dư dự kiến theo tuần/tháng
─ 目標 ─
  OKR               cây mục tiêu 会社→部門→個人, チェックイン hàng tuần
─ マスタ ─
  取引先管理        công ty (CRM + tay), 請求ルール
  特定技能者        mirror CRM (chỉ đọc) + số người theo tháng/công ty
  費用表            勘定科目 大›中›小›対象 × 12か月の1枚（予定・税込。実績ではない）
  物件（建物）      物件ごとの契約と12か月の予定
  勘定科目          cây tài khoản
  CRM連携           trạng thái đồng bộ, log, nút 今すぐ同期, nạp CSV
─ システム ─
  ユーザー管理 / 操作履歴 / 設定
```

---

## 6. PHÂN QUYỀN

| Vai trò | 予実 | 債権債務 | OKR | マスタ | ユーザー |
|---|---|---|---|---|---|
| Admin | ✅ tất cả | ✅ | ✅ | ✅ | ✅ |
| Manager (経営) | ✅ xem + nhập 予算/見込 | ✅ | ✅ | ✅ | ❌ |
| Staff (経理) | ✅ nhập 実績調整 | ✅ nhập chứng từ | xem | sửa 取引先 | ❌ |
| Viewer | xem | xem | xem | xem | ❌ |

Tiền là dữ liệu nhạy cảm hơn CRM → thêm 2 luật:

1. **Không ai xoá được chứng từ đã 確定.** Chỉ được `取消` (huỷ) — dòng vẫn còn, có lý do, vào audit log.
2. **Sửa số tiền của chứng từ đã 確定** ghi audit kèm giá trị cũ → mới, và hiện lịch sử ngay trên 詳細.

---

## 7. HẠ TẦNG

```
finance.biglight.jp  ──► Caddy (mạng "web" có sẵn)
                          └─► web (nginx)  : phục vụ index.html + proxy /api → api:4000
                                              → CÙNG ORIGIN, không có CORS (công thức §12.5)
                          └─► api (Express): /state /state-delta /events /audit /state-history
                                             /crm-sync  (cron 03:00 + gọi tay)
                          └─► db  (PostgreSQL 16, volume riêng)
```

Đăng nhập: Google Identity Services, chỉ `@biglight.jp`, backend xác thực token,
bảng `profiles` giữ role/status — **giống hệt CRM**, không dùng NextAuth nữa.

### Nối CRM

`予実` gọi `GET {CRM_API}/export/master` với header `x-export-key: <khoá>`.
Endpoint này **chưa có trong CRM** → mã nguồn để dán vào CRM nằm ở `crm-integration/`.
Chỉ đọc, chỉ trả 2 tập dữ liệu, khoá riêng, không dùng lại token người dùng.
Chưa dán vào CRM thì hệ vẫn chạy đủ bằng đường CSV.
