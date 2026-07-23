// GET /api/users — ユーザー一覧（ログイン必須）。オンライン判定・最終ログイン・ログイン回数付き。
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ONLINE_WINDOW_MS = 2 * 60 * 1000; // lastSeen が2分以内 = オンライン

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.status !== "ACTIVE") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { logins: true } } },
  });

  const now = Date.now();
  return NextResponse.json({
    me: session.user.email.toLowerCase(),
    isAdmin: !!session.user.isAdmin,
    users: users.map((u) => ({
      id: u.id, email: u.email, name: u.name, image: u.image,
      role: u.role, status: u.status,
      canView: u.canView, canEdit: u.canEdit, canDelete: u.canDelete,
      department: u.department,
      online: !!u.lastSeenAt && now - u.lastSeenAt.getTime() < ONLINE_WINDOW_MS,
      lastSeenAt: u.lastSeenAt, lastLoginAt: u.lastLoginAt,
      loginCount: u._count.logins, createdAt: u.createdAt,
    })),
  });
}
