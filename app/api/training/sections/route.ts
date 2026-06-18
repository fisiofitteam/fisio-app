import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canManageTraining } from "@/lib/training";

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageTraining(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const data = await req.json().catch(() => ({}));
  const moduleId = typeof data?.moduleId === "string" ? data.moduleId : "";
  const title = typeof data?.title === "string" ? data.title.trim() : "";
  if (!moduleId || !title) return NextResponse.json({ error: "moduleId y title requeridos" }, { status: 400 });

  const lastOrder = await prisma.trainingSection.findFirst({
    where: { moduleId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const created = await prisma.trainingSection.create({
    data: { moduleId, title, order: (lastOrder?.order ?? 0) + 1 },
  });
  return NextResponse.json({ id: created.id });
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageTraining(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const data = await req.json().catch(() => ({}));
  const id = typeof data?.id === "string" ? data.id : "";
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const update: any = {};
  if (data.title !== undefined) update.title = String(data.title).trim();
  if (data.order !== undefined && Number.isFinite(Number(data.order))) update.order = Number(data.order);
  await prisma.trainingSection.update({ where: { id }, data: update });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageTraining(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  await prisma.trainingSection.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
