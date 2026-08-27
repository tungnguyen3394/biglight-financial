# CÔNG THỨC XÂY DỰNG ỨNG DỤNG NGHIỆP VỤ — chuẩn BIGLIGHT

> Đúc rút từ hệ CRM 特定技能管理システム đang chạy thật (`web/index.html` ~30.800 dòng,
> backend Express + PostgreSQL ~14.000 dòng, 4 cổng vào: CRM · 本人ポータル · 企業ポータル · エージェント).
> Mục đích: **nhân bản** phong cách + kiến trúc này sang phần mềm khác (kế toán, kho, chấm công, y tế…)
> mà không phải nghĩ lại từ đầu.
>
> Cách dùng: đọc §0 → copy §2 (design tokens) → khai báo lại §4 (ENTITIES) → phần còn lại giữ nguyên.
> **Đổi ứng dụng = đổi bảng khai báo, KHÔNG đổi engine.**

---

## MỤC LỤC

| § | Nội dung | Đổi khi làm app mới? |
|---|---|---|
| 0 | Triết lý & 12 nguyên tắc bất biến | Không |
| 1 | Kiến trúc tổng thể | Không |
| 2 | Design system (tokens, nút, badge, bảng, modal) | Chỉ đổi màu chủ đạo |
| 3 | Bố cục màn hình chuẩn (topbar, sidebar, toolbar) | Chỉ đổi menu |
| 4 | Khai báo dữ liệu ENTITIES (schema-driven) | **ĐỔI HOÀN TOÀN** |
| 5 | CRUD generic (list · form · detail) | Không |
| 6 | BUSINESS_RULES — nguồn quy tắc duy nhất | **ĐỔI** |
| 7 | Lọc 2 tầng (filter row + Excel-style ▼) | Không |
| 8 | Cột hiển thị · sắp xếp · cột tự thêm · マスタ設定 | Không |
| 9 | Phân quyền 3 lớp | Đổi danh sách trang |
| 10 | Gửi mail (template engine + GAS) | Chỉ đổi biến `{{}}` |
| 11 | Audit log & an toàn dữ liệu | Không |
| 12 | Đồng bộ đa thiết bị (delta + SSE) | Không |
| 13 | Portal phụ (mobile-first) | Chỉ đổi tab |
| 14 | In ấn · PDF · Excel · CSV | Không |
| 15 | Checklist dựng app mới | — |
| 16 | Anti-pattern — bài học từ sự cố thật | Không |

---

# §0. TRIẾT LÝ & 12 NGUYÊN TẮC BẤT BIẾN

Đây là phần quan trọng nhất. Mọi quyết định kỹ thuật bên dưới đều là hệ quả của 12 điều này.

### 0.1 — Ngôn ngữ của màn hình là ngôn ngữ của công việc
Không đặt tên nút theo kỹ thuật (`submit`, `update record`), mà theo việc người dùng đang làm:
`入社手続きを開始` · `対応を記録` · `発送` · `退社完了`. Người mới vào công ty nhìn nút phải đoán được việc.

### 0.2 — Một màn hình trả lời được một câu hỏi
Trang danh sách trả lời: *"Ai? Đang ở trạng thái nào? Ai phụ trách? Việc tiếp theo là gì?"*
Mọi thông tin còn lại đẩy vào 詳細. Cột mặc định phải vừa 1 dòng, không cuộn ngang trên laptop.

### 0.3 — Một đường ghi dữ liệu duy nhất
Nhập tay, CSV, import hàng loạt, tự động sinh — **tất cả đi qua `commitRecord()`**.
Không nơi nào được `DB.x.push()` trực tiếp. Sửa nghiệp vụ = sửa 1 chỗ.

### 0.4 — Server là sự thật, localStorage chỉ là cache
Cache sai → vứt, tải lại. **Không bao giờ** sinh dữ liệu demo khi cache rỗng.
**Không bao giờ** đẩy lên server dữ liệu chưa từng đến từ server (cờ `fromServer`).

### 0.5 — Xoá là thao tác duy nhất không tự phát hiện được
Nhập sai thì nhìn màn hình là thấy; xoá mất một dòng thì không ai biết dòng đó từng tồn tại.
→ Staff mặc định **không có quyền xoá**. Mọi lần xoá vào audit log kèm nội dung cũ.

### 0.6 — Không bao giờ hiện số 0 giả
Lấy được số thì hiện; không lấy được (chưa login / API lỗi) thì **không hiện gì**.
Hiện "0 việc cần làm" khi thật ra là 12 việc — nguy hiểm hơn là không hiện.

### 0.7 — Dữ liệu cũ không bao giờ bị danh sách chọn mới làm hỏng
Đổi `OPTIONS` thì giá trị cũ vẫn phải nằm trong dropdown (`_selOptsKeep`) và vẫn hiển thị đúng badge.
Chuyển đổi bằng **ALIAS để gộp thống kê**, không bằng `UPDATE` dữ liệu.

### 0.8 — Snapshot thay vì tham chiếu, ở nơi cần bằng chứng
Địa chỉ trên phong bì đã gửi, điều kiện tuyển lúc ứng viên nộp đơn → **chụp lại tại thời điểm đó**.
Master đổi sau này không được làm đổi lịch sử.

### 0.9 — Không nhân bản dữ liệu người / tổ chức
Chỉ có 1 bảng gốc cho người, 1 bảng gốc cho tổ chức. Mọi trang khác chỉ giữ `workerId` / `companyId`.
Sửa ở trang gốc → mọi nơi ăn theo.

### 0.10 — Cột tính toán thì tính, đừng lưu
`応募者数`, `採用数`, `適合率`, `完成度%` tính lúc render từ dữ liệu có sẵn.
Lưu số đếm = chắc chắn có ngày lệch.

### 0.11 — Comment giải thích *tại sao*, kèm ngày và sự cố

```js
// ★ 2026-08-05: 雇用管理へのCSV取込は衛星行を自動生成しない。
//   理由: 一括取込で入社管理が二重に増える事故があったため。
```

Người sau (kể cả AI) đọc code phải hiểu được lý do, không phải đoán.

### 0.12 — Thêm, đừng sửa; giữ, đừng xoá
Field mới thêm vào cuối, dữ liệu cũ để trống. Chức năng bỏ khỏi menu nhưng **giữ code + dữ liệu**
(khôi phục = bỏ comment 1 dòng). Không migration ồ ạt.

---

# §1. KIẾN TRÚC TỔNG THỂ

```
┌──────────────────────── TRÌNH DUYỆT ─────────────────────────┐
│  /            web/index.html      SPA 1 file — màn quản trị  │
│  /portal      portal/index.html   người dùng cuối (mobile)   │
│  /company     company/index.html  khách hàng doanh nghiệp    │
│  /agent       agent/index.html    đối tác                    │
│                                                               │
│  Mỗi file = HTML + CSS + JS trong CÙNG 1 file. Không build.   │
│  Sửa → F5 là thấy. Không webpack, không npm ở frontend.       │
└──────────────┬────────────────────────────────────────────────┘
               │ fetch + Bearer token (Google OAuth)
               │ SSE /events  ← realtime
┌──────────────▼────────────────────────────────────────────────┐
│  backend/src/index.ts   Express + TypeScript                  │
│    GET  /state          toàn bộ JSON nghiệp vụ                │
│    PUT  /state-delta    ghi THEO TỪNG RECORD (đường ghi duy nhất) │
│    GET  /events         SSE đẩy tín hiệu "có thay đổi"        │
│    GET  /audit /sync-log /state-history                       │
│    module riêng: portal.ts companyportal.ts docengine.ts …    │
└──────────────┬────────────────────────────────────────────────┘
               │
┌──────────────▼────────────────────────────────────────────────┐
│  PostgreSQL                                                    │
│   app_state          1 dòng, cột data JSONB = toàn bộ dữ liệu  │
│   app_state_history  ảnh chụp mỗi lần ghi (khôi phục 1 click)  │
│   audit_log          ai · lúc nào · sửa ô nào · cũ→mới         │
│   sync_log           MỌI lần ghi kể cả bị CHẶN + IP + UA       │
│   workers/companies/…  bảng phẳng ĐỌC-ONLY (mirror cho pgAdmin)│
│   *_files            file nhị phân (bytea) + metadata          │
└────────────────────────────────────────────────────────────────┘
```

### Vì sao 1 file HTML khổng lồ?

Không phải lười. Đây là lựa chọn có chủ đích:

- Không build step → **sửa lỗi trên VPS lúc 23h vẫn được**, không cần cài Node ở máy đang trực.
- Không bao giờ lệch version giữa các chunk JS.
- Deploy = copy 1 file. Rollback = copy lại file cũ.
- `Ctrl+F` trong 1 file nhanh hơn nhảy 40 module.

Đổi lại phải giữ kỷ luật: **mỗi khối bọc bằng banner comment** để Ctrl+F ra ngay.

```js
/* ============ RENDER: ENTITY PAGES (generic CRUD) ============ */
/* ===== 郵送・印刷管理（2026-08-20 PHASE 1-2）=====
   1回の発送 = 1つの郵送案件。宛先はマスタから取り込んだ時点の
   スナップショットを保存 — マスタが後で変わっても過去の記録は変わらない。 */
```

### Vì sao JSONB thay vì bảng phẳng?

Nghiệp vụ đổi mỗi tuần (thêm cột, đổi luật). Migration mỗi lần = rủi ro + chậm.
JSONB cho phép thêm field không cần `ALTER TABLE`. Bảng phẳng vẫn được **mirror ở nền**
(`syncTablesFromState`) để kế toán mở pgAdmin query — nhưng đó là bản sao chỉ-đọc,
không phải nguồn sự thật.

---

# §2. DESIGN SYSTEM

## 2.1 Design tokens — copy nguyên khối này

Phong cách: **Apple / Linear / Notion minimal**. Nền sáng, viền mảnh, bóng rất nhẹ,
không gradient trang trí, bo góc vừa. Màu chỉ dùng khi **có nghĩa**.

