/**
 * POST /api/admin/clean-orphan-shifts
 *
 * Limpia ClosingShifts cuya semana NO tiene un WeekOverride con
 * useDefault=false. Estos son datos "huérfanos" que pueden aparecer si se
 * borra un WeekOverride sin borrar sus shifts asociados (ej. migraciones,
 * normalización de timestamps).
 *
 * Sin override → conceptualmente la semana usa la plantilla → NO debe haber
 * ClosingShifts. Este endpoint los borra.
 *
 * Solo CEO. Idempotente.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export async function POST() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (user.role !== "ceo") {
    return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  }

  // Conjunto de semanas que SÍ tienen override personalizado
  const personalizedWeeks = await prisma.weekOverride.findMany({
    where: { useDefault: false },
  });
  const validKeys = new Set(personalizedWeeks.map((w) => w.weekStartDate.toISOString().slice(0, 10)));

  // Buscar todos los shifts
  const allShifts = await prisma.closingShift.findMany();
  const toDelete: typeof allShifts = [];

  for (const s of allShifts) {
    const key = s.weekStartDate.toISOString().slice(0, 10);
    if (!validKeys.has(key)) {
      toDelete.push(s);
    }
  }

  for (const s of toDelete) {
    await prisma.closingShift.delete({ where: { id: s.id } });
  }

  return NextResponse.json({
    ok: true,
    deletedCount: toDelete.length,
    deleted: toDelete.map((s) => ({
      weekStartDate: s.weekStartDate.toISOString(),
      dayOfWeek: s.dayOfWeek,
      time: `${s.startTime}-${s.endTime}`,
    })),
  });
}
