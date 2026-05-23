/**
 * Cálculo de slots disponibles para reserva pública desde la landing.
 *
 * Lee la configuración de horarios desde la BD (plantilla + overrides + bloqueos)
 * y los cruza con eventos existentes en Google Calendar.
 *
 * Todas las franjas están en HORA DE MADRID.
 */
import { listEvents } from "@/lib/googleCalendar";
import {
  getShiftsForDateRange,
  getBlocksInRange,
  isSlotBlocked,
  madridYMD,
  madridDayOfWeek,
  madridDateAt,
  weekStartOf,
  timeToMinutes,
} from "@/lib/agendaTemplate";

export const SLOT_DURATION_MINUTES = 60;
export const MIN_HOURS_AHEAD = 24;
export const MAX_DAYS_AHEAD = 20;

export type SlotInfo = {
  startISO: string;
  endISO: string;
  dayOfWeek: number;
  hhmm: string;
};

export async function getAvailableSlots(): Promise<SlotInfo[]> {
  const now = new Date();
  const minStart = new Date(now.getTime() + MIN_HOURS_AHEAD * 3600 * 1000);
  const maxStart = new Date(now.getTime() + MAX_DAYS_AHEAD * 86400 * 1000);

  // 1) Cargar franjas (plantilla u overrides) para todo el rango
  const shiftsByWeek = await getShiftsForDateRange(now, maxStart);

  // 2) Cargar bloqueos del rango
  const blocks = await getBlocksInRange(now, maxStart);

  // 3) Generar candidatos
  const candidates: SlotInfo[] = [];

  for (let dayOffset = 0; dayOffset <= MAX_DAYS_AHEAD; dayOffset++) {
    const dProbe = new Date(now.getTime() + dayOffset * 86400 * 1000);
    const ymd = madridYMD(dProbe);
    const dow = madridDayOfWeek(madridDateAt(ymd.year, ymd.month, ymd.day, 12, 0));

    const weekStart = weekStartOf(dProbe);
    const weekKey = weekStart.toISOString().slice(0, 10);
    const weekShifts = shiftsByWeek.get(weekKey) || [];
    const dailyFranjas = weekShifts.filter((f) => f.dayOfWeek === dow);

    for (const franja of dailyFranjas) {
      const franjaStart = timeToMinutes(franja.startTime);
      const franjaEnd = timeToMinutes(franja.endTime);
      for (let m = franjaStart; m + SLOT_DURATION_MINUTES <= franjaEnd; m += SLOT_DURATION_MINUTES) {
        const hh = Math.floor(m / 60);
        const mm = m % 60;
        const hhmm = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;

        // Filtrar bloqueos
        if (isSlotBlocked(ymd, m, m + SLOT_DURATION_MINUTES, blocks)) continue;

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

  // 4) Cruzar con eventos Calendar
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