```css
:root{
  /* Nền & bề mặt */
  --bg-page:#f7f8fa; --bg-surface:#ffffff; --bg-subtle:#f5f6f8;
  --bg-hover:#f2f5f9; --bg-selected:#edf4ff;
  /* Chữ — đúng 3 cấp, không hơn */
  --text-primary:#172033; --text-secondary:#5f6b7a; --text-muted:#8b95a5;
  /* Viền — 2 cấp */
  --border-default:#e5e9f0; --border-strong:#d8dee8;
  /* Màu chức năng — mỗi màu 1 đặc + 1 nhạt */
  --primary:#1677ff; --primary-hover:#0867df; --primary-soft:#eaf3ff;
  --success:#238636; --success-soft:#eaf7ee;
  --warning:#b77900; --warning-soft:#fff5d9;
  --danger:#d92d20;  --danger-hover:#b42318; --danger-soft:#fff0ef;
  /* Bo góc — đúng 3 cỡ */
  --radius-sm:6px; --radius-md:10px; --radius-lg:14px;
  /* Đổ bóng — đúng 2 cấp, rất nhẹ */
  --shadow-sm:0 1px 2px rgba(16,24,40,.04);
  --shadow-md:0 6px 20px rgba(16,24,40,.06);

  /* ALIAS — TOÀN BỘ app chỉ tham chiếu nhóm này.
     Đổi giá trị = đổi giao diện, KHÔNG đổi logic. */
  --bg:var(--bg-page); --card:var(--bg-surface); --surface-2:var(--bg-subtle);
  --thead:#fafbfc; --row-hover:var(--bg-hover); --section-bg:var(--bg-subtle);
  --filter-bg:#fafbfc; --input-bg:#ffffff;
  --border:var(--border-default); --text:var(--text-primary); --muted:var(--text-secondary);
  --green:#238636; --amber:#b77900; --red:#d92d20; --gray:#9ca3af;
}
html.dark{
  --bg-page:#0f1420; --bg-surface:#161c2c; --bg-subtle:#1b2334;
  --bg-hover:#1e2740; --bg-selected:#182a4a;
  --text-primary:#e8edf7; --text-secondary:#9aa7be; --text-muted:#7c8aa5;
  --border-default:#27314a; --border-strong:#344060;
  --primary:#3b8bff; --primary-hover:#5ea1ff; --primary-soft:#16233f;
  --success:#34d399; --warning:#fbbf24; --danger:#f87171;
  --thead:#1b2334; --filter-bg:#1b2334; --input-bg:#0f1830;
  --green:#34d399; --amber:#fbbf24; --red:#f87171;
}
```

**Luật vàng của token:** code nghiệp vụ **chỉ** được dùng nhóm ALIAS (`var(--card)`, `var(--text)`…).
Đổi thương hiệu = sửa 20 dòng đầu, không đụng 30.000 dòng dưới.

> Biến thể đã dùng thật: bản 企業ポータル đổi `--primary` sang navy `#123a6b`, bo góc xuống `4px`,
> **bỏ hết đổ bóng** → ra ngay cảm giác "hệ thống nghiệp vụ Nhật dùng 10 năm". Cùng một engine.

## 2.2 Chống nháy theme (đặt TRƯỚC mọi thứ trong `<head>`)

```html
<script>
(function(){try{
  if((localStorage.getItem('APP_theme')||'light')==='dark')
    document.documentElement.classList.add('dark');
}catch(e){}})();
function toggleTheme(){
  var d=document.documentElement.classList.toggle('dark');
  try{localStorage.setItem('APP_theme',d?'dark':'light');}catch(e){}
  var b=document.getElementById('themeToggle'); if(b)b.textContent=d?'☀️':'🌙';
}
</script>
```

Nút đổi theme: **nổi cố định góc dưới phải**, tròn 46px, `z-index:3000`.

## 2.3 Chữ

```css
*{ font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans JP',
   'Hiragino Kaku Gothic ProN','Yu Gothic UI',Meiryo,sans-serif; }
body{ font-size:14px; line-height:1.5; }
table{ font-size:12.5px; }        /* bảng nhỏ hơn 1 bậc = thấy nhiều dòng hơn */
.section-title{ font-size:16px; font-weight:650; letter-spacing:-.01em; }
.num{ font-variant-numeric:tabular-nums; }   /* MỌI số phải có — cột số mới thẳng hàng */
```

Chỉ 5 cỡ chữ: **24** (KPI) · **16** (tiêu đề mục) · **14** (thân) · **12.5** (bảng, phụ) · **11** (badge).
Trọng lượng chỉ 400 / 600 / 650 / 700 / 800 — không dùng 500 (nhìn không khác 400).

## 2.4 Nút — chỉ 3 loại, không hơn

```css
.btn{ display:inline-flex; align-items:center; gap:6px;
  background:var(--primary); color:#fff; border:1px solid transparent;
  padding:8px 15px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer;
  transition:background .14s, border-color .14s; }
.btn:hover{ background:var(--primary-hover); }
.btn:active{ transform:translateY(1px); }
.btn:disabled{ opacity:.5; cursor:not-allowed; }
.btn.secondary{ background:var(--card); color:var(--text); border:1px solid var(--border-strong); }
.btn.danger{ background:var(--card); color:var(--danger); border:1px solid #f3b6b1; }
```

| Loại | Dùng khi | Số lượng trên 1 màn |
|---|---|---|
| `.btn` (xanh đặc) | Hành động chính, tiến tới | **Tối đa 1** |
| `.btn.secondary` (trắng viền xám) | Mọi thứ còn lại | Không giới hạn |
| `.btn.danger` (trắng viền đỏ) | Xoá / huỷ / dừng | Tối đa 1, đặt xa nút chính |

> Nút nguy hiểm **không bao giờ** là nút đặc đỏ — người ta bấm theo phản xạ vào nút đặc.
> Nền trắng + chữ đỏ = phải nhìn mới bấm.

**Pill button** — cho thanh công cụ phụ (mẫu email, ghim, quản lý), tránh làm loãng nút chính:

```css
.pillbtn{ display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:600;
  padding:7px 13px; border-radius:999px; border:1px solid transparent; cursor:pointer;
  transition:transform .14s, box-shadow .14s, background .14s; white-space:nowrap; }
.pillbtn:hover{ transform:translateY(-1px); box-shadow:0 3px 9px rgba(20,60,120,.16); }
.pill-pin{background:#FFF3E6;color:#C2620C;border-color:#F6D9B8}   /* ghim */
.pill-pin.on{background:#F59E0B;color:#fff;border-color:#F59E0B}    /* đang ghim */
.pill-save{background:var(--primary-soft);color:var(--primary);border-color:#BBD8FB}
.pill-manage{background:#F1F4F8;color:#5A7490;border-color:#DDE5EF}
.pill-new{background:#E7F7EC;color:#166534;border-color:#BEE9CB}
/* dark mode: định nghĩa lại đúng 4 dòng */
html.dark .pill-pin{background:#3A2A12;color:#F5B968;border-color:#5A4322}
html.dark .pill-save{background:#16233F;color:#7FB3FF;border-color:#2B4470}
html.dark .pill-manage{background:#1B2746;color:#B7C3D8;border-color:#2E3D62}
html.dark .pill-new{background:#13301F;color:#7BD79B;border-color:#28502F}
```

## 2.5 Badge trạng thái — 5 màu, ánh xạ tập trung

```css
.badge{ padding:2px 9px; border-radius:6px; font-size:11px; font-weight:600;
        display:inline-block; line-height:1.6; }
.b-gray {background:#f2f4f7; color:#5f6b7a;}   /* trung tính / đã kết thúc  */
.b-blue {background:#eaf3ff; color:#0b5cd7;}   /* đang tiến hành, bình thường */
.b-green{background:#eaf7ee; color:#238636;}   /* xong, tốt, đang hoạt động  */
.b-amber{background:#fff5d9; color:#9a6700;}   /* đang chờ, cần chú ý        */
.b-red  {background:#fff0ef; color:#d92d20;}   /* quá hạn, lỗi, gấp          */
```

**Toàn app chỉ có MỘT hàm đổi trạng thái → màu.** Thêm trạng thái = thêm 1 dòng ở đây:

```js
function statusBadge(status){
  const map = {
    '取引中':'b-green','取引停止':'b-red','商談中':'b-amber',
    '勤務中':'b-green','退職':'b-gray','休職':'b-amber',
    '未対応':'b-red','対応中':'b-amber','対応済み':'b-green','対応不要':'b-gray',
    /* 求人管理（2026-08-17）*/
    '下書き':'b-gray','募集中':'b-green','急募':'b-red','充足':'b-blue','終了':'b-gray',
    /* … mỗi module thêm 1 khối, có ghi ngày … */
  };
  return `<span class="badge ${map[status]||'b-gray'}">${status||'-'}</span>`;
}
```

Giá trị lạ (dữ liệu cũ) → `b-gray`. **Không bao giờ crash, không bao giờ trống.**

## 2.6 Bảng

```css
table{ width:100%; border-collapse:collapse; background:var(--card);
  border-radius:10px; overflow:clip; font-size:12.5px; }
  /* overflow:clip chứ KHÔNG hidden — hidden giết position:sticky của th */
th,td{ padding:9px 12px; border-bottom:1px solid var(--border);
  text-align:left; white-space:nowrap; }
th{ background:var(--thead); color:var(--text-secondary); font-weight:600;
  position:sticky; top:0; }
tr:hover td{ background:var(--row-hover); }
.table-wrap{ overflow-x:auto; border:1px solid var(--border);
  border-radius:12px; background:var(--card); box-shadow:var(--shadow-sm); }
```

Bốn hành vi bắt buộc của bảng dài:

1. **Tiêu đề cột luôn hiện** khi cuộn dọc (`th` sticky; hạ `top` của `th` theo topbar khi mép khung trôi lên).
2. **Thanh cuộn ngang nổi dính đáy màn hình** — bảng 30 cột không phải cuộn xuống cuối mới kéo được.
3. **Chụm 2 ngón để thu nhỏ trên điện thoại** (`transform:scale`), tỉ lệ được **lưu lại** giữa các lần vào.
4. **Click vào hàng = mở 詳細**, nhưng click vào link / nút / checkbox thì giữ nguyên hành vi:

```js
if(e.target.closest('a,button,input,select,label,details')) return;   // luật 1 dòng
```

**Biến thể "card theo nhóm"** khi 1 dòng không đủ diễn đạt (VD: 会社 → 求人 → 応募者):
mỗi nhóm là 1 khung rộng hết chiều ngang xếp dọc, trong khung vẫn là bảng
với `table-layout:fixed` + `<colgroup>` → **các khung khác nhau vẫn thẳng cột nhau**.

## 2.7 Modal — 4 cỡ có tên

