import { prisma } from "@/lib/prisma";

/**
 * Resuelve qué closer cubre una fecha/hora concreta según las franjas de
 * `ClosingShift` configuradas para esa semana.
 *
 * IMPORTANTE — Zona horaria:
 *   Las franjas están almacenadas como "HH:MM" en HORA DE MADRID. Por tanto,
 *   convertimos el Date entrante a hora de Madrid antes de comparar.
 *   Usar `date.getHours()` aplicaría la zona del servidor (UTC en Vercel),
 *   que falsea la comparación.
 */

const TIMEZONE = "Europe/Madrid";

/**
 * Devuelve {year, month, day, hour, minute, dayOfWeek} en hora de Madrid
 * para un Date dado.
 */
function madridParts(d: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
} {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = dtf.formatToParts(d);
  const pick = (type: string) => parts.find((p) => p.type === type)!.value;
  const wkMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    year: parseInt(pick("year"), 10),
    month: parseInt(pick("month"), 10),
    day: parseInt(pick("day"), 10),
    hour: parseInt(pick("hour"), 10) % 24,
    minute: parseInt(pick("minute"), 10),
    dayOfWeek: wkMap[pick("weekday")] || 1,
  };
}

/**
 * Devuelve el offset (en minutos) que tiene Madrid respecto a UTC en una
 * fecha dada (varía por DST: +60 invierno, +120 verano).
 */
function getMadridOffsetMinutes(utcDate: Date): number {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
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

/**
 * Construye un Date que representa una fecha/hora en hora de Madrid.
 */
function madridDateAt(year: number, month: number, day: number, hour: number, minute: number): Date {
  const asUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const probe = new Date(asUtcMs);
  const offsetMin = getMadridOffsetMinutes(probe);
  return new Date(asUtcMs - offsetMin * 60000);
}

/**
 * Devuelve el lunes 00:00 (HORA DE MADRID) de la semana que contiene
 * la fecha dada.
 */
export function weekStartOf(date: Date): Date {
  const m = madridParts(date);
  // Construimos el día actual en Madrid 00:00 y restamos (dayOfWeek-1) días
  const todayMadrid = madridDateAt(m.year, m.month, m.day, 0, 0);
  const monday = new Date(todayMadrid.getTime() - (m.dayOfWeek - 1) * 86400 * 1000);
  return monday;
}

/** Convierte "HH:MM" a minutos desde medianoche (09:30 → 570) */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return h * 60 + m;
}

export async function whoseSlot(datetime: Date): Promise<string | null> {
  const m = madridParts(datetime);
  const weekStart = weekStartOf(datetime);
  const minutes = m.hour * 60 + m.minute;

  const shifts = await prisma.closingShift.findMany({
    where: {
      weekStartDate: weekStart,
      dayOfWeek: m.dayOfWeek,
    },
  });

  for (const shift of shifts) {
    const startMin = timeToMinutes(shift.startTime);
    const endMin = timeToMinutes(shift.endTime);
    if (minutes >= startMin && minutes < endMin) {
      return shift.closerId;
    }
  }
  return null;
}
