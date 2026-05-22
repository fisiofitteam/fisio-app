/**
 * Helpers para calcular el estado del programa de un paciente,
 * teniendo en cuenta sus pausas.
 *
 * El "día efectivo de programa" para un paciente con pausas es:
 *   díasDesdeInicio - díasEnPausasYaTerminadas - díasYaConsumidosDeLaPausaActiva
 *
 * Cuando está pausado, la app debe mostrar "Programa pausado" en lugar del contenido.
 */

import { prisma } from "./prisma";

export type PauseSnapshot = {
  isPaused: boolean;
  activePause: {
    id: string;
    startDate: Date;
    endDate: Date;
    daysRemaining: number;
    reason: string | null;
  } | null;
  upcomingPause: {
    id: string;
    startDate: Date;
    endDate: Date;
    reason: string | null;
  } | null;
  totalPausedDaysCompleted: number;       // días totales en pausas YA terminadas
};

function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/**
 * Devuelve el estado actual de pausas del paciente.
 * Si hay una pausa activa hoy → isPaused = true.
 */
export async function getPauseSnapshot(patientId: string): Promise<PauseSnapshot> {
  const pauses = await prisma.programPause.findMany({
    where: { patientId },
    orderBy: { startDate: "asc" },
  });

  const today = todayMidnight();
  let activePause: PauseSnapshot["activePause"] = null;
  let upcomingPause: PauseSnapshot["upcomingPause"] = null;
  let totalPausedDaysCompleted = 0;

  for (const p of pauses) {
    if (p.status === "cancelled") continue;
    if (p.status === "ended") {
      const realEnd = p.actualEndDate || p.endDate;
      totalPausedDaysCompleted += Math.max(0, daysBetween(p.startDate, realEnd));
      continue;
    }
    // status = scheduled o active
    if (p.startDate <= today && today < p.endDate) {
      activePause = {
        id: p.id,
        startDate: p.startDate,
        endDate: p.endDate,
        daysRemaining: Math.max(0, daysBetween(today, p.endDate)),
        reason: p.reason,
      };
    } else if (p.startDate > today) {
      upcomingPause = {
        id: p.id,
        startDate: p.startDate,
        endDate: p.endDate,
        reason: p.reason,
      };
    }
  }

  return {
    isPaused: !!activePause,
    activePause,
    upcomingPause,
    totalPausedDaysCompleted,
  };
}

/**
 * Devuelve la semana efectiva del programa para un paciente con programa fijo,
 * descontando las pausas. El día 1 es el primer día post-startedAt.
 */
export function effectiveWeekIndex(startedAt: Date, totalPausedDays: number): number {
  const today = todayMidnight();
  const rawDays = Math.max(0, daysBetween(startedAt, today));
  const effectiveDays = Math.max(0, rawDays - totalPausedDays);
  return Math.floor(effectiveDays / 7) + 1; // semana 1, 2, 3...
}

/**
 * Devuelve el lunes 00:00 de la semana que contiene `date`.
 */
export function weekStartDate(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = domingo, 1 = lunes, ...
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return d;
}
