// GET /api/users/:id/logins — ログイン履歴（ADMIN、または本人）
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.status !== "ACTIVE") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const isSelf = session.user.id === params.id;
  if (!session.user.isAdmin && !isSelf) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const logins = await prisma.loginLog.findMany({
    where: { userId: params.id },
    orderBy: { at: "desc" },
    take: 50,
  });
  return NextResponse.json({ logins });
}
