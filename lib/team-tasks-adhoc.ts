// Helper para tareas puntuales (mensuales, "1er lunes", o por rango) del equipo.
import { prisma } from "@/lib/prisma";

/** Primer día del mes en Madrid de la fecha dada, como UTC midnight. */
export function monthStartMadridUtc(d: Date = new Date()): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit" });
  const parts = fmt.formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value) - 1;
  return new Date(Date.UTC(y, m, 1));
}

/** "Hoy" en Madrid normalizado a UTC midnight de ese día. */
export function todayMadridUtc(d: Date = new Date()): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = fmt.formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value) - 1;
  const day = Number(parts.find((p) => p.type === "day")!.value);
  return new Date(Date.UTC(y, m, day));
}

/** Día de la semana de una fecha UTC, en zona Madrid: 1=L .. 7=D. */
export function madridDayOfWeek(date: Date): number {
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short" });
  const wk = fmt.format(date);
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[wk] || 1;
}

/**
 * Devuelve la fecha (UTC midnight) del N-ésimo día-de-la-semana del mes
 * (calendario Madrid).
 *   nthWeek > 0 → 1=primer, 2=segundo, 3=tercer, 4=cuarto.
 *   nthWeek = -1 → último.
 *   dayOfWeek: 1=L .. 7=D.
 * Devuelve null si no existe (ej. "5º lunes" del mes).
 */
export function nthWeekdayOfMonth(year: number, monthIdx: number, dayOfWeek: number, nthWeek: number): Date | null {
  const lastDay = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  if (nthWeek === -1) {
    for (let d = lastDay; d >= 1; d--) {
      const date = new Date(Date.UTC(year, monthIdx, d));
      if (madridDayOfWeek(date) === dayOfWeek) return date;
    }
    return null;
  }
  let count = 0;
  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(Date.UTC(year, monthIdx, d));
    if (madridDayOfWeek(date) === dayOfWeek) {
      count++;
      if (count === nthWeek) return date;
    }
  }
  return null;
}

export type AdHocTaskItem = {
  id: string;
  title: string;
  kind: "monthly" | "monthly_weekday" | "range";
  dayOfMonth: number | null;
  nthWeek: number | null;
  dayOfWeek: number | null;
  startDateIso: string | null;
  endDateIso: string | null;
  completed: boolean;
  scheduleLabel: string;
  occurrenceDateIso: string;
};

const MONTH_NAMES_LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DAY_NAMES_LONG = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const NTH_LABELS: Record<number, string> = { 1: "1er", 2: "2º", 3: "3er", 4: "4º", [-1]: "último" };

export function describeWeekdayOfMonth(nthWeek: number, dayOfWeek: number): string {
  const nth = NTH_LABELS[nthWeek] ?? `${nthWeek}º`;
  return `${nth} ${DAY_NAMES_LONG[dayOfWeek] ?? "día"} de cada mes`;
}

function fmtRange(start: Date, end: Date): string {
  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
  const sDay = start.getUTCDate();
  const eDay = end.getUTCDate();
  const sMonth = MONTH_NAMES_LONG[start.getUTCMonth()].slice(0, 3);
  const eMonth = MONTH_NAMES_LONG[end.getUTCMonth()].slice(0, 3);
  return sameMonth ? `del ${sDay} al ${eDay} de ${eMonth}` : `del ${sDay} de ${sMonth} al ${eDay} de ${eMonth}`;
}

/**
 * Parsea assigneesJson de una tarea. "[]" o array vacío = todos del role.
 * Cualquier otra cosa malformada → []. Resultado: array de Professional.id.
 */
export function parseAssignees(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Devuelve las tareas puntuales VIGENTES HOY para un profesional concreto.
 *   - monthly: vigente desde día X hasta fin de mes.
 *   - monthly_weekday: vigente desde la fecha objetivo (Nº dow del mes) hasta fin de mes.
 *   - range: vigente si hoy ∈ [startDate, endDate].
 * Además filtra por assignees: solo aplica si el array está vacío (=todos del
 * rol) o incluye este professionalId.
 */
export async function buildAdHocActiveForProfessional(
  professionalId: string,
  role: string,
): Promise<AdHocTaskItem[]> {
  const today = todayMadridUtc();
  const monthStart = monthStartMadridUtc();
  const dayOfMonthToday = today.getUTCDate();
  const year = today.getUTCFullYear();
  const monthIdx = today.getUTCMonth();

  const allTasks = await prisma.teamTaskAdHoc.findMany({
    where: { targetRole: role, active: true },
    orderBy: [{ kind: "asc" }, { startDate: "asc" }, { dayOfMonth: "asc" }, { createdAt: "asc" }],
  });

  // Filtrar por vigencia + asignados.
  const tasks = allTasks.filter((t) => {
    const assignees = parseAssignees(t.assigneesJson);
    if (assignees.length > 0 && !assignees.includes(professionalId)) return false;
    if (t.kind === "monthly") {
      return t.dayOfMonth != null && t.dayOfMonth <= dayOfMonthToday;
    }
    if (t.kind === "monthly_weekday") {
      if (t.nthWeek == null || t.dayOfWeek == null) return false;
      const target = nthWeekdayOfMonth(year, monthIdx, t.dayOfWeek, t.nthWeek);
      return !!target && today.getTime() >= target.getTime();
    }
    if (t.kind === "range") {
      if (!t.startDate || !t.endDate) return false;
      return today >= t.startDate && today <= t.endDate;
    }
    return false;
  });

  if (tasks.length === 0) return [];

  const ids = tasks.map((t) => t.id);
  const completions = await prisma.teamTaskAdHocCompletion.findMany({
    where: { taskId: { in: ids }, professionalId },
    select: { taskId: true, occurrenceDate: true },
  });
  const doneKey = new Set(completions.map((c) => `${c.taskId}|${c.occurrenceDate.toISOString()}`));

  return tasks.map<AdHocTaskItem>((t) => {
    if (t.kind === "monthly") {
      const occurrence = monthStart;
      const key = `${t.id}|${occurrence.toISOString()}`;
      return {
        id: t.id, title: t.title, kind: "monthly",
        dayOfMonth: t.dayOfMonth, nthWeek: null, dayOfWeek: null,
        startDateIso: null, endDateIso: null,
        completed: doneKey.has(key),
        scheduleLabel: `día ${t.dayOfMonth} de cada mes`,
        occurrenceDateIso: occurrence.toISOString(),
      };
    }
    if (t.kind === "monthly_weekday") {
      const occurrence = monthStart;
      const key = `${t.id}|${occurrence.toISOString()}`;
      return {
        id: t.id, title: t.title, kind: "monthly_weekday",
        dayOfMonth: null, nthWeek: t.nthWeek, dayOfWeek: t.dayOfWeek,
        startDateIso: null, endDateIso: null,
        completed: doneKey.has(key),
        scheduleLabel: describeWeekdayOfMonth(t.nthWeek!, t.dayOfWeek!),
        occurrenceDateIso: occurrence.toISOString(),
      };
    }
    const start = t.startDate!;
    const end = t.endDate!;
    const occurrence = start;
    const key = `${t.id}|${occurrence.toISOString()}`;
    return {
      id: t.id, title: t.title, kind: "range",
      dayOfMonth: null, nthWeek: null, dayOfWeek: null,
      startDateIso: start.toISOString(), endDateIso: end.toISOString(),
      completed: doneKey.has(key),
      scheduleLabel: fmtRange(start, end),
      occurrenceDateIso: occurrence.toISOString(),
    };
  });
}
