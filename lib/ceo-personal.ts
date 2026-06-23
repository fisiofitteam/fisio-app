// Helpers server-safe del sistema personal del CEO. Sin "use client".
import { isoWeekFromDate } from "./content-templates";

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

/**
 * "Inicio del día" tomando la fecha en zona Europe/Madrid y devolviéndola
 * como timestamp UTC 00:00 de ese día Madrid. Es decir, sirve como clave
 * estable por día desde el punto de vista del CEO en España.
 *
 * Nombre antiguo: startOfDayUtc (lo mantenemos por compat de imports). El
 * comportamiento cambió en v57.x para que cambiar de día a las 00:00 hora
 * Madrid (no a las 02:00 como antes en verano) refresque la agenda.
 */
export function startOfDayUtc(d: Date = new Date()): Date {
  // Truco habitual: "es-CA" devuelve YYYY-MM-DD; lo combinamos con UTC.
  const ymd = d.toLocaleDateString("es-CA", { timeZone: "Europe/Madrid" });
  const [y, m, day] = ymd.split("-").map((x) => Number(x));
  return new Date(Date.UTC(y, m - 1, day, 0, 0, 0, 0));
}

/** Día anterior en zona Madrid, mismo formato que startOfDayUtc. */
export function startOfYesterdayUtc(d: Date = new Date()): Date {
  const today = startOfDayUtc(d);
  return new Date(today.getTime() - 24 * 3600 * 1000);
}

/** Año y mes (1-12) actuales en local. */
export function currentYearMonth(d: Date = new Date()): { year: number; month: number } {
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

// ─── Semana ISO actual y anterior, para los objetivos semanales ────────────

export function currentIsoWeek(d: Date = new Date()): { isoYear: number; isoWeek: number } {
  const { year, weekNumber } = isoWeekFromDate(d);
  return { isoYear: year, isoWeek: weekNumber };
}

/** Semana ISO anterior (para arrastrar objetivos no cumplidos). */
export function previousIsoWeek(isoYear: number, isoWeek: number): { isoYear: number; isoWeek: number } {
  if (isoWeek > 1) return { isoYear, isoWeek: isoWeek - 1 };
  // Semana 53 del año anterior si la tuvo, si no 52. Como heurística sencilla:
  // tomamos un jueves de mediados del año anterior y vemos su semana ISO máx.
  // Simplificación: probamos con 53 y 52.
  const probe = new Date(Date.UTC(isoYear - 1, 11, 28)); // 28 dic ⇒ siempre cae en la última semana ISO del año
  const prev = isoWeekFromDate(probe);
  return { isoYear: prev.year, isoWeek: prev.weekNumber };
}

// ─── Estados de tarea ──────────────────────────────────────────────────────

export type CeoTaskStatus = "pending" | "in_progress" | "waiting" | "done";

export const TASK_STATUS_LABELS: Record<CeoTaskStatus, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  waiting: "Esperando",
  done: "Hecho",
};

export const TASK_STATUS_COLOR: Record<CeoTaskStatus, string> = {
  pending: "bg-neutral-100 text-neutral-700",
  in_progress: "bg-blue-100 text-blue-700",
  waiting: "bg-purple-100 text-purple-700",
  done: "bg-emerald-100 text-emerald-700",
};

export const TASK_STATUS_ICON: Record<CeoTaskStatus, string> = {
  pending: "○",
  in_progress: "🟢",
  waiting: "⏳",
  done: "✓",
};
