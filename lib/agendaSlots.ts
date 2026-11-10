/**
 * Shared eligibility rules for public sales bookings and rescheduling.
 * Shifts, overrides and blocks are always evaluated again before booking.
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

export const MIN_HOURS_AHEAD = 24;
export const MAX_DAYS_AHEAD = 20;

export type SlotInfo = {
  startISO: string;
  endISO: string;
  dayOfWeek: number;
  hhmm: string;
  durationMinutes: number;
};

type ConfiguredSlot = SlotInfo & { closerId: string };

/** Configured slots before subtracting Google events; also used by both POSTs. */
export async function getConfiguredSlots(now = new Date()): Promise<ConfiguredSlot[]> {
  const minStart = new Date(now.getTime() + MIN_HOURS_AHEAD * 3600 * 1000);
  const maxStart = new Date(now.getTime() + MAX_DAYS_AHEAD * 86400 * 1000);
  const firstDay = madridYMD(now);
  const lastDay = madridYMD(maxStart);
  // Iterate civil dates, not 24-hour jumps, to avoid skipping/repeating a date at DST.
  const cursor = new Date(Date.UTC(firstDay.year, firstDay.month - 1, firstDay.day));
  const last = new Date(Date.UTC(lastDay.year, lastDay.month - 1, lastDay.day));
  const afterLast = new Date(last);
  afterLast.setUTCDate(afterLast.getUTCDate() + 1);
  const blockFrom = madridDateAt(firstDay.year, firstDay.month, firstDay.day, 0, 0);
  const blockTo = new Date(madridDateAt(afterLast.getUTCFullYear(), afterLast.getUTCMonth() + 1, afterLast.getUTCDate(), 0, 0).getTime() - 1);
  const [shiftsByWeek, blocks] = await Promise.all([
    getShiftsForDateRange(now, maxStart),
    getBlocksInRange(blockFrom, blockTo),
  ]);
  const candidates = new Map<string, ConfiguredSlot>();

  for (; cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const ymd = { year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1, day: cursor.getUTCDate() };
    const noon = madridDateAt(ymd.year, ymd.month, ymd.day, 12, 0);
    const dow = madridDayOfWeek(noon);
    const weekKey = weekStartOf(noon).toISOString().slice(0, 10);
    const dailyShifts = (shiftsByWeek.get(weekKey) || []).filter(f => f.dayOfWeek === dow);

    for (const shift of dailyShifts) {
      const startMin = timeToMinutes(shift.startTime);
      const endMin = timeToMinutes(shift.endTime);
      const duration = shift.slotDurationMinutes;
      // Ignore invalid configuration rather than offer unusable slots or loop forever.
      if (!shift.closerId || !Number.isInteger(duration) || duration <= 0 ||
          !Number.isFinite(startMin) || !Number.isFinite(endMin) ||
          startMin < 0 || endMin > 1440 || startMin >= endMin) continue;
      for (let m = startMin; m + duration <= endMin; m += duration) {
        if (isSlotBlocked(ymd, m, m + duration, blocks)) continue;
        const hh = Math.floor(m / 60);
        const mm = m % 60;
        const startDate = madridDateAt(ymd.year, ymd.month, ymd.day, hh, mm);
        if (startDate < minStart || startDate > maxStart) continue;
        const endDate = new Date(startDate.getTime() + duration * 60_000);
        const startISO = startDate.toISOString();
        const endISO = endDate.toISOString();
        const key = `${startISO}/${endISO}`;
        if (!candidates.has(key)) candidates.set(key, {
          startISO, endISO, dayOfWeek: dow,
          hhmm: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
          durationMinutes: duration, closerId: shift.closerId,
        });
      }
    }
  }
  return [...candidates.values()].sort((a, b) => a.startISO.localeCompare(b.startISO) || a.endISO.localeCompare(b.endISO));
}

/** Match both instants exactly: a free Calendar interval alone is not bookable. */
export async function findConfiguredSlot(startISO: string, endISO: string, now = new Date()): Promise<ConfiguredSlot | null> {
  const startMs = new Date(startISO).getTime();
  const endMs = new Date(endISO).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs ||
      startMs < now.getTime() + MIN_HOURS_AHEAD * 3_600_000 ||
      startMs > now.getTime() + MAX_DAYS_AHEAD * 86_400_000) return null;
  const candidates = await getConfiguredSlots(now);
  return candidates.find(slot => new Date(slot.startISO).getTime() === startMs && new Date(slot.endISO).getTime() === endMs) || null;
}

export async function getAvailableSlots(): Promise<SlotInfo[]> {
  const candidates = await getConfiguredSlots();
  if (candidates.length === 0) return [];
  const fromISO = candidates[0].startISO;
  const toISO = candidates.reduce((latest, slot) => slot.endISO > latest ? slot.endISO : latest, candidates[0].endISO);
  const events = await listEvents(fromISO, toISO);
  const occupied = events
    .filter(e => e.status !== "cancelled" && e.start?.dateTime && e.end?.dateTime)
    .map(e => ({ startMs: new Date(e.start.dateTime).getTime(), endMs: new Date(e.end.dateTime).getTime() }));

  return candidates.filter(slot => {
    const startMs = new Date(slot.startISO).getTime();
    const endMs = new Date(slot.endISO).getTime();
    return !occupied.some(event => startMs < event.endMs && endMs > event.startMs);
  }).map(({ closerId: _closerId, ...slot }) => slot);
}
