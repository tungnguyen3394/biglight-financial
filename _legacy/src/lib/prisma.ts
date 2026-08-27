// Prisma client シングルトン — フェーズ2用の準備。
// フェーズ1では未使用（UIはlib/mock.tsのサンプルデータで動作）。
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: ["error", "warn"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
