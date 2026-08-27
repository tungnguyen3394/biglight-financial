// 全ページを保護 — 未ログインは /login へ。/login・/pending・認証APIのみ公開。
import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: [
    // 公開: /login, /pending, /api/auth/*, Next.js内部, 静的ファイル
    "/((?!login|pending|api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)",
  ],
};
