import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

// PATCH /api/team-tasks/[id] → editar título / día / orden / active.
// CEO puede editar cualquier tarea. Head_success solo las de targetRole="fisio".
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || (user.role !== "ceo" && user.role !== "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const task = await prisma.weeklyTeamTask.findUnique({ where: { id: params.id } });
  if (!task) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  if (user.role === "head_success" && task.targetRole !== "fisio") {
    return NextResponse.json({ error: "Head Success solo gestiona tareas de Fisios" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const data: any = {};
  if (typeof b?.title === "string") {
    const t = b.title.trim();
    if (!t) return NextResponse.json({ error: "Título vacío" }, { status: 400 });
    data.title = t;
  }
  if (b?.dayOfWeek !== undefined) {
    const d = Number(b.dayOfWeek);
    if (![1, 2, 3, 4, 5].includes(d)) return NextResponse.json({ error: "Día no válido" }, { status: 400 });
    data.dayOfWeek = d;
  }
  if (b?.order !== undefined) data.order = Number(b.order);
  if (b?.active !== undefined) data.active = !!b.active;

  const updated = await prisma.weeklyTeamTask.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}

// DELETE /api/team-tasks/[id]. CEO cualquier tarea, head_success solo fisio.
// Cascade borra completaciones históricas.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || (user.role !== "ceo" && user.role !== "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const task = await prisma.weeklyTeamTask.findUnique({ where: { id: params.id } });
  if (!task) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
  if (user.role === "head_success" && task.targetRole !== "fisio") {
    return NextResponse.json({ error: "Head Success solo gestiona tareas de Fisios" }, { status: 403 });
  }

  await prisma.weeklyTeamTask.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
