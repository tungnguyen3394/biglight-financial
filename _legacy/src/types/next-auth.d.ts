// next-auth のセッション型を拡張 — 権限フィールドを追加。
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: string;      // ADMIN | MANAGER | STAFF | VIEWER
      status?: string;    // PENDING | ACTIVE | DISABLED
      canView?: boolean;
      canEdit?: boolean;
      canDelete?: boolean;
      isAdmin?: boolean;
    };
  }
}
