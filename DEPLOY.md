# Deploy — BIGLIGHT Management System

App chạy hoàn toàn phía trình duyệt (localStorage), **không cần database**. Có 2 cách deploy.

## Cách A — Vercel (dễ nhất, có HTTPS miễn phí) ⭐

1. Vào https://vercel.com → đăng nhập bằng **GitHub**.
2. **Add New → Project** → chọn repo `tungnguyen3394/biglight-financial`.
3. Vercel tự nhận Next.js → bấm **Deploy**.
4. ~1 phút sau có link kiểu `https://biglight-financial.vercel.app` — **link chính thức, sống 24/7**.
5. Sau này chỉ cần `git push` → Vercel tự deploy lại.

## Cách B — VPS Docker (Contabo)

Trên VPS (qua Termius):
```bash
git clone https://github.com/tungnguyen3394/biglight-financial.git
cd biglight-financial
docker compose up -d --build
```
→ Truy cập **http://IP_VPS:8080**

### Muốn tên miền + HTTPS (dùng Caddy đã có)
Sửa `docker-compose.yml`: bỏ `ports`, thêm nhãn Caddy và nối mạng `web`:
```yaml
services:
  biglight-financial:
    build: .
    container_name: biglight-financial
    restart: unless-stopped
    labels:
      caddy: financial.biglight.jp
      caddy.reverse_proxy: "{{upstreams 3000}}"
    networks:
      - web
networks:
  web:
    external: true
```
Rồi trỏ DNS `financial` → IP_VPS, `docker compose up -d --build`.

## Cập nhật sau này
```bash
# máy code:
git add . && git commit -m "..." && git push
# VPS: git pull && docker compose up -d --build   (hoặc Vercel tự động)
```

> ⚠️ Dữ liệu lưu ở **trình duyệt** mỗi máy. Nhiều người dùng chung 1 dữ liệu → cần Giai đoạn 2 (nối PostgreSQL).
