// Helper para tareas puntuales (mensuales o por rango de fechas) del equipo.
import { prisma } from "@/lib/prisma";

/**
 * Devuelve el "primer día del mes en Madrid" de la fecha dada, como UTC midnight.
 * Lo usamos como occurrenceDate de las tareas mensuales: una sola fila por mes
 * y profesional.
 */
export function monthStartMadridUtc(d: Date = new Date()): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value) - 1;
  return new Date(Date.UTC(y, m, 1));
}

/** Devuelve la fecha de "hoy" en Madrid normalizada a UTC midnight de ese día. */
export function todayMadridUtc(d: Date = new Date()): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value) - 1;
  const day = Number(parts.find((p) => p.type === "day")!.value);
  return new Date(Date.UTC(y, m, day));
}

export type AdHocTaskItem = {
  id: string;
  title: string;
  kind: "monthly" | "range";
  dayOfMonth: number | null;
  startDateIso: string | null;
  endDateIso: string | null;
  completed: boolean;
  /** Texto descriptivo del calendario (p. ej. "día 1 de cada mes" o "del 5 al 12 de may"). */
  scheduleLabel: string;
  /** ISO de la occurrenceDate usada para la completación (mes en monthly, startDate en range). */
  occurrenceDateIso: string;
};

const MONTH_NAMES_LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function fmtRange(start: Date, end: Date): string {
  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
  const sDay = start.getUTCDate();
  const eDay = end.getUTCDate();
  const sMonth = MONTH_NAMES_LONG[start.getUTCMonth()].slice(0, 3);
  const eMonth = MONTH_NAMES_LONG[end.getUTCMonth()].slice(0, 3);
  return sameMonth ? `del ${sDay} al ${eDay} de ${eMonth}` : `del ${sDay} de ${sMonth} al ${eDay} de ${eMonth}`;
}

/**
 * Devuelve las tareas puntuales VIGENTES HOY para un profesional de un rol.
 * - monthly: vigente desde el día X del mes en curso (inclusive) hasta fin de mes.
 * - range: vigente si hoy ∈ [startDate, endDate].
 */
export async function buildAdHocActiveForProfessional(
  professionalId: string,
  role: string,
): Promise<AdHocTaskItem[]> {
  const today = todayMadridUtc();
  const monthStart = monthStartMadridUtc();

  // monthly: día actual >= dayOfMonth → la tarea sigue viva este mes.
  // range: today >= startDate && today <= endDate.
  const dayOfMonthToday = today.getUTCDate();

  const tasks = await prisma.teamTaskAdHoc.findMany({
    where: {
      targetRole: role,
      active: true,
      OR: [
        { kind: "monthly", dayOfMonth: { lte: dayOfMonthToday } },
        { kind: "range", startDate: { lte: today }, endDate: { gte: today } },
      ],
    },
    orderBy: [{ kind: "asc" }, { startDate: "asc" }, { dayOfMonth: "asc" }, { createdAt: "asc" }],
  });

  if (tasks.length === 0) return [];

  // Cargar completaciones del profesional para esas tareas en su occurrenceDate.
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
        id: t.id,
        title: t.title,
        kind: "monthly",
        dayOfMonth: t.dayOfMonth,
        startDateIso: null,
        endDateIso: null,
        completed: doneKey.has(key),
        scheduleLabel: `día ${t.dayOfMonth} de cada mes`,
        occurrenceDateIso: occurrence.toISOString(),
      };
    }
    const start = t.startDate!;
    const end = t.endDate!;
    const occurrence = start;
    const key = `${t.id}|${occurrence.toISOString()}`;
    return {
      id: t.id,
      title: t.title,
      kind: "range",
      dayOfMonth: null,
      startDateIso: start.toISOString(),
      endDateIso: end.toISOString(),
      completed: doneKey.has(key),
      scheduleLabel: fmtRange(start, end),
      occurrenceDateIso: occurrence.toISOString(),
    };
  });
}
