/**
 * POST /api/admin/normalize-week-dates
 *
 * Normaliza todos los weekStartDate (WeekOverride y ClosingShift) a la
 * convención "lunes 00:00 UTC". Esto resuelve el bug de tener dos timestamps
 * distintos (algunos guardados con offset Madrid +2, otros UTC) para la misma
 * semana, que provoca que getShiftsForWeek no encuentre matches.
 *
 * Solo CEO. Idempotente.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

/**
 * Dada una fecha cualquiera, devuelve el lunes de su semana a las 00:00 UTC.
 * Convención: usamos UTC para evitar ambigüedades.
 */
function normalizeToMondayUTC(date: Date): Date {
  const d = new Date(date);
  // getUTCDay(): 0=domingo, 1=lunes, ..., 6=sábado
  const dow = d.getUTCDay();
  // Cuántos días retroceder para llegar al lunes
  const daysBack = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - daysBack);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function POST() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (user.role !== "ceo") {
    return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  }

  // ─── 1. Normalizar ClosingShift ───
  const allShifts = await prisma.closingShift.findMany();
  const shiftsChanged: string[] = [];
  const duplicatesRemoved: string[] = [];

  // Agrupar por (semana normalizada, dayOfWeek, startTime, endTime, closerId)
  // para detectar duplicados creados por la convención inconsistente.
  const seenKeys = new Set<string>();

  for (const s of allShifts) {
    const normalized = normalizeToMondayUTC(s.weekStartDate);
    const isSameTimestamp = s.weekStartDate.getTime() === normalized.getTime();

    // Clave de unicidad
    const key = `${normalized.toISOString()}|${s.dayOfWeek}|${s.startTime}|${s.endTime}|${s.closerId}`;

    if (seenKeys.has(key)) {
      // Es duplicado, eliminar
      await prisma.closingShift.delete({ where: { id: s.id } });
      duplicatesRemoved.push(`${s.weekStartDate.toISOString()} dow=${s.dayOfWeek} ${s.startTime}-${s.endTime}`);
      continue;
    }
    seenKeys.add(key);

    if (!isSameTimestamp) {
      await prisma.closingShift.update({
        where: { id: s.id },
        data: { weekStartDate: normalized },
      });
      shiftsChanged.push(`${s.weekStartDate.toISOString()} → ${normalized.toISOString()}`);
    }
  }

  // ─── 2. Normalizar WeekOverride ───
  const allOverrides = await prisma.weekOverride.findMany();
  const overridesChanged: string[] = [];
  const overridesDeleted: string[] = [];
  const seenWeeks = new Set<string>();

  for (const o of allOverrides) {
    const normalized = normalizeToMondayUTC(o.weekStartDate);
    const key = normalized.toISOString();

    if (seenWeeks.has(key)) {
      // Es duplicado, eliminar
      await prisma.weekOverride.delete({ where: { id: o.id } });
      overridesDeleted.push(o.weekStartDate.toISOString());
      continue;
    }
    seenWeeks.add(key);

    if (o.weekStartDate.getTime() !== normalized.getTime()) {
      // Tratar de actualizar; si hay constraint conflict con otro registro
      // ya normalizado a esa fecha, eliminar éste.
      try {
        await prisma.weekOverride.update({
          where: { id: o.id },
          data: { weekStartDate: normalized },
        });
        overridesChanged.push(`${o.weekStartDate.toISOString()} → ${normalized.toISOString()}`);
      } catch {
        await prisma.weekOverride.delete({ where: { id: o.id } });
        overridesDeleted.push(o.weekStartDate.toISOString());
      }
    }
  }

  return NextResponse.json({
    ok: true,
    shiftsChanged: shiftsChanged.length,
    shiftsDuplicatesRemoved: duplicatesRemoved.length,
    overridesChanged: overridesChanged.length,
    overridesDuplicatesRemoved: overridesDeleted.length,
    details: {
      shiftsChanged,
      duplicatesRemoved,
      overridesChanged,
      overridesDeleted,
    },
  });
}