```css
.modal-bg{ position:fixed; inset:0; background:rgba(15,23,42,.35);
  display:none; align-items:center; justify-content:center; z-index:50; }
.modal-bg.show{ display:flex; }
.modal{ background:var(--card); border-radius:14px; padding:20px 24px; width:520px;
  max-height:85vh; overflow:auto; box-shadow:0 20px 60px rgba(16,24,40,.18);
  border:1px solid var(--border); }
@media(min-width:981px){
  .modal.modal-lg{ width:880px;  max-width:94vw; }   /* form nhiều cột     */
  .modal.modal-xl{ width:1200px; max-width:95vw; }   /* soạn mail, so sánh */
}
/* Workspace 2 cột: 90vw × 90vh, header/footer cố định, thân cuộn */
.modal.modal-psd{ width:90vw!important; max-width:1400px; height:90vh; padding:0;
  display:flex; flex-direction:column; overflow:hidden; }
.psd-head{flex:none;padding:13px 20px 9px;border-bottom:1px solid var(--border)}
.psd-body{flex:1;min-height:0;display:flex}
.psd-left{flex:0 0 40%;overflow-y:auto;padding:14px 18px;border-right:1px solid var(--border)}
.psd-right{flex:1;min-width:0;overflow-y:auto;padding:14px 18px}
.psd-foot{flex:none;display:flex;gap:8px;padding:10px 20px;border-top:1px solid var(--border)}
@media(max-width:700px){   /* điện thoại: toàn màn, 1 cột */
  .modal.modal-psd{width:100vw!important;height:100dvh;border-radius:0}
  .psd-body{flex-direction:column;overflow-y:auto}
  .psd-left,.psd-right{flex:none;overflow:visible;border-right:none}
}
```

**Modal tầng 2** (`#modal2`, `z-index:60`) dành cho hộp thoại mở từ trong hộp thoại
(sửa danh sách chọn khi đang điền form). **Không bao giờ có tầng 3.**

Nút trong modal luôn ở đáy, canh phải, thứ tự cố định:

```html
<div class="modal-actions">   <!-- display:flex; justify-content:flex-end; gap:8px -->
  <button class="btn secondary" onclick="closeModal()">キャンセル</button>
  <button class="btn"           onclick="saveForm()">保存</button>
</div>
```

Có hành động phá huỷ thì đẩy sang **trái cùng** (`justify-content:space-between`) — xa nút 保存.

## 2.8 Form

```css
.form-grid{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.form-grid label{ font-size:12px; color:var(--muted); display:block; margin-bottom:3px; }
.form-grid input,.form-grid select,.form-grid textarea{
  width:100%; padding:9px 11px; border:1px solid var(--border-strong);
  border-radius:8px; font-size:13.5px; background:var(--input-bg); color:var(--text); }
.form-grid input:focus{ border-color:var(--primary); box-shadow:0 0 0 3px var(--primary-soft); outline:none; }
.full{ grid-column:1/-1; }                       /* ô rộng cả hàng */
.form-section{ grid-column:1/-1; margin:8px 0 2px; padding:6px 11px;
  font-weight:700; font-size:12.5px; color:var(--primary);
  background:var(--section-bg); border-radius:4px; }
```

- **2 cột trên PC, 1 cột trên điện thoại** (grid tự sập).
- Trường dài (ghi chú, địa chỉ, đính kèm) gắn `full:true`.
- **Nhóm bằng `section`**, mỗi nhóm có emoji dẫn: `👤 個人情報` `🏢 会社情報` `📎 添付書類`.
  `section` là *thuộc tính của field đầu tiên trong nhóm* → thêm field vào nhóm = đặt đúng vị trí, hết.
- Trường khó hiểu gắn `help:` → hiện dấu **?** bấm ra chú thích, không viết dài trên màn hình.

## 2.9 Accessibility & chuyển động — 3 khối, làm ngay từ đầu

```css
button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{
  outline:2px solid var(--primary); outline-offset:1px; border-radius:4px; }
@media (prefers-reduced-motion:reduce){ *,*::before,*::after{
  transition:none!important; animation:none!important; } }
body,.kpi,.modal,table,th,td,input,select,.btn,.badge{
  transition:background-color .25s ease,color .25s ease,border-color .25s ease; }
```

Mọi transition **≤ .28s**. Không có hiệu ứng nào tồn tại chỉ để đẹp.

## 2.10 Icon — SVG nét, không emoji ở khung

```js
const svgIc = inner => '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
  + ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+inner+'</svg>';
const ICONS = {
  dashboard: svgIc('<rect x="3" y="3" width="7" height="7" rx="1.5"/>…'),
  users:     svgIc('<circle cx="9" cy="7" r="4"/><path d="M3 21v-1a6 6 0 0 1 12 0v1"/>'),
};
```

- Icon **thừa kế `currentColor`** → tự đúng trong dark mode, không cần bộ icon thứ hai.
- Emoji **được phép**: tiêu đề nhóm form, nội dung người dùng nhập, nhãn nghiệp vụ.
- Emoji **không được phép**: sidebar, nút khung, tiêu đề cột → dùng SVG cho đồng bộ.
- Có bộ **auto-replace emoji → SVG** khi render; chỉ đổi phần *hiển thị*, không đụng giá trị dữ liệu (`☑/☐`).
---

# §3. BỐ CỤC MÀN HÌNH CHUẨN

```
┌──────────────────────────────────────────────────────────────────┐
│ ☰  LOGO Tên hệ thống   [🔍 tìm toàn cục]   👤 role  🔔  avatar ▾ │  topbar 56px, sticky
├──────────┬───────────────────────────────────────────────────────┤
│ SIDEBAR  │  [tab phụ nếu có]                                     │
│ 232px    │  [thanh cảnh báo đỏ nếu có việc cần xử lý]            │
│          │  ┌─ toolbar ────────────────────────────────────────┐ │
│ 営業     │  │ Tiêu đề (N件 / 表示:M件)      [✕フィルタ] [⋯ツール]│ │
│  新規開拓│  └──────────────────────────────────────────────────┘ │
│ 求人・応募│  ┌─ table-wrap ─────────────────────────────────────┐ │
│  求人票  │  │ ▼列見出し … (sticky)                             │ │
│  応募者  │  │ hàng … (click = 詳細)                            │ │
│ 人材管理 │  └──────────────────────────────────────────────────┘ │
│ …        │                                                       │
│ システム │                                          [🌙 theme]   │
└──────────┴───────────────────────────────────────────────────────┘
```

## 3.1 Topbar (cao 56px, `position:sticky`, `z-index:45`)

Trái → phải: `☰` · logo · tên hệ thống · **ô tìm kiếm toàn cục** (max 440px) ·
`margin-left:auto` · chọn vai trò · chuông thông báo · avatar + menu tài khoản.

- Nền **trắng** (`var(--card)`), viền dưới mảnh — **không** dùng thanh màu đậm.
- `max-width:560px`: ẩn chữ thương hiệu, chỉ còn logo.
- Ô tìm: nền `--bg-subtle`, focus mới chuyển trắng + viền primary + glow 3px.

**Tìm kiếm toàn cục** quét mọi thực thể chính, mỗi kết quả có icon + tiêu đề + dòng phụ
(loại + mã), tối đa 12 dòng; chọn → **nhảy đúng trang VÀ mở đúng 詳細**:

```js
function openSearchResult(app,id){ goto(app); setTimeout(()=>openDetailModal(app,id),80); }
```

## 3.2 Sidebar

```js
const NAV_GROUPS = [
  { gid:'',      label:'',           items:[{id:'dashboard', label:'Dashboard'}] },
  { gid:'sales', label:'営業',       items:[{id:'prospects', label:'新規開拓'}] },
  { gid:'hr',    label:'人材管理',   items:[
      {id:'workers',label:'特定技能者情報'},{id:'onboarding',label:'入社管理'},
      {id:'employment',label:'雇用管理'},{id:'exit',label:'退社管理'}]},
  { gid:'sys',   label:'システム',   items:[
      {id:'users',label:'ユーザー管理'},{id:'audit',label:'操作履歴'},{id:'settings',label:'マスタ設定'}]},
];
const PAGES = NAV_GROUPS.flatMap(g=>g.items);
```

Luật:

- **Nhóm gập được**, trạng thái mở/đóng lưu theo `gid`. Nhóm đang chứa trang hiện tại tự mở.
- **Số việc chưa xử lý** hiện dạng badge đỏ trên tên nhóm — *lấy được thì hiện, không lấy được thì thôi* (§0.6).
- Thứ tự nhóm = **thứ tự dòng chảy công việc**, không phải theo alphabet:
  営業 → 求人 → 人材 → 顧客 → 業務 → システム.
- PC bấm `☰` → thu còn **60px chỉ icon** (không phải ẩn hẳn). iPad/điện thoại → off-canvas + overlay.
- Trang không có quyền xem thì **không render trong menu** (`canSeePage(pageId)`), không phải disable.

## 3.3 Toolbar của trang danh sách — bố cục nút chuẩn

```html
<div class="toolbar">
  <div class="section-title">所属機関情報 (92件 / 表示: 14件)</div>
  <div class="toolbar-left">
     <button class="btn secondary">📥 CSVインポート</button>   <!-- chỉ trang gốc dữ liệu -->
     <button class="btn">＋ 新規登録</button>                   <!-- nút chính, tối đa 1 -->
     <button class="btn secondary">✕ フィルタ解除 (3)</button>  <!-- chỉ hiện khi ĐANG lọc -->
     <details class="more-tools">
       <summary class="btn secondary">⋯ ツール</summary>
       <div class="more-panel">
         ＋新規追加 · 📧選択をメール送信 · 🗑選択を削除
         <hr>
         ↕️並び替え(2) · 表示項目▾
         <hr>
         📊Excel · 📄CSV雛形 · 📝一括修正用に書き出し · 🖨印刷
       </div>
     </details>
  </div>
</div>
```

**Nguyên tắc bố cục nút (quan trọng nhất của toàn bộ tài liệu này):**

1. **Trái = ngữ cảnh** (tên trang + số lượng). **Phải = hành động.**
2. Trên thanh chỉ để **tối đa 3 nút**. Còn lại nhét hết vào `⋯ ツール`.
3. Thứ tự trong `⋯ ツール` **cố định trong mọi trang**, phân cách bằng `<hr>`:
   `Tạo/Xoá/Gửi` → `Hiển thị (sắp xếp, cột)` → `Xuất/In`.
   Nhớ vị trí quan trọng hơn nhớ tên.
4. Nút hàng loạt (`選択をメール送信`, `選択を削除`) **luôn tồn tại nhưng `disabled`** khi chưa chọn dòng —
   không hiện/ẩn động, vì ẩn rồi hiện làm nút khác nhảy chỗ.
5. Nút bị chặn bởi quyền thì **không render** (`canCreate(pageId) && …`).
6. Nút hiển thị số lượng ngay trên nhãn: `並び替え (2)`, `フィルタ解除 (3)`, `表示項目 ▾`.

## 3.4 Thanh hành động hàng loạt (hiện khi có dòng được chọn)

Dải màu primary nằm **ngay trên bảng**, không phải popup:

