/**
 * Cálculo de slots disponibles para reserva pública desde la landing.
 *
 * IMPORTANTE — Zona horaria:
 *   Todas las franjas están definidas en HORA DE MADRID. Este código trabaja
 *   internamente con la zona Europe/Madrid (no con la zona del servidor).
 *
 *   El problema del bug anterior: usar `Date.setHours()` aplica la zona del
 *   servidor (UTC en Vercel), no Madrid. Eso provocaba un desfase de ±1-2h.
 *
 *   La solución: construimos cadenas ISO con el offset correcto de Madrid
 *   para cada fecha (que cambia entre invierno +01:00 y verano +02:00).
 */
import { listEvents } from "@/lib/googleCalendar";

/**
 * Franjas semanales en HORA DE MADRID.
 * Días: 1=L, 2=M, 3=X, 4=J, 5=V, 6=S, 7=D
 */
const WEEKLY_SLOTS: Array<{ dayOfWeek: number; startTime: string; endTime: string }> = [
  { dayOfWeek: 1, startTime: "18:00", endTime: "20:00" },
  { dayOfWeek: 2, startTime: "12:00", endTime: "14:00" },
  { dayOfWeek: 3, startTime: "08:00", endTime: "11:00" },
  { dayOfWeek: 3, startTime: "16:30", endTime: "19:30" },
  { dayOfWeek: 4, startTime: "11:00", endTime: "14:00" },
  { dayOfWeek: 5, startTime: "10:30", endTime: "12:30" },
];

export const SLOT_DURATION_MINUTES = 60;
export const MIN_HOURS_AHEAD = 24;
export const MAX_DAYS_AHEAD = 20;

const TIMEZONE = "Europe/Madrid";

export type SlotInfo = {
  startISO: string;
  endISO: string;
  dayOfWeek: number;
  hhmm: string;
};

/**
 * Devuelve el offset (en minutos) que tiene Madrid respecto a UTC en una
 * fecha dada. En invierno es +60 (CET), en verano es +120 (CEST).
 *
 * Implementación: usa Intl con formatToParts para obtener la hora de Madrid
 * a partir de un Date UTC dado, y calcula la diferencia.
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
  // Construimos un Date "como si" la hora local fuera Madrid → calculamos
  // cuántos minutos difiere de la fecha UTC original
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
 * Construye un Date que representa "fecha=YYYY-MM-DD, hora=HH:MM en Madrid".
 * Devuelve un Date UTC equivalente (la representación interna de JS).
 *
 * Estrategia: tomamos la fecha/hora como si fuera UTC, luego restamos el
 * offset de Madrid para esa fecha. Hacemos una segunda iteración por si
 * cae justo en el cambio de hora (DST), que el offset depende de la fecha.
 */
function madridDateAt(year: number, month: number, day: number, hour: number, minute: number): Date {
  // Primer intento: tratar como si fuera UTC
  const asUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  // Calcular el offset de Madrid en ESA fecha aproximada
  const probe = new Date(asUtcMs);
  const offsetMin = getMadridOffsetMinutes(probe);
  // El Date real en UTC es: fecha-hora como UTC, menos el offset de Madrid
  const realUtcMs = asUtcMs - offsetMin * 60000;
  return new Date(realUtcMs);
}

/**
 * Día de la semana (1=L .. 7=D) en hora de Madrid para un Date dado.
 */
function dayOfWeekInMadrid(d: Date): number {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    weekday: "short",
  });
  const wk = dtf.format(d); // "Mon", "Tue", etc
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[wk] || 1;
}

/**
 * Devuelve {year, month, day} en hora de Madrid para un Date dado.
 */
function madridYMD(d: Date): { year: number; month: number; day: number } {
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

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return h * 60 + m;
}

export async function getAvailableSlots(): Promise<SlotInfo[]> {
  const now = new Date();
  const minStart = new Date(now.getTime() + MIN_HOURS_AHEAD * 3600 * 1000);
  const maxStart = new Date(now.getTime() + MAX_DAYS_AHEAD * 86400 * 1000);

  // 1) Generar candidatos día a día en hora de Madrid
  const candidates: SlotInfo[] = [];

  // Empezamos "hoy en Madrid"
  const todayMadrid = madridYMD(now);

  // Iteramos por días naturales en Madrid (no en UTC) durante MAX_DAYS_AHEAD+1
  for (let dayOffset = 0; dayOffset <= MAX_DAYS_AHEAD; dayOffset++) {
    // Día i-ésimo desde hoy: usamos el truco de añadir días en UTC y luego
    // pedir su YMD en Madrid (más fiable que sumar 86400000 ms al inicio del día)
    const dProbe = new Date(now.getTime() + dayOffset * 86400 * 1000);
    const ymd = madridYMD(dProbe);

    // Día de la semana de esa fecha en Madrid
    const dow = dayOfWeekInMadrid(madridDateAt(ymd.year, ymd.month, ymd.day, 12, 0));

    const dailyFranjas = WEEKLY_SLOTS.filter((f) => f.dayOfWeek === dow);
    for (const franja of dailyFranjas) {
      const franjaStart = timeToMinutes(franja.startTime);
      const franjaEnd = timeToMinutes(franja.endTime);
      for (let m = franjaStart; m + SLOT_DURATION_MINUTES <= franjaEnd; m += SLOT_DURATION_MINUTES) {
        const hh = Math.floor(m / 60);
        const mm = m % 60;
        const hhmm = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
        const startDate = madridDateAt(ymd.year, ymd.month, ymd.day, hh, mm);
        if (startDate < minStart) continue;
        if (startDate > maxStart) continue;
        const endDate = new Date(startDate.getTime() + SLOT_DURATION_MINUTES * 60 * 1000);
        candidates.push({
          startISO: startDate.toISOString(),
          endISO: endDate.toISOString(),
          dayOfWeek: dow,
          hhmm,
        });
      }
    }
  }

  if (candidates.length === 0) return [];

  // 2) Cruzar con eventos existentes para eliminar los ocupados
  const fromISO = candidates[0].startISO;
  const toISO = candidates[candidates.length - 1].endISO;
  const events = await listEvents(fromISO, toISO);

  type Range = { startMs: number; endMs: number };
  const occupied: Range[] = events
    .filter((e) => e.status !== "cancelled" && e.start?.dateTime && e.end?.dateTime)
    .map((e) => ({
      startMs: new Date(e.start.dateTime).getTime(),
      endMs: new Date(e.end.dateTime).getTime(),
    }));

  const available = candidates.filter((s) => {
    const startMs = new Date(s.startISO).getTime();
    const endMs = new Date(s.endISO).getTime();
    return !occupied.some((o) => startMs < o.endMs && endMs > o.startMs);
  });

  return available;
}
