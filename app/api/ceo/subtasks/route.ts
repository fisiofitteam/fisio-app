import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canUseCeoPersonal } from "@/lib/ceo-personal";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/** Verifica que la tarea sea del CEO logueado. */
async function assertOwnership(taskId: string, userId: string): Promise<boolean> {
  const t = await prisma.ceoTask.findUnique({ where: { id: taskId }, select: { professionalId: true } });
  return !!t && t.professionalId === userId;
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const data = await req.json().catch(() => ({}));
  const taskId = typeof data?.taskId === "string" ? data.taskId : "";
  const title = typeof data?.title === "string" ? data.title.trim() : "";
  if (!taskId || !title) return NextResponse.json({ error: "taskId y title" }, { status: 400 });
  if (!(await assertOwnership(taskId, user.id))) return forbidden();

  const last = await prisma.ceoSubtask.findFirst({
    where: { taskId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const created = await prisma.ceoSubtask.create({
    data: { taskId, title, order: (last?.order ?? 0) + 1 },
  });
  return NextResponse.json({ id: created.id });
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const data = await req.json().catch(() => ({}));
  const id = typeof data?.id === "string" ? data.id : "";
  if (!id) return NextResponse.json({ error: "id" }, { status: 400 });

  const sub = await prisma.ceoSubtask.findUnique({ where: { id }, include: { task: { select: { professionalId: true } } } });
  if (!sub || sub.task.professionalId !== user.id) return forbidden();

  const update: any = {};
  if (data.title !== undefined) update.title = String(data.title).trim();
  if (data.completedAt !== undefined) update.completedAt = data.completedAt ? new Date(data.completedAt) : null;
  if (data.order !== undefined && Number.isFinite(Number(data.order))) update.order = Number(data.order);
  await prisma.ceoSubtask.update({ where: { id }, data: update });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id" }, { status: 400 });
  const sub = await prisma.ceoSubtask.findUnique({ where: { id }, include: { task: { select: { professionalId: true } } } });
  if (!sub || sub.task.professionalId !== user.id) return forbidden();
  await prisma.ceoSubtask.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
