# THIẾT KẾ — BIGLIGHT 予実管理システム (bản làm lại 2026-08-27)

> Xây theo `CONG-THUC-XAY-DUNG-APP.md`: SPA 1 file + Express + PostgreSQL, `app_state` JSONB,
> ghi theo record qua `/state-delta`, audit 4 lớp, phân quyền 3 lớp.
> Năm tài chính **8/1 〜 7/31** (`2025年度` = 2025-08-01〜2026-07-31), Q1=8〜10月.

---

## 1. BỐN MỤC TIÊU → BỐN KHỐI

| # | Mục tiêu | Trang | Câu hỏi màn hình trả lời |
|---|---|---|---|
| 1 | 予実管理 | `yojitsu` `compare` | Tháng này so kế hoạch bao nhiêu %? So tháng trước / cùng kỳ năm ngoái / các năm? Cuối năm về đâu (着地見込)? |
| 2 | 売掛金 | `invoices` `receipts` `aging` | Ai còn nợ mình? Quá hạn bao lâu? Tháng này thu được bao nhiêu? |
| 3 | 買掛金 | `bills` `payouts` `cashflow` | Mình còn nợ ai? Tuần này phải trả bao nhiêu? Tiền có đủ không? |
| 4 | OKR | `okr` | Mục tiêu quý đang ở đâu? Ai chịu trách nhiệm? Số liệu tự lấy từ 予実. |

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
| `expenses` | 経費 (trả ngay, không qua 買掛) | `date · bookMonth · accountCode · vendor · amount · taxCat · deptCode · **costItemId**` |
| `costItems` | 費目マスタ — **hàng** của 月次費用表 | `name · accountCode · kind(fixed/variable) · monthly(月額予定・税込) · taxCat · vendor · method · startYm · endYm` |

**費用管理 = 月次費用表 (quyết định 2026-09-05).** Không nhập từng phiếu. Màn hình là **1 bảng**: 費目 (hàng) × 12 tháng (cột).
Mỗi ô = **1 dòng `expenses`** khoá bằng `costItemId + bookMonth`, nhập **税込**. Vì ô vẫn là `expenses` nên 予実
không phải đổi gì (`actualSeries` vẫn quy về 税抜 bằng `taxCat`). Ô = 0/để trống → xoá luôn dòng đó.
`monthly` là mốc so sánh: lệch ≥10% thì ô đổi màu → nhìn ra ngay khoản nào bị tăng giá.
`endYm` = tháng cuối còn hiệu lực (hợp đồng đã huỷ) → các tháng sau không nhập được nữa.
Chi phí nhập lẻ trước đây (`costItemId` rỗng) **không bị giấu**: gom thành hàng 「個別入力」, bấm vào xem chi tiết.
Số chính thức để quyết toán vẫn là 試算表 của 会計事務所 — bảng này để **theo dõi**, không thay kế toán.

**Luật kế toán (viết ra để không ai làm sai về sau):**

- `bookMonth` (計上月) quyết định **予実**. `dueDate` / ngày thu-chi quyết định **資金繰り**.
  → Thu tiền chậm 2 tháng **không** làm doanh thu tháng đó tụt.
- `payments` / `payouts` **không** đụng vào P/L. Chúng chỉ làm giảm số dư công nợ.
- 1 lần chuyển khoản trả nhiều hoá đơn → `allocations[]` nhiều-nhiều. Bắt buộc, vì khách Nhật
  hay gộp thanh toán và trừ phí chuyển khoản (`fee`).

### 4.3 予実

| Key | Khoá | Ý nghĩa |
|---|---|---|
| `budgets` | `fy · month · accountCode · deptCode` | 予算 — nhập cả năm 1 lần |
| `forecasts` | `fy · month · accountCode · deptCode` | 見込 — cập nhật hàng tháng |
| `actualAdjust` | `fy · month · accountCode · deptCode` | 実績調整 — số kế toán ngoài hệ / sửa tay |

**実績 KHÔNG lưu.** Luôn tính lại:

```
actual(month, account) = Σ invoices.items(bookMonth, account)      ← doanh thu
                       + Σ bills.items(bookMonth, account)         ← chi phí có công nợ
                       + Σ expenses(bookMonth, account)            ← chi phí trả ngay
                       + actualAdjust(month, account)              ← điều chỉnh tay
```

Nếu có `actualAdjust` mà cũng có chứng từ → hiện **cả hai** kèm badge `調整あり`, không giấu (công thức §0.10).

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
  費用管理          月次費用表 — 費目 × 12か月の1枚（定期費用の増減を見る）
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
