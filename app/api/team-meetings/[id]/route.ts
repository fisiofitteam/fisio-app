import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { isManagerForCategory, type MeetingCategory } from "@/lib/team-meetings";

// PATCH /api/team-meetings/[id] → edita la reunión. Solo managers de la
// categoría a la que pertenece.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const meeting = await prisma.teamMeeting.findUnique({ where: { id: params.id } });
  if (!meeting) return NextResponse.json({ error: "Reunión no encontrada" }, { status: 404 });
  if (!isManagerForCategory(user.role, meeting.category as MeetingCategory)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const data: any = {};
  if (typeof b?.title === "string") {
    const t = b.title.trim();
    if (!t) return NextResponse.json({ error: "Título vacío" }, { status: 400 });
    data.title = t;
  }
  if (b?.scheduledAt !== undefined) {
    data.scheduledAt = b.scheduledAt ? new Date(b.scheduledAt) : null;
  }
  if (b?.preparation !== undefined) {
    data.preparation = typeof b.preparation === "string" && b.preparation.trim() ? b.preparation : null;
  }
  if (b?.summary !== undefined) {
    data.summary = typeof b.summary === "string" && b.summary.trim() ? b.summary : null;
  }
  if (b?.status !== undefined) {
    const s = String(b.status);
    if (!["upcoming", "done", "cancelled"].includes(s)) {
      return NextResponse.json({ error: "status inválido" }, { status: 400 });
    }
    data.status = s;
  }
  if (b?.attendeeIds !== undefined && Array.isArray(b.attendeeIds)) {
    const ids = b.attendeeIds.filter((x: unknown) => typeof x === "string");
    data.attendeeIds = JSON.stringify(ids);
  }

  const updated = await prisma.teamMeeting.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}

// DELETE /api/team-meetings/[id] → borra (managers de la categoría).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const meeting = await prisma.teamMeeting.findUnique({ where: { id: params.id } });
  if (!meeting) return NextResponse.json({ error: "Reunión no encontrada" }, { status: 404 });
  if (!isManagerForCategory(user.role, meeting.category as MeetingCategory)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  await prisma.teamMeeting.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