```html
<div id="pBulkBar" style="background:var(--primary);color:#fff;border-radius:8px;
     padding:7px 14px;display:flex;gap:12px;align-items:center;">
  <b>12件選択中</b>
  <button class="btn" style="background:rgba(255,255,255,.18)">📧 メール送信</button>
  <button class="btn" style="background:rgba(255,255,255,.18)">担当者変更</button>
  <button class="btn" style="background:rgba(255,255,255,.18)">ステータス変更</button>
  <a style="margin-left:auto;opacity:.85">✕ 選択解除</a>
</div>
```

Nút trong dải màu dùng `rgba(255,255,255,.18)` — nổi trên nền primary mà không cần bảng màu thứ hai.

## 3.5 Menu `⋮` trên từng dòng — chỉ hiện thao tác hợp lệ với trạng thái đó

```js
html += it('詳細',`openDetailModal('prospects','${id}')`);
if(canEditP('prospects'))  html += it('編集',`openForm('prospects','${id}')`);
if(canMail())              html += it('📧 メール送信',`openReportMail('prospects',['${id}'])`);
if(['アポ','商談'].includes(eff)) html += it('求人票作成',`pMakeJob('${id}')`);   // theo trạng thái
if(canDeleteP('prospects')) html += it('削除',`deleteRow('prospects','${id}')`, true);  // đỏ, cuối cùng
```

Xoá **luôn ở cuối, luôn màu đỏ**. Thao tác không hợp lệ với trạng thái hiện tại thì **không liệt kê**
(chứ không phải bấm vào rồi báo lỗi).

## 3.6 Dashboard — khối màu theo chủ đề

```css
.dash-section{ border-radius:14px; border:1px solid var(--border);
  background:var(--card); box-shadow:var(--shadow-sm); overflow:hidden; margin-bottom:18px; }
.dash-section .dash-head{ padding:11px 16px; font-size:14px; font-weight:650;
  color:#fff; display:flex; align-items:center; gap:8px; }
.dash-section.c-blue .dash-head{background:#3577e0} .c-teal{--x:#149086}
.dash-section.c-amber .dash-head{background:#d08a1d} .c-red{--x:#d6544c}
.dash-section .dash-head .cnt{ margin-left:auto; background:rgba(255,255,255,.25);
  padding:2px 11px; border-radius:13px; font-weight:700; }
```

- **Chỉ thanh tiêu đề có màu**, thân khối vẫn trắng. Màu để phân biệt chủ đề, không phải trang trí.
- Số lượng nằm bên phải tiêu đề trong "viên thuốc" trong suốt.
- Tiêu đề **bấm được** → nhảy sang trang đầy đủ (`cursor:pointer` + `hover:brightness(1.1)`).
- Người dùng **thu gọn / ẩn được từng khối** và lựa chọn đó được lưu.

## 3.7 Responsive — 3 mốc, không hơn

| Mốc | Đổi gì |
|---|---|
| `≥981px` | PC đủ: sidebar 232px; `☰` thu còn 60px icon |
| `≤980px` | Sidebar off-canvas + overlay; `main` padding 14px; ẩn tên hệ thống |
| `≤560px` | Ẩn chữ thương hiệu; nút toolbar co lại 12px; bottom-nav thay điều hướng |

Chi tiết bắt buộc cho điện thoại:

- Sidebar `height:calc(100dvh - 56px)` + `padding-bottom:110px` — cuộn tới mục cuối, chừa chỗ bottom-bar.
- **`font-size` của input ≥ 16px** trên mọi portal → iOS không tự phóng to khi focus.
- Vùng bấm ≥ 44×44px.
- `viewport-fit=cover` + `env(safe-area-inset-bottom)` cho iPhone có notch.

---

# §4. KHAI BÁO DỮ LIỆU — TRÁI TIM CỦA CÔNG THỨC

> **Đây là chỗ duy nhất phải viết lại khi làm app mới.** Mọi thứ khác chạy tự động từ đây:
> bảng, form, chi tiết, lọc, sắp xếp, chọn cột, CSV, Excel, in, biến email, nhãn audit log.

## 4.1 Cấu trúc một thực thể

```js
const ENTITIES = {
  workers: {
    label:'特定技能者情報',      // hiện ở tiêu đề trang, tên file xuất, nhãn audit
    key:'workers',              // tên collection trong DB (JSON)
    idPrefix:'W',               // tiền tố mã tự sinh
    fields:[ /* … xem 4.2 … */ ],
    columns:['id','name','kana','nationality','visaStatus','visaExp'],  // cột mặc định
    fixedColOrder:true,         // (tuỳ chọn) khoá thứ tự cột theo `columns`
    hideIdCol:true,             // (tuỳ chọn) không hiện cột số thứ tự
  },
};
const PAGE_TO_ENTITY = { workers:'workers', companies:'companies', … };
```

## 4.2 Bảng kiểu field — khai báo xong là chạy

| `type` | Hiện ở bảng | Hiện ở form | Ghi chú |
|---|---|---|---|
| `text` | chữ thô | `<input type=text>` | |
| `textarea` | chữ thô | `<textarea>` | thường kèm `full:true` |
| `number` | số | `<input type=number>` | |
| `date` | chuẩn hoá `yyyy-mm-dd` | `<input type=date>` | lọc theo **năm → tháng** |
| `datetime` | `M/D HH:mm` | `datetime-local` | |
| `select` | chữ | dropdown + nút ✏ sửa danh sách | tự vào `OPTION_SETS` |
| `select` + `optSource:'users'` | chữ | dropdown lấy từ danh sách người dùng | |
| `radio` | chữ | dãy nút chọn 1 | bỏ trống = tự suy từ checklist |
| `check` | ☑/☐ | checkbox thật, gom 1 hàng ngang | **giá trị lưu vẫn là `☑`/`☐`** |
| `ref` + `ref:'workers'` | link mở 詳細 | ô tìm-và-chọn có gợi ý | |
| `url` | `🔗 開く` | `<input>` | tự thêm `https://` |
| `file` | tên file + link tải | upload | |
| `attachments` | — | khối nhiều file × nhiều loại | lưu ở bảng file riêng |

Cờ đi kèm: `req:true` (bắt buộc) · `full:true` (rộng cả hàng) · `section:'👤 …'` (mở nhóm mới) ·
`help:'…'` (chú thích bấm mở) · `ph:'…'` (placeholder) · `optKey` (chia sẻ danh sách chọn).

## 4.3 Ví dụ thật (rút gọn) — đọc là hiểu ngay cách viết

```js
prospects: {
  label:'新規開拓', key:'prospects', idPrefix:'P',
  fields:[
    {name:'status', label:'状況', type:'select', options:PROSPECT_STATUS_OPTIONS, section:'📊 営業状況'},
    {name:'rank',   label:'見込み度', type:'select', options:['S','A','B','C','D'],
     help:'対応記録から自動提案されます（S=90-100/A=70-89…）。手動修正も可能。'},
    {name:'staff',  label:'営業担当者', type:'select', optSource:'users'},
    {name:'nextDate', label:'次回対応日', type:'date', section:'📞 次回対応'},
    {name:'name',   label:'会社名', type:'text', req:true, section:'🏢 会社情報'},
    {name:'address',label:'住所', type:'text', help:'保存すると都道府県は住所から自動設定されます。'},
    {name:'prefecture', label:'都道府県', type:'select', options:PREFECTURES},
    {name:'note',   label:'営業メモ', type:'textarea', full:true},
  ],
  fixedColOrder:true,
  columns:['id','status','rank','name','phone','contact','lastContact','nextUp','staff']
}
```

Ba điều rút ra:

1. **Thứ tự field = thứ tự người ta nghĩ khi làm việc**, không phải thứ tự trong database.
   Ở đây "đang ở trạng thái nào / ai lo / hôm nào gọi lại" đứng **trước cả tên công ty**,
   vì đó là cái người bán hàng cần trước.
2. `columns` mặc định ít hơn `fields` rất nhiều — mặc định chỉ đủ **ra quyết định**;
   cột còn lại người dùng tự thêm qua `表示項目`.
3. Trường tự động (`prefecture` suy từ `address`) vẫn hiện trong form nhưng có `help` nói rõ
   "để trống cũng được" — tự động mà vẫn cho sửa tay.

## 4.4 Cột ảo (tính lúc render, không lưu)

```js
const COL_VIRT = ['jstatus','progress','appCount','hiredCount','suitability',
                  'lastContact','nextUp','recipDisp','etaDisp', …];
```

Khai báo trong `COL_VIRT` + xử lý trong `cellValue()` + đặt nhãn trong `colLabel()`.
Ba chỗ, không hơn. Không có cột ảo nào được ghi vào dữ liệu.

## 4.5 Danh sách chọn dùng chung

```js
const NATIONALITIES = ['ベトナム','フィリピン', …];
const OPTION_SETS = { NATIONALITY:NATIONALITIES, VISA_STATUS:VISA_STATUS_OPTIONS, … };
// Tự gán optKey cho MỌI select — trừ 'status' (vì badge/workflow phụ thuộc nó)
for(const ek in ENTITIES) ENTITIES[ek].fields.forEach(f=>{
  if(f.type==='select' && f.name!=='status' && !f.optSource && Array.isArray(f.options)){
    let key = Object.keys(OPTION_SETS).find(k=>OPTION_SETS[k]===f.options);
    if(!key){ key = ek+'.'+f.name; OPTION_SETS[key]=f.options; }
    f.optKey = key;
  }
});
```

Hai field khác nhau **trỏ cùng một mảng** → chia sẻ luôn cùng `optKey` → admin sửa 1 lần, cả 2 đổi.
`status` cố tình bị loại vì workflow và màu badge phụ thuộc vào giá trị của nó.

---

# §5. CRUD GENERIC — 1 engine cho mọi trang

## 5.1 Vòng đời render

```
goto(pageId)
   └── renderEntityPage(pageId)
         ├── fcolReg(pageId, adapter)      đăng ký bộ lọc kiểu Excel
         ├── colLabel(col)                 nhãn cột (field hoặc cột ảo)
         ├── cellValue(row,col,ri)         giá trị 1 ô (badge/link/cảnh báo…)
         ├── getVisibleColumns()           cột nào hiện + thứ tự
         ├── sort → filter → build <table>
         └── toolbar + bulk bar + tab phụ
```

Chỉ **một** hàm này render mọi trang danh sách. Trang cần thêm gì thì thêm bằng nhánh `if(pageId==='…')`
đặt gọn ở đầu hàm, không tạo hàm render thứ hai.

## 5.2 Ô có ý nghĩa — quy tắc hiển thị

