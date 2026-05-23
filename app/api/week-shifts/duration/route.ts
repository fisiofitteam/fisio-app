/**
 * PATCH /api/week-shifts/duration
 *
 * Cambia la duración de TODAS las franjas de UNA semana personalizada.
 * Body: { week: "YYYY-MM-DD", slotDurationMinutes: 30|45|60 }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { weekStartOf } from "@/lib/agendaTemplate";

const ALLOWED_ROLES = ["ceo", "setter", "closer", "head_success"];

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { week, slotDurationMinutes } = await req.json();
  if (!week) return NextResponse.json({ error: "week requerido" }, { status: 400 });
  if (![30, 45, 60].includes(slotDurationMinutes)) {
    return NextResponse.json({ error: "Duración debe ser 30, 45 o 60" }, { status: 400 });
  }

  const ws = weekStartOf(new Date(week + "T12:00:00Z"));

  await prisma.closingShift.updateMany({
    where: { weekStartDate: ws },
    data: { slotDurationMinutes },
  });

  return NextResponse.json({ ok: true });
}
