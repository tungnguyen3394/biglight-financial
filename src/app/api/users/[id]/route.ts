// PATCH /api/users/:id — 承認・権限変更・停止（ADMIN専用）
// DELETE /api/users/:id — ユーザー削除（ADMIN専用、自分自身と初期管理者は不可）
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, ADMIN_EMAIL, ROLE_PRESETS } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin || session.user.status !== "ACTIVE") return null;
  return session;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.status === "string" && ["PENDING", "ACTIVE", "DISABLED"].includes(body.status)) {
    // 初期管理者は停止不可
    if (target.email === ADMIN_EMAIL && body.status !== "ACTIVE") {
      return NextResponse.json({ error: "初期管理者は停止できません" }, { status: 400 });
    }
    data.status = body.status;
  }
  if (typeof body.role === "string" && body.role in ROLE_PRESETS) {
    if (target.email === ADMIN_EMAIL && body.role !== "ADMIN") {
      return NextResponse.json({ error: "初期管理者のロールは変更できません" }, { status: 400 });
    }
    data.role = body.role;
    if (body.applyPreset) Object.assign(data, ROLE_PRESETS[body.role]);
  }
  for (const k of ["canView", "canEdit", "canDelete"] as const) {
    if (typeof body[k] === "boolean") data[k] = body[k];
  }
  if (typeof body.department === "string") data.department = body.department || null;

  const updated = await prisma.user.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true, user: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (target.email === ADMIN_EMAIL) return NextResponse.json({ error: "初期管理者は削除できません" }, { status: 400 });
  if (target.email === session.user.email?.toLowerCase()) {
    return NextResponse.json({ error: "自分自身は削除できません" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id: params.id } }); // LoginLog は cascade で削除
  return NextResponse.json({ ok: true });
}
