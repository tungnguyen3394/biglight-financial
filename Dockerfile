# ---- deps: cài thư viện ----
FROM node:20-alpine AS deps
# OpenSSL cần cho Prisma (tải đúng engine linux-musl-openssl-3.0.x khi npm ci)
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- builder: build Next.js (standalone) ----
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- runner: image chạy production ----
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Prisma CLI + schema — để chạy `prisma db push` khởi tạo/migrate SQLite lúc start
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# Thư mục chứa file SQLite (mount volume vào đây)
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
USER nextjs
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push --skip-generate && node server.js"]
