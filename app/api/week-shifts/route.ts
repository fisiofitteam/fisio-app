/**
 * GET    /api/week-shifts?week=YYYY-MM-DD   → estado de la semana (plantilla u override) + shifts
 * POST   /api/week-shifts                    → "personalizar semana": clona plantilla a ClosingShift y marca useDefault=false
 * DELETE /api/week-shifts?week=YYYY-MM-DD    → "restaurar plantilla": borra overrides y useDefault=true
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { weekStartOf } from "@/lib/agendaTemplate";

const ALLOWED_ROLES = ["ceo", "setter", "closer", "head_success"];

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const weekParam = req.nextUrl.searchParams.get("week");
  if (!weekParam) return NextResponse.json({ error: "?week=YYYY-MM-DD requerido" }, { status: 400 });
  const weekStart = weekStartOf(new Date(weekParam + "T12:00:00Z"));

  // Rango de día para búsqueda timezone-safe
  const dayStart = new Date(weekStart);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const override = await prisma.weekOverride.findFirst({
    where: { weekStartDate: { gte: dayStart, lte: dayEnd } },
  });
  const usingDefault = !override || override.useDefault;

  let shifts;
  if (usingDefault) {
    const def = await prisma.defaultClosingShift.findMany({
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      include: { closer: { select: { id: true, fullName: true, role: true } } },
    });
    shifts = def.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      closerId: s.closerId,
      closer: s.closer,
      slotDurationMinutes: s.slotDurationMinutes,
      fromDefault: true,
    }));
  } else {
    const ws = await prisma.closingShift.findMany({
      where: { weekStartDate: { gte: dayStart, lte: dayEnd } },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      include: { closer: { select: { id: true, fullName: true, role: true } } },
    });
    shifts = ws.map((s) => ({
      id: s.id,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      closerId: s.closerId,
      closer: s.closer,
      slotDurationMinutes: s.slotDurationMinutes,
      fromDefault: false,
    }));
  }

  return NextResponse.json({
    weekStartDate: weekStart.toISOString().slice(0, 10),
    usingDefault,
    shifts,
    slotDurationMinutes: shifts[0]?.slotDurationMinutes ?? 60,
  });
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { week } = await req.json();
  if (!week) return NextResponse.json({ error: "week requerido" }, { status: 400 });
  const weekStart = weekStartOf(new Date(week + "T12:00:00Z"));

  // Rango de día para búsqueda timezone-safe
  const dayStart = new Date(weekStart);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCHours(23, 59, 59, 999);

  // Comprobar si la semana ya está marcada como personalizada
  const existingOverride = await prisma.weekOverride.findFirst({
    where: { weekStartDate: { gte: dayStart, lte: dayEnd } },
  });
  const wasAlreadyPersonalized = existingOverride && !existingOverride.useDefault;

  // Si NO estaba personalizada (era plantilla), borrar cualquier shift huérfano
  // que pudiera existir, y clonar la plantilla actual.
  if (!wasAlreadyPersonalized) {
    await prisma.closingShift.deleteMany({
      where: { weekStartDate: { gte: dayStart, lte: dayEnd } },
    });
    const defaults = await prisma.defaultClosingShift.findMany();
    if (defaults.length > 0) {
      await prisma.closingShift.createMany({
        data: defaults.map((d) => ({
          weekStartDate: weekStart,
          dayOfWeek: d.dayOfWeek,
          startTime: d.startTime,
          endTime: d.endTime,
          closerId: d.closerId,
          slotDurationMinutes: d.slotDurationMinutes,
        })),
      });
    }
  }

  // Marcar la semana como personalizada
  if (existingOverride) {
    await prisma.weekOverride.update({
      where: { id: existingOverride.id },
      data: { useDefault: false, weekStartDate: weekStart },
    });
  } else {
    await prisma.weekOverride.create({
      data: { weekStartDate: weekStart, useDefault: false },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const weekParam = req.nextUrl.searchParams.get("week");
  if (!weekParam) return NextResponse.json({ error: "?week=YYYY-MM-DD requerido" }, { status: 400 });
  const weekStart = weekStartOf(new Date(weekParam + "T12:00:00Z"));

  // Rango de día para búsqueda timezone-safe
  const dayStart = new Date(weekStart);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCHours(23, 59, 59, 999);

  // Borrar todos los ClosingShifts de esa semana
  await prisma.closingShift.deleteMany({
    where: { weekStartDate: { gte: dayStart, lte: dayEnd } },
  });
  // Borrar también el WeekOverride (estado limpio: sin override = usa plantilla)
  await prisma.weekOverride.deleteMany({
    where: { weekStartDate: { gte: dayStart, lte: dayEnd } },
  });

  return NextResponse.json({ ok: true });
}
