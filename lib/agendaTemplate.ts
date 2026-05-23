/**
 * Resolución de franjas para una semana concreta.
 *
 * Orden de precedencia (de mayor a menor):
 *   1. AgendaBlock      → quita franjas/días bloqueados
 *   2. WeekOverride     → si useDefault=false, usa ClosingShift
 *   3. DefaultClosingShift → plantilla por defecto
 *
 * Las franjas resueltas se usan tanto en la landing pública (/agenda) como
 * en la auto-asignación de closer (scheduleResolver).
 */
import { prisma } from "@/lib/prisma";

const TIMEZONE = "Europe/Madrid";

export type ResolvedShift = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  closerId: string;
  slotDurationMinutes: number;
};

export type AgendaBlockInfo = {
  blockedDate: Date;
  blockedStartTime: string | null;
  blockedEndTime: string | null;
};

/**
 * Devuelve la duración global de los slots según la plantilla por defecto.
 * Se calcula tomando la franja "más representativa" (la primera ordenada).
 * En la UI tratamos la duración como global pero almacenamos por franja.
 */
export async function getDefaultSlotDuration(): Promise<number> {
  const first = await prisma.defaultClosingShift.findFirst({
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
  return first?.slotDurationMinutes ?? 60;
}

/**
 * Devuelve las franjas de una semana concreta (lunes 00:00 Madrid → domingo 23:59).
 * Si la semana NO tiene override (o useDefault=true), devuelve la plantilla.
 * Si tiene override (useDefault=false), devuelve los ClosingShift de la semana.
 */
export async function getShiftsForWeek(weekStartDate: Date): Promise<ResolvedShift[]> {
  // Buscar override de la semana usando rango de día completo para evitar
  // problemas de timezone entre Date guardados con distintos offsets.
  const dayStart = new Date(weekStartDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const override = await prisma.weekOverride.findFirst({
    where: { weekStartDate: { gte: dayStart, lte: dayEnd } },
  });

  if (override && !override.useDefault) {
    // Semana personalizada → ClosingShift de esta semana
    const shifts = await prisma.closingShift.findMany({
      where: { weekStartDate: { gte: dayStart, lte: dayEnd } },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    return shifts.map((s) => ({
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      closerId: s.closerId,
      slotDurationMinutes: s.slotDurationMinutes,
    }));
  }

  // Por defecto → plantilla
  const defaults = await prisma.defaultClosingShift.findMany({
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
  return defaults.map((s) => ({
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
    closerId: s.closerId,
    slotDurationMinutes: s.slotDurationMinutes,
  }));
}

/**
 * Devuelve TODAS las franjas de un rango de fechas (puede cruzar varias semanas).
 * Útil para la landing que muestra los próximos 20 días.
 *
 * Las franjas devueltas incluyen, por cada día del rango, la dayOfWeek y
 * franjas correspondientes a esa semana.
 */
export async function getShiftsForDateRange(from: Date, to: Date): Promise<Map<string, ResolvedShift[]>> {
  // Mapa weekStartDate (ISO YYYY-MM-DD) → shifts de esa semana
  const cache = new Map<string, ResolvedShift[]>();
  const cursor = new Date(from);
  while (cursor <= to) {
    const ws = weekStartOf(cursor);
    const key = ws.toISOString().slice(0, 10);
    if (!cache.has(key)) {
      const shifts = await getShiftsForWeek(ws);
      cache.set(key, shifts);
    }
    // Avanzar 1 semana
    cursor.setDate(cursor.getDate() + 7);
  }
  return cache;
}

/**
 * Devuelve los bloqueos activos en un rango de fechas.
 */
export async function getBlocksInRange(from: Date, to: Date): Promise<AgendaBlockInfo[]> {
  const blocks = await prisma.agendaBlock.findMany({
    where: { blockedDate: { gte: from, lte: to } },
  });
  return blocks.map((b) => ({
    blockedDate: b.blockedDate,
    blockedStartTime: b.blockedStartTime,
    blockedEndTime: b.blockedEndTime,
  }));
}

/**
 * Comprueba si un slot concreto (fecha + hora inicio/fin Madrid) está bloqueado.
 */
export function isSlotBlocked(
  slotDateMadrid: { year: number; month: number; day: number },
  slotStartMin: number,
  slotEndMin: number,
  blocks: AgendaBlockInfo[]
): boolean {
  for (const b of blocks) {
    const bYMD = madridYMD(b.blockedDate);
    if (
      bYMD.year !== slotDateMadrid.year ||
      bYMD.month !== slotDateMadrid.month ||
      bYMD.day !== slotDateMadrid.day
    ) {
      continue;
    }
    // Bloqueo de día entero
    if (!b.blockedStartTime || !b.blockedEndTime) return true;
    // Bloqueo de franja concreta: si hay solape
    const bStart = timeToMinutes(b.blockedStartTime);
    const bEnd = timeToMinutes(b.blockedEndTime);
    if (slotStartMin < bEnd && slotEndMin > bStart) return true;
  }
  return false;
}

// ─── Utilidades de hora Madrid (replicadas para mantener este helper self-contained) ───

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return h * 60 + m;
}

export function madridYMD(d: Date): { year: number; month: number; day: number } {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(d);
  const pick = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    year: parseInt(pick("year"), 10),
    month: parseInt(pick("month"), 10),
    day: parseInt(pick("day"), 10),
  };
}

export function madridDayOfWeek(d: Date): number {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    weekday: "short",
  });
  const wk = dtf.format(d);
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[wk] || 1;
}

function getMadridOffsetMinutes(utcDate: Date): number {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(utcDate);
  const pick = (type: string) => parts.find((p) => p.type === type)!.value;
  const asUtc = Date.UTC(
    parseInt(pick("year"), 10),
    parseInt(pick("month"), 10) - 1,
    parseInt(pick("day"), 10),
    parseInt(pick("hour"), 10) % 24,
    parseInt(pick("minute"), 10),
    parseInt(pick("second"), 10)
  );
  return Math.round((asUtc - utcDate.getTime()) / 60000);
}

export function madridDateAt(year: number, month: number, day: number, hour: number, minute: number): Date {
  const asUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const probe = new Date(asUtcMs);
  const offsetMin = getMadridOffsetMinutes(probe);
  return new Date(asUtcMs - offsetMin * 60000);
}

/**
 * Lunes 00:00 Madrid de la semana que contiene la fecha dada.
 */
export function weekStartOf(date: Date): Date {
  const ymd = madridYMD(date);
  const dow = madridDayOfWeek(madridDateAt(ymd.year, ymd.month, ymd.day, 12, 0));
  const today = madridDateAt(ymd.year, ymd.month, ymd.day, 0, 0);
  return new Date(today.getTime() - (dow - 1) * 86400 * 1000);
}
