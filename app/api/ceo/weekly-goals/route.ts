/**
 * Objetivos de la semana del CEO. Máx 3 por semana ISO (slot 0, 1, 2).
 *
 * GET  /api/ceo/weekly-goals                  → semana ISO actual
 *      /api/ceo/weekly-goals?isoYear=&isoWeek= → semana concreta
 *      /api/ceo/weekly-goals?previous=1        → la semana ISO anterior (para arrastrar)
 *
 * PUT  body { isoYear, isoWeek, goals: [{ order, title }, ...] }
 *      Upsert 3 slots (0, 1, 2). Si title vacío, lo deja vacío (no borra fila).
 *
 * PATCH body { id, completedAt?: ISO|null, title?, carriedFromGoalId? }
 *
 * DELETE ?id=  → borra un objetivo individual (rara vez se usa)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canUseCeoPersonal, currentIsoWeek, previousIsoWeek } from "@/lib/ceo-personal";

function forbidden() { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

async function ensureGoals(professionalId: string, isoYear: number, isoWeek: number) {
  // Crea las 3 filas vacías si no existen aún, para que el front siempre
  // reciba exactamente 3 elementos en orden.
  const existing = await prisma.ceoWeeklyGoal.findMany({
    where: { professionalId, isoYear, isoWeek },
    orderBy: { order: "asc" },
  });
  const byOrder = new Map(existing.map((g) => [g.order, g]));
  const toCreate: { order: number }[] = [];
  for (const o of [0, 1, 2]) if (!byOrder.has(o)) toCreate.push({ order: o });
  if (toCreate.length > 0) {
    await prisma.ceoWeeklyGoal.createMany({
      data: toCreate.map((t) => ({ professionalId, isoYear, isoWeek, order: t.order, title: "" })),
    });
  }
  return prisma.ceoWeeklyGoal.findMany({
    where: { professionalId, isoYear, isoWeek },
    orderBy: { order: "asc" },
  });
}

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();

  const yStr = req.nextUrl.searchParams.get("isoYear");
  const wStr = req.nextUrl.searchParams.get("isoWeek");
  const previous = req.nextUrl.searchParams.get("previous");

  let isoYear: number, isoWeek: number;
  if (previous) {
    const cur = currentIsoWeek();
    const prev = previousIsoWeek(cur.isoYear, cur.isoWeek);
    isoYear = prev.isoYear; isoWeek = prev.isoWeek;
  } else if (yStr && wStr) {
    isoYear = Number(yStr); isoWeek = Number(wStr);
  } else {
    const cur = currentIsoWeek();
    isoYear = cur.isoYear; isoWeek = cur.isoWeek;
  }

  const goals = await ensureGoals(user.id, isoYear, isoWeek);
  return NextResponse.json({ isoYear, isoWeek, goals });
}

export async function PUT(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const data = await req.json().catch(() => ({}));
  const isoYear = Number(data?.isoYear);
  const isoWeek = Number(data?.isoWeek);
  if (!isoYear || !isoWeek) return NextResponse.json({ error: "isoYear/isoWeek requeridos" }, { status: 400 });
  const incoming: Array<{ order: number; title: string; carriedFromGoalId?: string | null }> = Array.isArray(data?.goals) ? data.goals : [];

  await ensureGoals(user.id, isoYear, isoWeek);
  for (const g of incoming) {
    if (typeof g.order !== "number" || g.order < 0 || g.order > 2) continue;
    await prisma.ceoWeeklyGoal.update({
      where: { professionalId_isoYear_isoWeek_order: { professionalId: user.id, isoYear, isoWeek, order: g.order } },
      data: {
        title: typeof g.title === "string" ? g.title : "",
        carriedFromGoalId: g.carriedFromGoalId ?? null,
      },
    });
  }

  const goals = await prisma.ceoWeeklyGoal.findMany({
    where: { professionalId: user.id, isoYear, isoWeek },
    orderBy: { order: "asc" },
  });
  return NextResponse.json({ isoYear, isoWeek, goals });
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const data = await req.json().catch(() => ({}));
  const id = typeof data?.id === "string" ? data.id : "";
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const existing = await prisma.ceoWeeklyGoal.findUnique({ where: { id } });
  if (!existing || existing.professionalId !== user.id) return forbidden();

  const update: any = {};
  if (data.title !== undefined) update.title = String(data.title);
  if (data.completedAt !== undefined) update.completedAt = data.completedAt ? new Date(data.completedAt) : null;
  if (data.carriedFromGoalId !== undefined) update.carriedFromGoalId = data.carriedFromGoalId ? String(data.carriedFromGoalId) : null;

  const updated = await prisma.ceoWeeklyGoal.update({ where: { id }, data: update });
  return NextResponse.json({ goal: updated });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) return forbidden();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const existing = await prisma.ceoWeeklyGoal.findUnique({ where: { id } });
  if (!existing || existing.professionalId !== user.id) return forbidden();
  await prisma.ceoWeeklyGoal.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
