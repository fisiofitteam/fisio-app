/**
 * GET /api/admin/diagnose-agenda
 *
 * Endpoint de diagnóstico para entender por qué la landing no muestra slots.
 * Devuelve:
 *  - Plantilla por defecto (DefaultClosingShift)
 *  - WeekOverrides existentes
 *  - ClosingShifts de las próximas 4 semanas
 *  - Cálculo de slots para los próximos 20 días con explicación paso a paso
 *
 * Solo CEO.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getAvailableSlots } from "@/lib/agendaSlots";
import {
  getShiftsForWeek,
  weekStartOf,
  madridYMD,
  madridDayOfWeek,
  madridDateAt,
} from "@/lib/agendaTemplate";

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (user.role !== "ceo") {
    return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  }

  const now = new Date();

  // 1. Plantilla por defecto
  const defaults = await prisma.defaultClosingShift.findMany({
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    include: { closer: { select: { fullName: true } } },
  });

  // 2. WeekOverrides de las próximas 4 semanas
  const fourWeeksLater = new Date(now.getTime() + 28 * 86400 * 1000);
  const overrides = await prisma.weekOverride.findMany({
    where: { weekStartDate: { gte: weekStartOf(now), lte: fourWeeksLater } },
  });

  // 3. ClosingShifts de las próximas 4 semanas
  const closingShifts = await prisma.closingShift.findMany({
    where: { weekStartDate: { gte: weekStartOf(now), lte: fourWeeksLater } },
    orderBy: [{ weekStartDate: "asc" }, { dayOfWeek: "asc" }, { startTime: "asc" }],
    include: { closer: { select: { fullName: true } } },
  });

  // 4. Diagnóstico: para cada uno de los próximos 7 días, qué franjas se resuelven
  const dayDiagnostics: any[] = [];
  for (let i = 0; i < 7; i++) {
    const probe = new Date(now.getTime() + i * 86400 * 1000);
    const ymd = madridYMD(probe);
    const dow = madridDayOfWeek(madridDateAt(ymd.year, ymd.month, ymd.day, 12, 0));
    const ws = weekStartOf(probe);
    const shifts = await getShiftsForWeek(ws);
    const daily = shifts.filter((f) => f.dayOfWeek === dow);
    dayDiagnostics.push({
      date: `${ymd.year}-${String(ymd.month).padStart(2, "0")}-${String(ymd.day).padStart(2, "0")}`,
      dayOfWeek: dow,
      weekStart: ws.toISOString(),
      shiftsFound: daily.length,
      shifts: daily,
    });
  }

  // 5. Llamada real al cálculo de slots (lo que ve la landing)
  let slots: any[] = [];
  let slotsError: string | null = null;
  try {
    slots = await getAvailableSlots();
  } catch (e: any) {
    slotsError = e.message || String(e);
  }

  return NextResponse.json({
    now: now.toISOString(),
    nowMadrid: madridYMD(now),
    defaultsCount: defaults.length,
    defaults: defaults.map((d) => ({
      dayOfWeek: d.dayOfWeek,
      startTime: d.startTime,
      endTime: d.endTime,
      closer: d.closer.fullName,
      slotDurationMinutes: d.slotDurationMinutes,
    })),
    overridesCount: overrides.length,
    overrides: overrides.map((o) => ({
      weekStartDate: o.weekStartDate.toISOString(),
      useDefault: o.useDefault,
    })),
    closingShiftsCount: closingShifts.length,
    closingShifts: closingShifts.map((s) => ({
      weekStartDate: s.weekStartDate.toISOString(),
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      closer: s.closer.fullName,
      slotDurationMinutes: s.slotDurationMinutes,
    })),
    dayDiagnostics,
    landingSlotsCount: slots.length,
    landingSlotsSample: slots.slice(0, 10),
    landingSlotsError: slotsError,
  });
}
