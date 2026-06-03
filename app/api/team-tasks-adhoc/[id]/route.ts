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
  if (b?.startDate !== undefined) data.startDate = b.startDate ? new Date(b.startDate) : null;
  if (b?.endDate !== undefined) data.endDate = b.endDate ? new Date(b.endDate) : null;
  if (b?.active !== undefined) data.active = !!b.active;

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
