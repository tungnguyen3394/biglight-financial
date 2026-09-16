# Hướng dẫn sử dụng finance.biglight.jp bằng hình ảnh (PDF + HTML)

| Bản | Cho ai | Ngôn ngữ | Thư mục | File ra |
|---|---|---|---|---|
| 予実管理システム | nhân viên kế toán / quản lý BIGLIGHT | tiếng Việt | `vi/` | `pdf/Huong-dan-su-dung_BIGLIGHT-Finance.pdf` và `.html` |

Ảnh trong tài liệu là **màn hình thật** của `web/index.html`, chạy trên máy với **dữ liệu mẫu**
(【デモ】 — do chính nút `デモデータ` của app tạo). Không chụp production, không cần database.
Cách làm giống bản CRM (`CONG-THUC-XAY-DUNG-APP.md` §18); khác ở chỗ đây là màn hình **máy tính**
(khung trình duyệt, ảnh nằm trên, các bước nằm dưới).

Cài một lần: `cd guide && npm install` (Playwright; trình duyệt Chromium đã có trong máy thì không tải lại).

## 1. Chỉ sửa chữ (hay dùng nhất)

1. Mở `vi/noidung.mjs`, sửa chữ trong dấu `'…'` (giữ nguyên dấu `'` và dấu `,`).
2. `node tools/build.mjs vi` → ra PDF và HTML trong `pdf/`.

Không cần chụp lại, không cần máy chủ. Nếu công cụ báo `⚠ chữ tràn xuống chân trang` → rút bớt chữ
hoặc giảm `maxH` của ảnh trang đó.

| Viết trong noidung.mjs | Ra |
|---|---|
| `**chữ**` | chữ **đậm** |
| `` `入金を記録` `` | nhãn nút tiếng Nhật trong ô xám (đúng chữ trên màn hình) |
| `\n` | xuống dòng |
| `tip: '…'` / `note: '…'` | ô xanh «Mẹo» / ô vàng «Lưu ý» |
| `mark: 'kpi'` | khung cam + số trên ảnh (tên lấy ở `vi/chup.mjs` › `marks`) |
| `modal: true` | ảnh là hộp thoại (không vẽ thanh trình duyệt) |
| `maxH: 110` | chiều cao tối đa của ảnh (mm) |
| `blocks: [...]` | trang chữ: `{h}` `{p}` `{list}` `{table, head}` `{qa}` `{check, items}` `{flow}` |

## 2. Giao diện app thay đổi → chụp lại

```
node tools/capture.mjs vi            # chụp hết (~1 phút)
node tools/capture.mjs vi ar payout  # chỉ vài ảnh
node tools/build.mjs vi
```

`vi/chup.mjs` mô tả từng ảnh: mở màn nào (`page`), bấm gì trước (`run`), cắt vùng nào (`clip`),
khung cam ở đâu (`marks` = CSS selector). Vị trí khung **đo lúc chụp** — giao diện xê dịch thì chụp
lại là khung tự theo. Selector không còn → báo `⚠ không thấy khung`, không ra PDF sai im lặng.

**Nhìn lại ảnh sau khi chụp** — script chạy xanh chưa chắc ảnh đúng.

## 3. Các file

| File | Việc |
|---|---|
| `tools/server.mjs` | máy chủ giả: phát `web/`, `/api/*` trả Admin giả + dữ liệu rỗng |
| `tools/session.mjs` | mở app, đăng nhập giả, bấm `demoSeed()` |
| `tools/capture.mjs` | chụp JPEG (1440×900, DPR 1.6) + đo khung → `vi/shots/*.jpg|json` |
| `tools/build.mjs` | ghép → `pdf/*.pdf` (A4) + `pdf/*.html` (một file, mở bằng trình duyệt) |
| `tools/style.css` | giao diện tài liệu (xanh BIGLIGHT, khung cam) |
