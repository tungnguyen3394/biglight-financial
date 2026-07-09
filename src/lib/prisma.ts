// Prisma client singleton — CHUẨN BỊ cho Giai đoạn 2.
// Giai đoạn 1 chưa dùng (UI chạy bằng dữ liệu mẫu ở lib/mock.ts).
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: ["error", "warn"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
