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

  const override = await prisma.weekOverride.findUnique({ where: { weekStartDate: weekStart } });
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
      fromDefault: true,
    }));
  } else {
    const ws = await prisma.closingShift.findMany({
      where: { weekStartDate: weekStart },
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
      fromDefault: false,
    }));
  }

  return NextResponse.json({
    weekStartDate: weekStart.toISOString().slice(0, 10),
    usingDefault,
    shifts,
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

  // Clonar plantilla en ClosingShift para esta semana
  const existing = await prisma.closingShift.findMany({ where: { weekStartDate: weekStart } });
  if (existing.length === 0) {
    const defaults = await prisma.defaultClosingShift.findMany();
    if (defaults.length > 0) {
      await prisma.closingShift.createMany({
        data: defaults.map((d) => ({
          weekStartDate: weekStart,
          dayOfWeek: d.dayOfWeek,
          startTime: d.startTime,
          endTime: d.endTime,
          closerId: d.closerId,
        })),
      });
    }
  }

  // Marcar la semana como personalizada
  await prisma.weekOverride.upsert({
    where: { weekStartDate: weekStart },
    create: { weekStartDate: weekStart, useDefault: false },
    update: { useDefault: false },
  });

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

  await prisma.closingShift.deleteMany({ where: { weekStartDate: weekStart } });
  await prisma.weekOverride.upsert({
    where: { weekStartDate: weekStart },
    create: { weekStartDate: weekStart, useDefault: true },
    update: { useDefault: true },
  });

  return NextResponse.json({ ok: true });
}
