/**
 * Cálculo de slots disponibles para reserva pública desde la landing.
 *
 * Replica la configuración de la agenda Google "Videoconsulta valoración":
 *  - Duración: 60 min
 *  - Antelación mínima: 24h
 *  - Periodo de reserva: 20 días vista
 *  - Franjas semanales fijas (ver WEEKLY_SLOTS abajo)
 *
 * Cruza con los eventos existentes en Calendar para saber qué slots
 * están realmente libres.
 */
import { listEvents } from "@/lib/googleCalendar";

/**
 * Franjas semanales en las que se pueden agendar llamadas.
 * Días: 1=L, 2=M, 3=X, 4=J, 5=V, 6=S, 7=D
 * Horas en HH:MM 24h, zona horaria Europe/Madrid.
 *
 * Si necesitas cambiar el horario, edita este array y redeploya.
 */
const WEEKLY_SLOTS: Array<{ dayOfWeek: number; startTime: string; endTime: string }> = [
  { dayOfWeek: 1, startTime: "18:00", endTime: "20:00" },        // Lunes 18-20
  { dayOfWeek: 2, startTime: "12:00", endTime: "14:00" },        // Martes 12-14
  { dayOfWeek: 3, startTime: "08:00", endTime: "11:00" },        // Miércoles 8-11
  { dayOfWeek: 3, startTime: "16:30", endTime: "19:30" },        // Miércoles 16:30-19:30
  { dayOfWeek: 4, startTime: "11:00", endTime: "14:00" },        // Jueves 11-14
  { dayOfWeek: 5, startTime: "10:30", endTime: "12:30" },        // Viernes 10:30-12:30
];

export const SLOT_DURATION_MINUTES = 60;
export const MIN_HOURS_AHEAD = 24;
export const MAX_DAYS_AHEAD = 20;

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return h * 60 + m;
}

function setTime(date: Date, hhmm: string): Date {
  const d = new Date(date);
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  d.setHours(h, m, 0, 0);
  return d;
}

export type SlotInfo = {
  startISO: string;    // ISO completo con timezone
  endISO: string;
  dayOfWeek: number;
  hhmm: string;        // "10:30" para mostrar
};

/**
 * Calcula todos los slots posibles según WEEKLY_SLOTS, filtra los que pasan
 * los criterios (24h antelación, 20 días vista), y descarta los que ya
 * están ocupados en Calendar.
 */
export async function getAvailableSlots(): Promise<SlotInfo[]> {
  const now = new Date();
  const minStart = new Date(now.getTime() + MIN_HOURS_AHEAD * 3600 * 1000);
  const maxStart = new Date(now);
  maxStart.setDate(maxStart.getDate() + MAX_DAYS_AHEAD);

  // 1) Generar todos los slots candidatos
  const candidates: SlotInfo[] = [];
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  const limitDate = new Date(maxStart);
  limitDate.setHours(23, 59, 59, 999);

  while (cursor <= limitDate) {
    const dow = cursor.getDay() === 0 ? 7 : cursor.getDay();
    const dailyFranjas = WEEKLY_SLOTS.filter((f) => f.dayOfWeek === dow);

    for (const franja of dailyFranjas) {
      const franjaStart = timeToMinutes(franja.startTime);
      const franjaEnd = timeToMinutes(franja.endTime);
      // Generar slots de 60 min dentro de la franja
      for (let m = franjaStart; m + SLOT_DURATION_MINUTES <= franjaEnd; m += SLOT_DURATION_MINUTES) {
        const hh = Math.floor(m / 60).toString().padStart(2, "0");
        const mm = (m % 60).toString().padStart(2, "0");
        const hhmm = `${hh}:${mm}`;
        const start = setTime(cursor, hhmm);
        if (start < minStart) continue;
        if (start > maxStart) continue;
        const end = new Date(start.getTime() + SLOT_DURATION_MINUTES * 60 * 1000);
        candidates.push({
          startISO: start.toISOString(),
          endISO: end.toISOString(),
          dayOfWeek: dow,
          hhmm,
        });
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  if (candidates.length === 0) return [];

  // 2) Cruzar con eventos existentes para eliminar los ocupados
  const fromISO = candidates[0].startISO;
  const toISO = candidates[candidates.length - 1].endISO;
  const events = await listEvents(fromISO, toISO);

  // Mapeo rápido de slots ocupados
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
    // Un slot está ocupado si SE SOLAPA con cualquier evento existente
    return !occupied.some((o) => startMs < o.endMs && endMs > o.startMs);
  });

  return available;
}