```js
// Ngày hết hạn: còn ≤3 ngày = badge đỏ; đã qua = "期限切れ"
if(colName==='deadline' && row.deadline && !DONE.includes(row.status)){
  const d=daysUntil(row.deadline);
  if(d!=null && d<0)  return `<span class="badge b-red">期限切れ ${row.deadline}</span>`;
  if(d!=null && d<=3) return `<span class="badge b-red">残り${d}日 ${row.deadline}</span>`;
}
// Ô 2 dòng: dòng 1 = thứ chính, dòng 2 = phụ chú xám nhỏ (không tạo thêm cột)
return `<div style="font-weight:700;">${name}</div>
        <div style="font-size:10.5px;color:var(--muted);">${address}</div>`;
// Danh sách dài: hiện 1 + "他N件", đầy đủ nằm trong title=""
return `<span title="${full}">${first} <span style="color:var(--muted)">他${n-1}件</span></span>`;
// Không có dữ liệu: LUÔN là dấu gạch xám, không bao giờ để trống
return '<span style="color:var(--muted);">-</span>';
```

Bốn khuôn trên phủ ~90% nhu cầu hiển thị. Dùng lại, đừng phát minh kiểu thứ năm.

## 5.3 Form: `openForm(pageId, id, preset)`

- Sinh từ `config.fields`, tự chèn tiêu đề nhóm khi `f.section` đổi.
- Các `type:'check'` nằm liền nhau **tự gom vào 1 hàng ngang** — tích nhanh, đỡ tốn chiều cao.
- `select` luôn giữ giá trị cũ không còn trong options (`_selOptsKeep`) → **không mất dữ liệu**.
- Trường tự tính (VD ngày kết thúc = ngày bắt đầu + 5 năm + kỳ loại trừ) tính lại ngay khi gõ (`oninput`).

## 5.4 Detail modal — dùng CHUNG một builder với bản in PDF

```js
// LAYOUT DÙNG CHUNG cho modal 詳細 & PDF出力 (1 nguồn — không bao giờ lệch thiết kế)
function buildDetailLayout(entity,row){ /* trả về HTML */ }
```

Modal chi tiết và bản PDF **gọi cùng một hàm dựng HTML**; PDF chỉ thêm một khối
`@media print` override (A4 ngang, xám, ẩn icon, nén khoảng cách). Nhờ vậy không bao giờ
xảy ra chuyện "trên màn thấy 12 mục, in ra chỉ có 9".

## 5.5 Nhảy chéo giữa các trang — 2 hàm, dùng khắp nơi

```js
function jumpEdit(pageId,id){ closeModal(); goto(pageId);
  setTimeout(()=>openForm(pageId,id),140); }        // sang trang + mở form sửa
function openDetailModal(entity,id){ … }             // mở chi tiết ngay tại chỗ
```

Mọi link tham chiếu chéo phải dùng 2 hàm này. **Không bao giờ** bắt người dùng
"sang trang kia rồi tự tìm dòng".
---

# §6. BUSINESS_RULES — NGUỒN QUY TẮC DUY NHẤT

> Vì sao có mục này: trước đây luật rải ở 4 nơi (`ENTITIES.req`, `EMP_REQ_BY_STATUS`,
> `REQUIRED_FOR_ACTIVE`, kiểm tra trong `saveForm`) nên sửa một chỗ là ba chỗ kia lệch.
> CSV còn có luồng ghi riêng, bỏ qua hết đồng bộ ngày. → Gom lại còn **một bảng + ba hàm**.

```js
const BUSINESS_RULES = {
  workers: {
    label:'特定技能者情報', idPrefix:'W', hasCode:true,
    required:['name'],          // trường bắt buộc
    refs:[],                    // tham chiếu tới thực thể khác
    updateKey:['code'],         // khoá nhận diện "cùng một bản ghi" khi import
    depends:[],                 // điều kiện nghiệp vụ phải thoả trước khi tạo
    allowReplace:true,          // có mã → cho phép chế độ 全置き換え
  },
  employment: {
    label:'雇用管理', idPrefix:'E', hasCode:false,
    required:['workerId'],
    refs:[{f:'workerId',to:'workers'},{f:'companyId',to:'companies'}],
    updateKey:['workerId','companyId','joinDate'],
    depends:[{rule:'hasOnboarding'}],   // phải có bản ghi 入社 trước
    allowReplace:false,                 // không có mã → 全置き換え sẽ đứt liên kết
  },
};
```

### Ba hàm công khai — không có hàm thứ tư

```js
refResolve(to, raw)             // dò tham chiếu: ① UUID ② mã W/C ③ id cũ ④ TÊN (cuối, có cảnh báo)
validateRecord(coll, rec, opts) // → { errors:[], warnings:[] }
commitRecord(coll, rec, opts)   // ĐƯỜNG GHI DUY NHẤT
```

### `commitRecord()` làm gì (thứ tự cố định)

```js
function commitRecord(coll, rec, opts){
  1. Xoá khoá tạm  (rec.__xxx — chỉ sống lúc đối chiếu CSV, lọt vào là rác vĩnh viễn)
  2. Chuẩn hoá tự động (VD: suy 都道府県 từ 住所 — DUY NHẤT ở đây, nên tay/CSV/import đều giống nhau)
  3. Tìm bản ghi cũ theo opts.existingId
  4a. UPDATE: ô TRỐNG trong nguồn KHÔNG xoá giá trị đang có (opts.keepEmpty===false)
  4b. INSERT: sinh id + sinh mã (nextCode) nếu hasCode
  5. Hiệu ứng phụ vòng đời (VD: tạo 入社 → tự sinh bản ghi trung tâm 雇用)
  6. Đồng bộ ngày giữa các giai đoạn (_syncLifecycleDates)
  7. Ghi ngược master ↔ vệ tinh (_pushMasterToWorker / _pullMasterToEmployments)
  8. logActivity('追加'|'編集', pageId, nhãn + nguồn)
  return { mode:'insert'|'update', record }
}
```

**Luật:** import CSV chỉ được phép *chuẩn bị `rec`* rồi gọi hàm này. Không có luồng ghi riêng.

### Chuẩn hoá tham chiếu — chỗ hay trượt nhất

Trước khi so khớp phải `normalize('NFKC')`:
`Ｗ３５４` (gõ bằng IME Nhật, toàn giác) ≠ `W354` (bán giác) — nhìn giống nhau, máy thấy khác nhau.
Đây là nguyên nhân của một sự cố mất dữ liệu thật (xem §16).

### Khai báo nghiệp vụ theo thời gian sống của hồ sơ

Vòng đời có nhiều giai đoạn thì **chỉ có một bản ghi trung tâm** mang định danh xuyên suốt
(ở CRM là `employment` + `employment_uid`); các trang giai đoạn (入社 / 退社 / 帰国) là
**vệ tinh trỏ về** nó. Không trang nào tạo lại bản ghi trung tâm của riêng mình.

```
入社管理 ──┐
雇用管理 ←─┼── cùng employment_uid ─→ 退社管理
帰国管理 ──┘   (chạy song song, không đổi 雇用状況)
```

---

# §7. LỌC — 2 TẦNG

## 7.1 Tầng 1: hàng ô lọc chữ (gõ tới đâu lọc tới đó)

```js
const FILTER_STATE={};   // pageId → { colName: value }
function setFilter(pageId,col,val){
  …; renderEntityPage(pageId);
  const inp=document.querySelector(`[data-fc="${pageId}:${col}"]`);
  if(inp){ inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }  // ★ giữ con trỏ
}
```

Render lại toàn trang mỗi lần gõ → **bắt buộc phải trả lại focus + vị trí con trỏ**, nếu không
người dùng gõ được 1 ký tự là mất focus.

## 7.2 Tầng 2: lọc kiểu Excel qua ▼ trên tiêu đề cột (mạnh hơn, dùng nhiều hơn)

```js
fcolReg(pageId, {
  rows:      ()=>list,
  valueOf:   (row,col)=>sortValue(config,row,col),
  isDate:    (col)=>field(col)?.type==='date',
  filterable:(col)=>col!=='id',
  onChange:  ()=>renderEntityPage(pageId),
});
```

Hành vi bắt buộc:

- Popup liệt kê **giá trị có thật trong dữ liệu** (facet), sắp xếp theo `localeCompare('ja',{numeric:true})`.
- Ô trống gom thành mục **`（空欄）`** và **luôn xếp cuối** — lọc "chưa nhập" là nhu cầu thật.
- Cột ngày gom **năm → tháng** (2 cấp, gập được). Không ai lọc theo 365 ngày rời rạc.
- Có ô tìm trong popup + `すべて選択` / `すべて解除`.
- Chọn hết = **không lọc** (xoá khỏi state, không lưu mọi giá trị).
- Chọn 0 mục = hiện 0 dòng (sentinel `__fcol_none__`), không phải "bỏ lọc".
- Cột đang lọc: chữ ▼ đổi thành nền primary trắng chữ. Toolbar hiện `✕ フィルタ解除 (3)`.
- Popup `position:fixed`, tự lật lên khi gần đáy màn hình, đóng khi click ra ngoài.

**Lọc và xuất file dùng chung một đường**: `Excel / CSV / 印刷` xuất **đúng những gì đang thấy**
(đã lọc, đã sắp xếp, đúng cột hiển thị). Không bao giờ xuất "toàn bộ dữ liệu" khi màn đang lọc.

---

# §8. CỘT · SẮP XẾP · TUỲ BIẾN

| Cơ chế | Lưu ở | Phạm vi | Ai sửa |
|---|---|---|---|
| `COL_PREFS` — cột nào hiện, thứ tự | localStorage | từng máy | mọi người |
| `SORT_PREFS` — sắp xếp nhiều cấp | localStorage | từng máy | mọi người |
| `FCOL` — bộ lọc đang bật | bộ nhớ | phiên làm việc | mọi người |
| `OPTION_SETS` — danh sách chọn | localStorage + `app_state` | **toàn công ty** | Admin |
| `CUSTOM_FIELDS` — cột tự thêm | localStorage + `app_state` | **toàn công ty** | Admin |
| `FIELD_ORDER` / `FIELD_LABELS` | localStorage + `app_state` | **toàn công ty** | Admin |

**Luật:** *sở thích cá nhân* nằm ở máy; *định nghĩa dữ liệu* phải đẩy lên `app_state`
để mọi máy giống nhau (`_masterPublish()`). Trước đây định nghĩa chỉ ở localStorage
→ admin sửa xong chỉ mình admin thấy.

## 8.1 Bảng chọn cột (`表示項目`)

- Liệt kê **mọi** field + cột ảo mà trang dùng.
- Kéo thả đổi thứ tự (`.drag-handle` + `dragover` highlight).
- Cột tự thêm có nút xoá đỏ ngay trong danh sách.
- `fixedColOrder:true` → khoá thứ tự theo `config.columns`, người dùng chỉ bật/tắt.

