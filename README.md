# BIGLIGHT Management System

Web quản trị nội bộ BIGLIGHT — quản lý **予実 / 売上 / 売掛金・回収 / 支出 / 顧客 / 契約 / OKR**.

> **Giai đoạn 1 (hiện tại):** dựng khung tổng thể — layout, sidebar, header, dashboard mẫu, mỗi module 1 trang. Dùng **dữ liệu mẫu**, chưa cần database.

## Công nghệ
- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** (UI)
- **Prisma + PostgreSQL** (schema đã chuẩn bị sẵn, dùng từ Giai đoạn 2)

## Chạy trên máy (Giai đoạn 1 — KHÔNG cần database)
```bash
npm install
npm run dev
```
Mở http://localhost:3000 → tự chuyển tới `/dashboard`.

## Cấu trúc thư mục
```
src/
  app/
    (dash)/              # nhóm route dùng chung layout (sidebar + header)
      dashboard/         # Dashboard — 8 thẻ tổng quan + 予実 + 回収
      yojitsu/           # 予実管理
      sales/             # 売上管理
      receivables/       # 売掛金・回収
      expenses/          # 支出管理
      customers/         # 顧客管理
      contracts/         # 契約管理
      okr/               # OKR / KPI
      users/             # User管理
      reports/           # レポート
      settings/          # 設定 (danh mục động)
    layout.tsx           # layout gốc
    page.tsx             # "/" -> redirect /dashboard
  components/
    Shell.tsx  Sidebar.tsx  Header.tsx  Icon.tsx
    ui/  StatCard  PageHeader  Panel  EmptyState
  lib/
    nav.ts     # CẤU HÌNH MENU (không hard-code trong component)
    format.ts  # định dạng ¥ / %
    mock.ts    # dữ liệu mẫu Giai đoạn 1
    prisma.ts  # client DB (dùng từ Giai đoạn 2)
prisma/
  schema.prisma          # schema database ban đầu
```

## Nguyên tắc thiết kế
- **Dễ mở rộng:** thêm module = thêm 1 dòng trong `lib/nav.ts` + 1 trang trong `app/(dash)/`.
- **Không hard-code danh mục:** mọi phân loại nằm ở bảng `Category` (xem trang 設定).
- **Tách UI tái sử dụng:** `StatCard`, `Panel`, `PageHeader`, `EmptyState`.
- **Responsive:** sidebar cố định trên desktop, dạng drawer trên mobile.

## Giai đoạn 2 (kế tiếp)
1. `npm run db:push` để tạo bảng thật trong PostgreSQL.
2. Thay `lib/mock.ts` bằng truy vấn Prisma trong từng trang.
3. Thêm form thêm/sửa/xóa cho từng module.
