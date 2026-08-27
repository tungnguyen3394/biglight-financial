// NextAuth 設定 — Googleログイン。
// ルール:
//   1. @biglight.jp ドメイン → 自動承認（初回ログインで ACTIVE 登録）
//   2. その他のメール       → PENDING 登録 → 管理者の承認後にログイン可能
//   3. ADMIN_EMAIL (n-tung@biglight.jp) → 常に ADMIN / ACTIVE（初期管理者）
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "n-tung@biglight.jp").toLowerCase();
export const ALLOWED_DOMAIN = (process.env.ALLOWED_DOMAIN ?? "biglight.jp").toLowerCase();

// ロール別の権限プリセット（承認時・ロール変更時の初期値）
export const ROLE_PRESETS: Record<string, { canView: boolean; canEdit: boolean; canDelete: boolean }> = {
  ADMIN:   { canView: true, canEdit: true,  canDelete: true },
  MANAGER: { canView: true, canEdit: true,  canDelete: true },
  STAFF:   { canView: true, canEdit: true,  canDelete: false },
  VIEWER:  { canView: true, canEdit: false, canDelete: false },
};

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 }, // 7日
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google" || !user.email) return false;
      const email = user.email.toLowerCase();
      const isAdmin = email === ADMIN_EMAIL;
      const isDomain = email.endsWith("@" + ALLOWED_DOMAIN);

      let dbUser = await prisma.user.findUnique({ where: { email } });

      if (!dbUser) {
        // 初回ログイン → 自動登録
        dbUser = await prisma.user.create({
          data: {
            email,
            name: user.name ?? email.split("@")[0],
            image: user.image ?? null,
            role: isAdmin ? "ADMIN" : "STAFF",
            status: isAdmin || isDomain ? "ACTIVE" : "PENDING",
            ...(isAdmin ? ROLE_PRESETS.ADMIN : ROLE_PRESETS.STAFF),
          },
        });
      } else {
        // 名前・アバターを最新化。初期管理者は常に ADMIN/ACTIVE を保証。
        dbUser = await prisma.user.update({
          where: { email },
          data: {
            name: user.name ?? dbUser.name,
            image: user.image ?? dbUser.image,
            ...(isAdmin ? { role: "ADMIN", status: "ACTIVE", ...ROLE_PRESETS.ADMIN } : {}),
          },
        });
      }

      if (dbUser.status === "PENDING") return "/pending";
      if (dbUser.status === "DISABLED") return "/pending?reason=disabled";

      // ログイン成功 → 履歴を記録（IP・ブラウザ付き）
      let ip: string | null = null, ua: string | null = null;
      try {
        const h = headers();
        ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
        ua = h.get("user-agent");
      } catch { /* headers() が使えない文脈では省略 */ }
      await prisma.$transaction([
        prisma.loginLog.create({ data: { userId: dbUser.id, email, ip, userAgent: ua } }),
        prisma.user.update({ where: { id: dbUser.id }, data: { lastLoginAt: new Date(), lastSeenAt: new Date() } }),
      ]);
      return true;
    },

    async session({ session, token }) {
      // 毎リクエストでDBから最新の権限を反映（停止・権限変更が即時に効く）
      const email = (token.email ?? session.user?.email ?? "").toLowerCase();
      if (email && session.user) {
        const dbUser = await prisma.user.findUnique({ where: { email } });
        if (dbUser) {
          session.user.id = dbUser.id;
          session.user.name = dbUser.name;
          session.user.image = dbUser.image;
          session.user.role = dbUser.role;
          session.user.status = dbUser.status;
          session.user.canView = dbUser.canView;
          session.user.canEdit = dbUser.canEdit;
          session.user.canDelete = dbUser.canDelete;
          session.user.isAdmin = dbUser.role === "ADMIN";
        } else {
          session.user.status = "PENDING";
        }
      }
      return session;
    },
  },
};