## 8.2 Cột tự thêm (người dùng tự tạo field mới, không cần lập trình viên)

```js
const name = 'custom_' + Date.now();      // không bao giờ đụng tên field hệ thống
const field = {name, label, type, custom:true};
if(type==='select'){ field.options=opts; field.optKey=config.key+'.'+name; }
config.fields.push(field);  CUSTOM_FIELDS[config.key].push(field);  saveCustomFields();
```

Xoá cột tự thêm phải dọn sạch **cả 3 nơi**: định nghĩa · dữ liệu trong mọi dòng · `COL_PREFS`.

## 8.3 Sắp xếp nhiều cấp

Hộp thoại `並び替え` cho chọn nhiều cột theo thứ tự ưu tiên (`列A → 列B → 列C`), mỗi cột chọn tăng/giảm.
Số cấp hiện ngay trên nút: `↕️ 並び替え (2)`.
Ngoài ra bấm vào tiêu đề cột ở màn chi tiết → `default → asc → desc → default`, **giá trị trống luôn xếp cuối**.

---

# §9. PHÂN QUYỀN — 3 LỚP

## Lớp 1 — Vai trò (thô, quyết định thấy trang nào)

```js
const ROLES = {
  Admin:   {label:'管理者',      pages:'all', canEdit:true,  canDelete:true,  canSettings:true, canUsers:true, canMail:true},
  Manager: {label:'マネージャー', pages:[…],  canEdit:true,  canDelete:false, canSettings:false,canUsers:false,canMail:true},
  Staff:   {label:'スタッフ',    pages:[…],  canEdit:true,  canDelete:false, canSettings:false,canUsers:false,canMail:true},
  Viewer:  {label:'閲覧者',      pages:[…],  canEdit:false, canDelete:false, canSettings:false,canUsers:false,canMail:false},
};
```

> **Staff KHÔNG xoá được** (§0.5). Ai cần xoá thì báo Admin, hoặc Admin cấp riêng ở 個別設定.

## Lớp 2 — Quyền theo TỪNG TRANG (`入力 / 編集 / 削除 / 表示`)

```js
const PERM_PAGES = [
  {id:'workers',   label:'特定技能者情報'},
  {id:'employment',label:'②雇用管理'},
  …
];
function pagePerm(pageId, action){            // 'c' | 'e' | 'd'
  const p = permOfUser(_myEmail(), CURRENT_ROLE, pageId);
  return action==='c'?p.c:(action==='e'?p.e:p.d);
}
const canCreate = id=>pagePerm(id,'c');
const canEditP  = id=>pagePerm(id,'e');
const canDeleteP= id=>pagePerm(id,'d');
```

**`permOfUser()` là hàm DÙNG CHUNG giữa frontend và `backend/src/authz.ts`.**
Trước đây có hai bản luật gần giống nhau → sửa một bên là bên kia lệch.

## Lớp 3 — Backend chặn thật (frontend chỉ là lịch sự)

Mỗi lần ghi (`PUT /state-delta`) đi qua 3 cổng:

```
LỚP 1  canWriteAtAll(role,status)   tài khoản còn hiệu lực không (LUÔN chặn thật)
LỚP 2  checkCollections(...)        quyền 入力/編集/削除 theo từng bảng
LỚP 3  checkTransitions(...)        luật chuyển giai đoạn (dùng chung employment.ts với frontend)
```

Cộng thêm luật **đặc biệt về khoá cấu hình**:

```js
// Người không phải Admin đẩy lên userPerms/pagePerms/users → LẲNG LẶNG BỎ khoá đó,
// KHÔNG trả 403 cho cả request. Vì 403 làm máy Staff kẹt vòng đồng bộ,
// dữ liệu nghiệp vụ bình thường cũng không lên được nữa.
if(role!=='Admin') for(const k of ['userPerms','pagePerms','users']) delete changed[k];
```

Đây là cách vá sự cố "quyền admin cấp xong tự biến mất": máy Staff giữ bản `userPerms` cũ
rồi đẩy đè lên bản mới của Admin.

**Chế độ triển khai dần:** `PERM_MODE='log'` → ghi nhật ký chỗ *lẽ ra đã chặn* nhưng vẫn cho qua.
Chạy vài ngày, đọc `sync_log`, thấy không có báo động giả mới bật `PERM_MODE='enforce'`.
Không bao giờ bật siết quyền thẳng vào ngày làm việc.

---

# §10. GỬI MAIL — TEMPLATE ENGINE

## 10.1 Kiến trúc: mỗi người gửi bằng Gmail của chính mình

```
CRM ──POST JSON──► Google Apps Script (mỗi người tự deploy bằng Gmail mình)
                     └─ GmailApp.sendEmail(...)  → thư đi từ hộp thư của chính họ
```

Vì sao không dùng SMTP tập trung: thư gửi khách hàng phải xuất phát từ người phụ trách thật
(khách trả lời thì vào đúng hộp thư), và không phải xin quyền domain-wide delegation.

Quy tắc:

- `gasUrl` lưu **trong hồ sơ tài khoản** (`profiles`), không phải trong máy → đổi máy vẫn gửi được.
- Quyền gửi tách riêng (`mail_allowed`), Admin cấp. Chưa cấp thì hiện dải cảnh báo, **không ẩn nút**
  (ẩn thì người dùng tưởng hệ thống hỏng).
- Giới hạn dung lượng ghi rõ trên UI: 3MB/file, 10MB/thư.

## 10.2 Biến `{{…}}` sinh TỰ ĐỘNG từ ENTITIES

```js
const RPT_COMMON_VARS=[
  ['{{recipient}}','宛名'],['{{company_name}}','会社名'],['{{worker_name}}','対象者名'],
  ['{{sender_name}}','差出人'],['{{today}}','本日'],['{{signature}}','署名'],
  ['{{people_details}}','各人明細(複数名)'],
  ['{{#each_person}}','▼各人くり返し開始'],['{{/each_person}}','▲くり返し終了'],['{{no}}','番号'],
];
function rptVarsFor(pageId){          // mọi field của trang → 1 biến, tự động
  return RPT_COMMON_VARS.concat(
    ENTITIES[PAGE_TO_ENTITY[pageId]].fields.map(f=>['{{'+f.name+'}}', f.label]));
}
```

**Thêm field mới = tự động có biến email mới.** Không phải sửa mẫu, không phải sửa code gửi mail.

Vòng lặp nhiều người trong 1 thư:

```
{{#each_person}}
【{{no}}. {{worker_name}}】
・入社日：{{joinDate}}
{{/each_person}}
```

## 10.3 Thanh mẫu thư — bố cục chuẩn (dùng lại ở MỌI màn gửi thư)

```html
<div class="tplbar">
  <span class="tpl-lb">📝 テンプレ</span>
  <select class="tpl-sel">…mẫu của trang này…</select>
  <a class="pillbtn pill-pin">📌 固定</a>     <!-- ghim mẫu mặc định cho trang -->
  <a class="pillbtn pill-save">💾 保存</a>     <!-- lưu nội dung đang soạn thành mẫu -->
  <a class="pillbtn pill-manage">⚙ 管理</a>   <!-- sửa / nhân bản / xoá -->
</div>
<div>…chip {{biến}} bấm để chèn vào vị trí con trỏ…</div>
<input  id="mailSubj" placeholder="件名">
<textarea id="mailBody" rows="14"></textarea>
```

- Mẫu **thuộc về từng trang** (`DB.reportTpl[pageId]`) — mẫu của 入社 không lẫn vào mẫu của 営業.
- **Ghim** (`pin`) = lần sau mở hộp soạn thư là mẫu đó tự điền sẵn. Đây là tính năng được dùng nhiều nhất.
- Chip biến bấm-để-chèn quan trọng hơn tài liệu hướng dẫn: không ai nhớ tên biến.
- Chữ ký cá nhân tự nối vào cuối (`{{signature}}`), trừ khi đang ở trong vòng lặp từng người.

## 10.4 Gửi hàng loạt — luật "1 nơi nhận = 1 thư"

Chọn 12 người thuộc 5 công ty → hệ gom thành **5 thư**, mỗi thư liệt kê người của công ty đó
(`{{people_details}}`). Không gửi 12 thư rời, cũng không gửi 1 thư CC hết.
Đây là luật nghiệp vụ, không phải tối ưu kỹ thuật: người nhận chỉ được thấy dữ liệu của họ.

## 10.5 Lịch sử gửi — bắt buộc, hiện ngay cạnh nút

```js
function recordMailSent(ctx,to,subject,via){
  DB.mailLog.push({at:ISO, by:tên, byEmail, to, subject, ctx, via:'GAS'});
  if(DB.mailLog.length>500) DB.mailLog = DB.mailLog.slice(-500);
}
```

- Cạnh nút gửi luôn có dòng: `📧 最終送信: 2026-08-25 14:30（送信者: 田中）` hoặc `📭 まだ送信していません`.
- Bấm `📋 送信履歴（8件）` xổ ra danh sách.
- **Sai tên biến là bug im lặng**: `mailLog` ≠ `mailLogs`. Ghi sai chữ `s` → lịch sử trắng
  mà không có lỗi nào hiện ra. Đặt hằng số cho tên collection nếu sợ.
---

# §11. AUDIT LOG & AN TOÀN DỮ LIỆU

Bốn lớp ghi nhận, mỗi lớp trả lời một câu hỏi khác nhau:

| Lớp | Bảng / biến | Trả lời câu hỏi | Giữ bao lâu |
|---|---|---|---|
| Thông báo | `DB.activityLog` (client) | "Vừa có ai làm gì?" | 200 dòng gần nhất |
| Nhật ký thao tác | `audit_log` (PG) | "Ai sửa ô nào, từ gì thành gì?" | vĩnh viễn |
| Nhật ký đồng bộ | `sync_log` (PG) | "Máy nào ghi? Có bị chặn không? Vì sao?" | vĩnh viễn |
| Lịch sử phiên bản | `app_state_history` (PG) | "Lùi về lúc 14:00 hôm qua được không?" | 24h đủ + 7 ngày/giờ + 30 ngày/ngày |

## 11.1 Thông báo trong app (nhẹ, hiện ở chuông 🔔)

```js
function logActivity(action,pageId,label){
  DB.activityLog.unshift({ user:tênNgườiDùng, action, app:ENTITIES[…].label,
                           label, time:new Date().toISOString() });
  if(DB.activityLog.length>200) DB.activityLog.length=200;
}
// hiển thị: 「田中 が 所属機関情報「株式会社ABC」を編集」  2026-08-25 14:32
```

