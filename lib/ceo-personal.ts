// Helpers server-safe del sistema personal del CEO. Sin "use client".

export type CeoTaskPriority = "low" | "medium" | "high";
export type CeoRecurrence = "none" | "daily" | "weekly" | "monthly";

export const PRIORITY_LABELS: Record<CeoTaskPriority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

export const PRIORITY_COLOR: Record<CeoTaskPriority, string> = {
  low: "bg-neutral-100 text-neutral-600",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-800",
};

export const PRIORITY_ORDER: CeoTaskPriority[] = ["high", "medium", "low"];

export const RECURRENCE_LABELS: Record<CeoRecurrence, string> = {
  none: "Sin recurrencia",
  daily: "Cada día",
  weekly: "Cada semana",
  monthly: "Cada mes",
};

/** ¿Este rol puede usar el sistema personal del CEO? */
export function canUseCeoPersonal(role: string): boolean {
  return role === "ceo";
}

/** Calcula la próxima fecha de una tarea recurrente al completarla. */
export function nextRecurrenceDate(
  type: CeoRecurrence,
  day: number | null,
  base: Date = new Date(),
): Date | null {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  if (type === "daily") {
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (type === "weekly") {
    // day: 1=Lun ... 7=Dom (ISO)
    const targetDow = day && day >= 1 && day <= 7 ? day : 1;
    const currentDow = d.getDay() === 0 ? 7 : d.getDay();
    let delta = targetDow - currentDow;
    if (delta <= 0) delta += 7;
    d.setDate(d.getDate() + delta);
    return d;
  }
  if (type === "monthly") {
    // day: 1-31. Saltamos al próximo mes en ese día.
    const targetDay = day && day >= 1 && day <= 31 ? day : 1;
    d.setMonth(d.getMonth() + 1);
    const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(targetDay, maxDay));
    return d;
  }
  return null;
}

/** Día actual a las 00:00 UTC (para CeoJournalEntry.date). */
export function startOfDayUtc(d: Date = new Date()): Date {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  return out;
}

/** Año y mes (1-12) actuales en local. */
export function currentYearMonth(d: Date = new Date()): { year: number; month: number } {
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}
