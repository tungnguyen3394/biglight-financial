// POST /api/heartbeat — オンライン状態の更新（クライアントが60秒ごとに送信）
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ ok: false }, { status: 401 });

  await prisma.user.updateMany({ where: { email }, data: { lastSeenAt: new Date() } });
  return NextResponse.json({ ok: true });
}
