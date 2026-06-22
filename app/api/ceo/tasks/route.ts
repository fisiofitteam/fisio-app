import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canUseCeoPersonal, nextRecurrenceDate, type CeoRecurrence } from "@/lib/ceo-personal";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * GET /api/ceo/tasks
 * Devuelve TODAS las tareas del CEO (no completadas + completadas recientes).
 * El frontend agrupa luego en Hoy / Semana / Mes / Sin fecha / Atrasadas.
 */
export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();

  // Pendientes
  const pending = await prisma.ceoTask.findMany({
    where: { professionalId: user.id, completedAt: null },
    orderBy: [{ priority: "asc" }, { order: "asc" }, { createdAt: "desc" }],
    include: {
      subtasks: { orderBy: { order: "asc" } },
      tags: { include: { tag: true } },
    },
  });

  // Últimas completadas (7 días) para mostrar en sección "Hechas"
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const recentlyDone = await prisma.ceoTask.findMany({
    where: { professionalId: user.id, completedAt: { not: null, gte: since } },
    orderBy: { completedAt: "desc" },
    take: 20,
    include: {
      subtasks: { orderBy: { order: "asc" } },
      tags: { include: { tag: true } },
    },
  });

  return NextResponse.json({ pending, recentlyDone });
}

/**
 * POST /api/ceo/tasks
 * Body: { title, description?, priority?, dueDate?, recurrenceType?, recurrenceDay?, tagIds? }
 */
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const data = await req.json().catch(() => ({}));
  const title = typeof data?.title === "string" ? data.title.trim() : "";
  if (!title) return NextResponse.json({ error: "Título obligatorio" }, { status: 400 });

  const last = await prisma.ceoTask.findFirst({
    where: { professionalId: user.id },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const tagIds: string[] = Array.isArray(data?.tagIds)
    ? data.tagIds.filter((x: unknown) => typeof x === "string")
    : [];

  const created = await prisma.ceoTask.create({
    data: {
      professionalId: user.id,
      title,
      description: typeof data?.description === "string" ? data.description.trim() || null : null,
      priority: typeof data?.priority === "string" ? data.priority : "medium",
      dueDate: data?.dueDate ? new Date(data.dueDate) : null,
      recurrenceType: typeof data?.recurrenceType === "string" ? data.recurrenceType : "none",
      recurrenceDay: data?.recurrenceDay != null ? Number(data.recurrenceDay) : null,
      weeklyGoalId: typeof data?.weeklyGoalId === "string" && data.weeklyGoalId ? data.weeklyGoalId : null,
      order: (last?.order ?? 0) + 1,
      ...(tagIds.length > 0 && {
        tags: { create: tagIds.map((id) => ({ tagId: id })) },
      }),
    },
  });
  return NextResponse.json({ id: created.id });
}

/**
 * PATCH /api/ceo/tasks
 * Body: { id, ...campos? }
 * Si se pasa `completedAt` (cambio de estado), gestionamos recurrencia.
 * Si se pasa `tagIds`, sustituye el set completo.
 */
export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const data = await req.json().catch(() => ({}));
  const id = typeof data?.id === "string" ? data.id : "";
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const existing = await prisma.ceoTask.findUnique({
    where: { id },
    select: { id: true, professionalId: true, recurrenceType: true, recurrenceDay: true, completedAt: true, title: true, description: true, priority: true, parentTaskId: true },
  });
  if (!existing || existing.professionalId !== user.id) return forbidden();

  const update: any = {};
  if (data.title !== undefined) update.title = String(data.title).trim();
  if (data.description !== undefined) update.description = String(data.description).trim() || null;
  if (data.priority !== undefined) update.priority = String(data.priority);
  if (data.dueDate !== undefined) update.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  if (data.recurrenceType !== undefined) update.recurrenceType = String(data.recurrenceType);
  if (data.recurrenceDay !== undefined) update.recurrenceDay = data.recurrenceDay != null ? Number(data.recurrenceDay) : null;
  if (data.order !== undefined && Number.isFinite(Number(data.order))) update.order = Number(data.order);
  if (data.completedAt !== undefined) update.completedAt = data.completedAt ? new Date(data.completedAt) : null;
  // Workflow extendido
  if (data.status !== undefined) {
    const s = String(data.status);
    update.status = ["pending", "in_progress", "waiting", "done"].includes(s) ? s : "pending";
    // Mantener completedAt en sincronía con status="done":
    if (update.status === "done" && !existing.completedAt && update.completedAt === undefined) {
      update.completedAt = new Date();
    } else if (update.status !== "done" && update.completedAt === undefined) {
      update.completedAt = null;
    }
    // Si pasamos a otro estado distinto de waiting, limpiamos waitingOnId salvo
    // que venga explícito en el body.
    if (update.status !== "waiting" && data.waitingOnId === undefined) {
      update.waitingOnId = null;
    }
  }
  if (data.waitingOnId !== undefined) update.waitingOnId = data.waitingOnId ? String(data.waitingOnId) : null;
  if (data.weeklyGoalId !== undefined) update.weeklyGoalId = data.weeklyGoalId ? String(data.weeklyGoalId) : null;
  // Siempre que algo cambia: lastTouchedAt actualizado para alimentar "se enfrían".
  update.lastTouchedAt = new Date();

  // Recurrencia: al MARCAR como completada (transición null → not null) y si
  // recurre, creamos automáticamente el clon con la siguiente fecha objetivo.
  let cloneId: string | null = null;
  const willCompleteNow = update.completedAt && !existing.completedAt;
  const willRecurOnComplete = willCompleteNow && existing.recurrenceType && existing.recurrenceType !== "none";

  await prisma.ceoTask.update({ where: { id }, data: update });

  if (data.tagIds !== undefined) {
    const tagIds: string[] = Array.isArray(data.tagIds)
      ? data.tagIds.filter((x: unknown) => typeof x === "string")
      : [];
    await prisma.ceoTaskTagOnTask.deleteMany({ where: { taskId: id } });
    if (tagIds.length > 0) {
      await prisma.ceoTaskTagOnTask.createMany({
        data: tagIds.map((tagId) => ({ taskId: id, tagId })),
        skipDuplicates: true,
      });
    }
  }

  if (willRecurOnComplete) {
    const nextDate = nextRecurrenceDate(existing.recurrenceType as CeoRecurrence, existing.recurrenceDay);
    if (nextDate) {
      // Clonamos preservando título/descr/prioridad/recurrencia/tags
      const tags = await prisma.ceoTaskTagOnTask.findMany({
        where: { taskId: existing.id },
        select: { tagId: true },
      });
      const last = await prisma.ceoTask.findFirst({
        where: { professionalId: user.id },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      const clone = await prisma.ceoTask.create({
        data: {
          professionalId: user.id,
          title: existing.title,
          description: existing.description,
          priority: existing.priority,
          dueDate: nextDate,
          recurrenceType: existing.recurrenceType,
          recurrenceDay: existing.recurrenceDay,
          parentTaskId: existing.parentTaskId ?? existing.id,
          order: (last?.order ?? 0) + 1,
          ...(tags.length > 0 && {
            tags: { create: tags.map((t) => ({ tagId: t.tagId })) },
          }),
        },
      });
      cloneId = clone.id;
    }
  }

  return NextResponse.json({ ok: true, cloneId });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const existing = await prisma.ceoTask.findUnique({ where: { id }, select: { professionalId: true } });
  if (!existing || existing.professionalId !== user.id) return forbidden();
  await prisma.ceoTask.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