Chấm đỏ trên chuông so `activityLog.length` với mốc đã xem lưu ở localStorage.
Chuông còn gánh **cảnh báo hạn nộp** (đỏ, đặt trên cùng) — vì cảnh báo hạn cũng là "việc mới".

## 11.2 Nhật ký thao tác (bảng `audit_log`)

```sql
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_email TEXT, actor_name TEXT,
  action TEXT,        -- create | update | delete
  entity TEXT, entity_id TEXT,
  detail JSONB        -- update: {field:{old,new}} · delete: toàn bộ dòng cũ
);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX idx_audit_at     ON audit_log(at);
```

Màn hình `操作履歴` hiện **nhãn tiếng người, không phải tên cột**:

```js
function _auditFieldLabel(table, fieldName){    // 'visa_exp' → '在留期限'
  const ent = AUDIT_TABLES[table]?.ent;
  return ENTITIES[ent]?.fields.find(f=>f.name===fieldName)?.label || fieldName;
}
function _auditVal(table, field, v){
  if(v==null||v==='') return '(空)';            // trống phải hiện rõ là "(空)"
  if(field==='workerId')  return refLabel('workers', v);   // id → tên người
  if(v===true) return '有'; if(v===false) return '無';
  return String(v);
}
```

Nhật ký mà hiện `visa_exp: null → 2027-03-01` thì không ai đọc.
Phải là `在留期限: (空) → 2027-03-01`.

Bộ lọc bắt buộc: **アプリ · 操作(作成/更新/削除) · 利用者メール · khoảng ngày**. 500 dòng mới nhất.

## 11.3 Bố cục màn `操作履歴` — 3 tab + thẻ cảnh báo cố định

```
🛡 thẻ cảnh báo (LUÔN hiện phía trên tab — tín hiệu sớm, không giấu trong tab)
┌──────────────┬───────────────┬───────────────┐
│ ① 同期ガード │ ② データ復元  │ ③ 変更履歴 ✓ │   ← mặc định ở tab ③
└──────────────┴───────────────┴───────────────┘
```

- ① máy nào ghi, IP nào, bị chặn hay không.
- ② danh sách phiên bản → nút khôi phục.
- ③ thay đổi ở mức từng ô (mặc định).
- Tab điều khiển được bằng `←/→` (`role="tablist"`, `aria-selected`).
- **Staff/Manager cũng vào được** nhưng chỉ thấy thao tác của chính mình
  (`/my-audit`, email cố định ở server, không truyền từ client).

## 11.4 Khôi phục dữ liệu — mục tiêu "vài giây", không phải "vài tiếng"

```sql
CREATE TABLE app_state_history (
  id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ DEFAULT now(),
  actor_email TEXT,
  reason TEXT,     -- delta | before-restore | restore | manual
  counts JSONB,    -- {workers:456, companies:92} → xem nhanh không cần mở data
  data   JSONB NOT NULL
);
```

- **Mỗi lần ghi tạo một ảnh chụp.** Trước khi khôi phục cũng chụp thêm một bản (`before-restore`)
  → khôi phục nhầm vẫn quay lại được.
- `counts` là thứ giúp chọn đúng bản: nhìn `workers: 455 → 6` là biết ngay bản nào hỏng,
  không phải mở JSON 40MB ra đọc.

---

# §12. ĐỒNG BỘ ĐA THIẾT BỊ

## 12.1 Năm luật bất di bất dịch (viết ngay đầu khối code)

```
1. NGUỒN SỰ THẬT DUY NHẤT = PostgreSQL trên server.
2. localStorage CHỈ LÀ CACHE. Không hợp lệ → vứt, tải lại. Không bao giờ là dữ liệu gốc.
3. KHÔNG BAO GIỜ sinh dữ liệu demo khi cache rỗng.
4. KHÔNG BAO GIỜ đẩy lên server dữ liệu chưa từng đến TỪ server (cờ fromServer).
5. KHÔNG BAO GIỜ upload toàn bộ database. Chỉ ghi theo từng record qua /state-delta.
```

## 12.2 Bảy chốt chặn ở `PUT /state-delta`

| # | Chốt | Chặn điều gì |
|---|---|---|
| 1 | `x-client-contract >= MIN` | Trình duyệt còn cache HTML cũ → **426**, bắt tải lại |
| 2 | `canWriteAtAll(role,status)` | Tài khoản đã khoá vẫn ghi được → **403** |
| 3 | `since > 0` | Chưa từng pull mà đã đẩy → **409** (lỗ hổng đã bị khai thác thật) |
| 4 | `clientEpoch === stateEpoch` | Client cầm dữ liệu của "bản database" khác sau restore → **409** |
| 5 | `delTotal <= MAX_DELETE_PER_REQ` | Xoá hàng loạt bất thường → **409** |
| 6 | `colRev[k] <= since` | Xung đột: server đã có bản mới hơn → **409 + trả về `current`** |
| 7 | `isSuspiciousShrink(before,after)` | 455 dòng → 6 dòng → **409 SHRINK GUARD** |

Chốt 7 là chốt cứu mạng. Nó cho phép `455 → 455` (migration) nhưng chặn `455 → 6` (thảm hoạ).
Muốn vượt phải gửi `confirmShrink:true` — nghĩa là **con người đã nhìn và đồng ý**.

## 12.3 Ghi theo record + gộp 3 chiều

```js
// mảng bản ghi → gộp theo id; object/cấu hình → thay nguyên
if(Array.isArray(inc) && isRecordArray(base)){
  const m = mergeCollection(base, inc, deleted[k]||[]);
  stats[k] = `${before}→${m.out.length} (+${m.added} ~${m.updated} -${m.removed})`;
}
```

Khi có `409 conflict`, server trả về `current` → client **gộp xuống tới CẤP FIELD**
(hai người sửa hai ô khác nhau của cùng một dòng thì cả hai đều được giữ), rồi đẩy lại.
Không bao giờ hỏi người dùng "giữ bản nào".

Sau khi commit thành công, server trả `applied` = **kết quả SAU khi gộp**, client áp dụng ngay
→ màn hình không bao giờ lệch với server dù chỉ 1 giây.

## 12.4 Realtime bằng SSE (không WebSocket)

```
GET /events  →  server đẩy 1 dòng khi có ai ghi xong
client nhận  →  pull /state-diff  →  render lại trang đang mở
```

`sseBroadcast()` gọi **sau khi COMMIT**, không bao giờ báo trước khi lưu.
SSE đủ vì luồng dữ liệu chỉ 1 chiều (server → client); chiều ngược lại đã có `PUT`.

## 12.5 Quản lý cache

```js
const CACHE_VERSION = 2;   // tăng số này = MỌI máy tự xoá cache cũ ở lần tải kế tiếp
const CLIENT_CONTRACT = 3; // hợp đồng API của bản frontend này (phải khớp backend)
```

- `?fresh=1` trên URL → xoá sạch cache máy đó, giữ đăng nhập. Dùng khi khởi động lại sau sự cố.
- Trước khi vứt cache còn thay đổi chưa đồng bộ → lưu bản **cứu hộ** (`RESCUE_KEY`).
- Có **vân tay cache** để phát hiện cache bị sửa từ bên ngoài.
- API có đường dự phòng: `api.domain.com` lỗi → tự chuyển sang `origin/api` (cùng origin, không CORS)
  và nhớ lựa chọn đó. Sinh ra từ sự cố thật: một máy bị extension chặn subdomain, trả 200 nhưng mất header CORS.

---

# §13. PORTAL PHỤ (mobile-first)

Cùng backend, khác hoàn toàn về hình thức. Đây là bản rút gọn cho người dùng cuối / khách hàng.

```css
:root{ --primary:#1677ff; --bg:#f7f8fa; --card:#fff; --border:#e5e9f0; … }
.wrap{ max-width:520px; margin:0 auto; padding:14px 14px 92px; }  /* chừa chỗ bottom-nav */
.card{ background:var(--card); border:1px solid var(--border); border-radius:14px;
       padding:16px; margin-bottom:12px; box-shadow:0 1px 2px rgba(16,24,40,.04); }
.btn{ display:block; width:100%; padding:14px; border-radius:12px;
      background:var(--primary); color:#fff; font-size:16px; font-weight:700; }
input,select,textarea{ padding:13px; font-size:16px; border-radius:10px; }  /* 16px = iOS không zoom */
.top{ position:sticky; top:0; display:flex; gap:9px; padding:11px 14px;
      background:#fff; border-bottom:1px solid var(--border); z-index:5; }
```

Khác biệt so với màn quản trị:

| | Quản trị (PC) | Portal (điện thoại) |
|---|---|---|
| Bố cục | bảng nhiều cột | **card xếp dọc**, 1 card = 1 việc |
| Điều hướng | sidebar | **bottom-nav 4 tab** (không hơn 5) |
| Nút | inline, nhiều | **full-width, 1 nút chính mỗi màn** |
| Chữ | 14px | 15–16px |
| Bo góc | 10px | 12–14px |
| Tiến độ | badge | **timeline dọc** + thanh bước ngang |

Thành phần dùng nhiều nhất ở portal: **timeline dọc** (chấm tròn + đường nối + card) để trả lời
"tôi đang ở bước nào" — cùng ngôn ngữ hình ảnh với thanh tiến độ ngang bên màn quản trị,
để nhân viên và khách hàng nói chuyện được với nhau qua điện thoại.

**Bẫy đã gặp:** file portal chỉ được sửa bằng công cụ giữ nguyên **UTF-8 + kiểu xuống dòng gốc**.
Đổi LF ↔ CRLF hoặc chèn BOM/NUL vào giữa file HTML lớn → trang trắng, và diff nhìn không ra.

---

# §14. IN ẤN · PDF · EXCEL · CSV

## 14.1 Bốn nút xuất, bốn mục đích khác nhau — nói rõ trong nhãn

| Nút | Mục đích | Nạp lại được? |
|---|---|---|
| `📊 Excel` | để **xem / in** | ❌ |
| `📄 CSV雛形` | mẫu trống để nhập lần đầu | ✅ |
| `📝 一括修正用に書き出し` | xuất kèm cột ID để sửa hàng loạt | ✅ |
| `🖨 印刷` | in danh sách đang thấy | — |

Người dùng hay nhầm `📊` với `📝`. Giải pháp không phải viết hướng dẫn mà là **đặt tên nút đúng việc**.

## 14.2 Quy trình sửa hàng loạt (đã kiểm chứng trong vận hành thật)

```
📝 一括修正用に書き出し (CSV có cột ID)
   → sửa trong Excel (nhiều người, nhiều cột cùng lúc)
   → 📥 CSV取込 → chọn 上書き更新
   → XEM TRƯỚC từng dòng: 追加 / 更新 / エラー kèm lý do
   → bấm xác nhận mới ghi
```

