import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

// PATCH /api/team-tasks-adhoc/[id] → editar (CEO o head_success).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || (user.role !== "ceo" && user.role !== "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const data: any = {};
  if (typeof b?.title === "string") {
    const t = b.title.trim();
    if (!t) return NextResponse.json({ error: "Título vacío" }, { status: 400 });
    data.title = t;
  }
  if (b?.dayOfMonth !== undefined) {
    const d = Number(b.dayOfMonth);
    if (!Number.isFinite(d) || d < 1 || d > 31) return NextResponse.json({ error: "Día del mes 1-31" }, { status: 400 });
    data.dayOfMonth = d;
  }
  if (b?.nthWeek !== undefined) {
    const n = Number(b.nthWeek);
    if (![1, 2, 3, 4, -1].includes(n)) return NextResponse.json({ error: "nthWeek inválido" }, { status: 400 });
    data.nthWeek = n;
  }
  if (b?.dayOfWeek !== undefined) {
    const d = Number(b.dayOfWeek);
    if (![1, 2, 3, 4, 5, 6, 7].includes(d)) return NextResponse.json({ error: "dayOfWeek inválido" }, { status: 400 });
    data.dayOfWeek = d;
  }
  if (b?.startDate !== undefined) data.startDate = b.startDate ? new Date(b.startDate) : null;
  if (b?.endDate !== undefined) data.endDate = b.endDate ? new Date(b.endDate) : null;
  if (b?.active !== undefined) data.active = !!b.active;
  if (b?.assigneeIds !== undefined && Array.isArray(b.assigneeIds)) {
    const ids = b.assigneeIds.filter((x: unknown) => typeof x === "string");
    data.assigneesJson = JSON.stringify(ids);
  }

  const updated = await prisma.teamTaskAdHoc.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}

// DELETE /api/team-tasks-adhoc/[id] (CEO o head_success).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || (user.role !== "ceo" && user.role !== "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.teamTaskAdHoc.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
