/**
 * Resuelve qué closer cubre una fecha/hora concreta usando la misma fuente
 * de verdad que la landing (plantilla por defecto + overrides de semana).
 */
import {
  getShiftsForWeek,
  madridYMD,
  madridDayOfWeek,
  madridDateAt,
  weekStartOf,
  timeToMinutes,
} from "@/lib/agendaTemplate";

export { weekStartOf, timeToMinutes };

export async function whoseSlot(datetime: Date): Promise<string | null> {
  const ymd = madridYMD(datetime);
  const dow = madridDayOfWeek(madridDateAt(ymd.year, ymd.month, ymd.day, 12, 0));
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(datetime);
  const hour = parseInt(parts.find((p) => p.type === "hour")!.value, 10) % 24;
  const minute = parseInt(parts.find((p) => p.type === "minute")!.value, 10);
  const minutes = hour * 60 + minute;

  const weekStart = weekStartOf(datetime);
  const shifts = await getShiftsForWeek(weekStart);

  for (const shift of shifts) {
    if (shift.dayOfWeek !== dow) continue;
    const startMin = timeToMinutes(shift.startTime);
    const endMin = timeToMinutes(shift.endTime);
    if (minutes >= startMin && minutes < endMin) {
      return shift.closerId;
    }
  }
  return null;
}