Luật: khớp **theo ID chính xác 100%**; ô trống **giữ nguyên** giá trị cũ;
mã đúng nhưng tên lệch → **chặn** (chống điền nhầm dòng); dòng thiếu bản ghi gốc → **từ chối kèm lý do**,
không sinh bản ghi mồ côi.

Bốn chế độ nhập: `重複スキップ` (mặc định) · `上書き更新` · `追加のみ` · `全置き換え`
(chỉ trang gốc có mã mới được, vì không mã thì thay hết = đứt liên kết).

## 14.3 In A4 — chỉ in dữ liệu nghiệp vụ

```css
@media print{
  /* Ẩn UI quản lý: thanh lọc, tab, nút, cảnh báo, thanh hoàn thiện… */
  .toolbar,.filter-row,.emp-tabs,#sidebar,#topbar,#themeToggle{ display:none !important; }
  @page{ size:A4 landscape; margin:8mm; }
  body{ background:#fff; }
}
```

Xuất PDF của 1 hồ sơ = **dùng lại builder của modal 詳細** + khối override in
(A4 ngang, 1 trang, xám, ẩn icon). Một nguồn HTML → bản in không bao giờ lệch màn hình (§5.4).

Với biểu mẫu in phức tạp (phong bì, giấy tờ hành chính) thì tách hẳn một **engine template theo mm**:
`pages[]` × phần tử đặt tuyệt đối theo mm, không phụ thuộc CSS trang. In sai 1 trang thành 2 trang
hầu như luôn do trộn đơn vị px với mm.

---

# §15. CHECKLIST DỰNG APP MỚI

### Ngày 1 — Khung

1. Copy `web/index.html`, xoá phần thân nghiệp vụ, **giữ**: tokens · topbar · sidebar · modal ·
   toolbar · engine CRUD · filter · sync · audit.
2. Đổi trong `:root`: `--primary`, `--accent`. Đổi logo, favicon, `<title>`.
3. Đổi tiền tố khoá lưu trữ: `biglight_*` → `<app>_*` (`STORAGE_KEY`, `AUTH_KEY`, `COL_PREFS_KEY`…).
4. Khai báo `NAV_GROUPS` + `ICONS` theo dòng chảy công việc của nghiệp vụ mới.

### Ngày 2 — Dữ liệu

5. Viết `ENTITIES` (§4). Với mỗi thực thể: `label` · `key` · `idPrefix` · `fields` · `columns`.
6. Viết `BUSINESS_RULES` (§6): `required` · `refs` · `updateKey` · `depends` · `allowReplace`.
7. Điền `PAGE_TO_ENTITY`, `PERM_PAGES`, `AUDIT_TABLES`, `statusBadge()` map.
8. Backend: thêm `SCHEMA` mirror (chỉ để pgAdmin xem), giữ nguyên `/state-delta`.

### Ngày 3 — Nghiệp vụ riêng

9. Thêm cột ảo cần tính (`COL_VIRT` + `cellValue` + `colLabel`).
10. Thêm nút hành động theo trạng thái vào menu `⋮` và thanh hàng loạt.
11. Mẫu email cho từng trang (biến `{{}}` đã tự có).
12. Dashboard: chọn 4–6 khối màu, mỗi khối = một câu hỏi quản lý.

### Trước khi bàn giao — 12 câu kiểm

- [ ] Cache rỗng → app hiện "đang tải", **không** sinh dữ liệu mẫu?
- [ ] Tắt mạng → sửa → bật mạng: dữ liệu lên đủ, không mất?
- [ ] Hai máy sửa hai ô của cùng một dòng: cả hai đều còn?
- [ ] Xoá 200 dòng: bị SHRINK GUARD chặn?
- [ ] Đăng nhập bằng Viewer: không thấy nút thêm/sửa/xoá ở **mọi** trang?
- [ ] Vào `操作履歴`: thấy đủ ai/lúc nào/ô nào/cũ→mới với **nhãn tiếng người**?
- [ ] Lọc rồi bấm `📊 Excel`: file ra **đúng** dữ liệu đang thấy?
- [ ] Điện thoại: bảng đọc được, form gõ được, không bị iOS tự phóng?
- [ ] Dark mode: mọi màn, kể cả HTML do JS sinh với màu inline?
- [ ] In A4: không có nút/thanh lọc nào lọt vào bản in?
- [ ] Đổi một giá trị trong danh sách chọn: dữ liệu cũ vẫn hiện đúng?
- [ ] Xoá 1 dòng rồi mở `データ復元`: lùi lại được trong <30 giây?

---

# §16. ANTI-PATTERN — bài học từ sự cố thật

### ❌ API "ghi toàn bộ database"
Một trình duyệt đã thay toàn bộ dữ liệu công ty bằng dữ liệu demo. Mất 6 tiếng chỉ để xác định
nên lùi về đâu (log Docker đã mất sạch cùng container).
**→ Gỡ vĩnh viễn `PUT /state`. Giữ route lại chỉ để trả lỗi RÕ RÀNG cho client cũ**
(404 khiến client tưởng backend cũ rồi thử lại mãi).

### ❌ Nhật ký chỉ nằm trong log của container
Rebuild container là mất sạch. **→ Nhật ký phải nằm trong database** (`sync_log`), kể cả những
lần ghi **bị chặn** — biết ai đang cố làm gì mới quan trọng.

### ❌ Hai bản luật gần giống nhau ở frontend và backend
Sửa một bên, bên kia lệch, không ai phát hiện. **→ Chung một module** (`employment.ts`, `permOfUser`).

### ❌ "Thay nguyên" cho khoá cấu hình
Máy Staff giữ `userPerms` cũ, đẩy đè lên bản Admin vừa sửa → quyền tự biến mất.
**→ Khoá cấu hình chỉ Admin đẩy được; máy khác thì lẳng lặng bỏ khoá đó, không 403 cả request.**

### ❌ `select` full-width vs half-width
Giá trị hiển thị bằng mắt giống hệt nhưng khác byte → chọn xong lưu ra rỗng, **mất dữ liệu âm thầm**.
**→ `normalize('NFKC')` trước mọi so khớp; và có script phục hồi từ `audit_log`.**

### ❌ `overflow:hidden` trên `<table>` để bo góc
Giết luôn `position:sticky` của `<th>`. **→ Dùng `overflow:clip`.**

### ❌ Render lại rồi quên trả focus
Ô lọc mất focus sau mỗi ký tự. **→ Sau render, `focus()` + `setSelectionRange(len,len)`.**

### ❌ Hiện "0" khi không lấy được số
Badge "0 việc cần xử lý" trong khi thực tế có 12. **→ Không lấy được thì không hiện gì.**

### ❌ Lưu số đếm vào dữ liệu
`応募者数` lưu sẵn rồi lệch với số dòng thật. **→ Tính lúc render.**

### ❌ Xoá chức năng khỏi code khi bỏ khỏi menu
Ba tuần sau cần lại, phải viết lại từ đầu. **→ Bỏ khỏi `NAV_GROUPS`, giữ code + dữ liệu,
ghi comment "khôi phục = bỏ comment 1 dòng này".**

### ❌ Sửa file HTML lớn bằng công cụ đổi kiểu xuống dòng
LF → CRLF hoặc chèn NUL giữa file → trang trắng, diff khổng lồ, không tìm ra chỗ hỏng.
**→ Sửa bằng công cụ giữ nguyên byte; kiểm tra `file`/`hexdump` trước khi commit.**

---

## PHỤ LỤC A — Bộ khung tối thiểu để bắt đầu

```
app/
├── web/index.html          SPA quản trị (tokens → ENTITIES → engine → init)
├── portal/index.html       (tuỳ chọn) portal người dùng cuối
├── backend/
│   ├── src/index.ts        Express: /state /state-delta /events /audit /state-history
│   ├── src/authz.ts        permOfUser + checkCollections + checkTransitions
│   ├── src/merge.ts        gộp theo record
│   └── schema.sql          users / sessions
├── docker-compose.yml      backend + postgres + caddy/nginx
└── QUY-TAC-*.md            luật nghiệp vụ viết bằng tiếng người
```

## PHỤ LỤC B — Thứ tự các khối trong `index.html` (giữ đúng để Ctrl+F ra ngay)

```
1  <head> — chống nháy theme, favicon, title
2  <style> — DESIGN SYSTEM → DARK → TOPBAR → SIDEBAR → nút → bảng → modal → form → responsive → print
3  <body> — topbar / sidebar / <main> chứa mọi <div class="page">
4  CONFIG · ROLES & PERMISSIONS
5  Hằng số danh sách chọn (OPTIONS)
6  ENTITIES  ← khai báo dữ liệu
7  OPTION_SETS · CUSTOM_FIELDS · FIELD_ORDER
8  PAGE_TO_ENTITY · DATA STORE · SYNC · SSE
9  MAIL (GAS · template engine)
10 COL_PREFS · SORT_PREFS · HELPERS
11 RENDER: NAV · ROUTER · USERS · AUDIT · SETTINGS
12 BUSINESS_RULES · validateRecord · commitRecord
13 FILTER · RENDER: ENTITY PAGES · MODAL FORM · DETAIL MODAL
14 Màn hình chuyên biệt của từng nghiệp vụ
15 PRINT · EXPORT · AUTH · INIT
```

## PHỤ LỤC C — Tài liệu luật nghiệp vụ nên có (viết bằng tiếng người, không phải code)

| File | Nội dung |
|---|---|
| `QUY-TAC-NHAP-LIEU.md` | sơ đồ luồng nhập, trang nào có `＋新規追加` và **vì sao** |
| `THIET-KE-MO-HINH-*.md` | mô hình vòng đời, trạng thái, luật chuyển giai đoạn |
| `QUY-TAC-IN-AN-*.md` | luật in ấn, đơn vị mm, bẫy đã gặp |
| `RCA-<ngày>-*.md` | phân tích nguyên nhân gốc của mỗi sự cố + việc đã sửa |
| `BAO-CAO-*.md` | báo cáo hiện trạng theo mốc |

Mỗi luật trong tài liệu phải kèm **ngày chốt** và **lý do**. Luật không có lý do
sẽ bị người sau (hoặc AI) gỡ đi vì "trông có vẻ thừa".

---

> **Tóm tắt trong một câu:** engine không đổi, chỉ đổi bảng khai báo —
> `ENTITIES` (dữ liệu) + `BUSINESS_RULES` (luật) + `NAV_GROUPS` (menu) + `:root` (màu).
> Bốn chỗ đó là toàn bộ "phần mềm mới"; 30.000 dòng còn lại là hạ tầng dùng lại.
