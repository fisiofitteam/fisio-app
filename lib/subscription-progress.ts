/**
 * Cálculo del progreso de la suscripción del paciente teniendo en cuenta
 * pausas y extensiones concedidas por el fisio.
 *
 * Historia: antes usábamos `(hoy - subscriptionStartDate) / 30.44` y lo
 * comparábamos con `subscriptionTotalMonths`. Esto se le adelantaba al
 * paciente cuando había pausas — el fisio veía "80% consumido" mientras
 * el atleta llevaba 2 semanas sin poder entrenar por lesión.
 *
 * Ahora usamos como fuente de verdad la fila activa de SubscriptionRenewal
 * (su endDate ya lo ha extendido `extendSubscriptionByDays` cada vez que
 * se ha pausado o despausado). El "consumido" descuenta los días que el
 * paciente esté pausado HOY.
 *
 * También expone la semana en la que está el atleta, congelándola cuando
 * hay una pausa activa (para que el fisio sepa dónde retomar).
 */
import { prisma } from "@/lib/prisma";

export type SubscriptionProgress = {
  /** Meses "efectivos" ya recorridos (float, respeta pausa activa). */
  consumedMonths: number;
  /** Meses totales EFECTIVOS del periodo (incluye extensiones por pausas). */
  totalMonths: number;
  /** Semana natural en la que está el atleta hoy (1-N). null si no hay fecha
   *  de alta. Se congela si el paciente está pausado ahora. */
  currentWeek: number | null;
  /** True si HOY hay una ProgramPause activa (start<=hoy<end). */
  isPaused: boolean;
};

type PatientLite = {
  id: string;
  subscriptionStartDate: Date | null;
  subscriptionPeriodMonths: number;
  subscriptionTotalMonths: number;
};

const MS_PER_DAY = 86_400_000;
const DAYS_PER_MONTH = 30.44;

export async function getSubscriptionProgress(patient: PatientLite): Promise<SubscriptionProgress> {
  if (!patient.subscriptionStartDate) {
    return { consumedMonths: 0, totalMonths: patient.subscriptionTotalMonths || 0, currentWeek: null, isPaused: false };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(patient.subscriptionStartDate);
  start.setHours(0, 0, 0, 0);

  const [activeRenewal, pauses] = await Promise.all([
    prisma.subscriptionRenewal.findFirst({
      where: { patientId: patient.id, status: "active" },
      orderBy: { startDate: "desc" },
      select: { startDate: true, endDate: true },
    }).catch(() => null),
    prisma.programPause.findMany({
      where: { patientId: patient.id },
      select: { startDate: true, endDate: true, actualEndDate: true },
    }).catch(() => []),
  ]);

  return compute(start, today, activeRenewal, pauses, patient);
}

/** Versión batch: para el listado /fisio/pacientes evitamos N+1 con una
 *  única query de renewals activos y otra de pauses por lote de pacientes. */
export async function getSubscriptionProgressBatch(patients: PatientLite[]): Promise<Record<string, SubscriptionProgress>> {
  const ids = patients.map((p) => p.id);
  const [renewals, pauses] = await Promise.all([
    prisma.subscriptionRenewal.findMany({
      where: { patientId: { in: ids }, status: "active" },
      orderBy: { startDate: "desc" },
      select: { patientId: true, startDate: true, endDate: true },
    }).catch(() => [] as any[]),
    prisma.programPause.findMany({
      where: { patientId: { in: ids } },
      select: { patientId: true, startDate: true, endDate: true, actualEndDate: true },
    }).catch(() => [] as any[]),
  ]);

  const renewalByPatient = new Map<string, { startDate: Date | null; endDate: Date | null }>();
  for (const r of renewals) {
    if (!renewalByPatient.has(r.patientId)) renewalByPatient.set(r.patientId, r);
  }
  const pausesByPatient = new Map<string, typeof pauses>();
  for (const p of pauses) {
    const arr = pausesByPatient.get(p.patientId) ?? [];
    arr.push(p);
    pausesByPatient.set(p.patientId, arr);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const out: Record<string, SubscriptionProgress> = {};
  for (const p of patients) {
    if (!p.subscriptionStartDate) {
      out[p.id] = { consumedMonths: 0, totalMonths: p.subscriptionTotalMonths || 0, currentWeek: null, isPaused: false };
      continue;
    }
    const start = new Date(p.subscriptionStartDate);
    start.setHours(0, 0, 0, 0);
    out[p.id] = compute(start, today, renewalByPatient.get(p.id) ?? null, pausesByPatient.get(p.id) ?? [], p);
  }
  return out;
}

function compute(
  start: Date,
  today: Date,
  activeRenewal: { startDate: Date | null; endDate: Date | null } | null,
  pauses: Array<{ startDate: Date; endDate: Date; actualEndDate: Date | null }>,
  patient: PatientLite,
): SubscriptionProgress {
  // Total efectivo = (endDate - startDate) del periodo activo. Si no hay,
  // cae al calculo antiguo por meses.
  let totalMonths: number;
  if (activeRenewal?.startDate && activeRenewal.endDate) {
    const ms = activeRenewal.endDate.getTime() - activeRenewal.startDate.getTime();
    totalMonths = ms / (MS_PER_DAY * DAYS_PER_MONTH);
  } else {
    totalMonths = patient.subscriptionTotalMonths || patient.subscriptionPeriodMonths || 0;
  }

  // Días transcurridos brutos desde el alta.
  const rawDays = Math.max(0, Math.floor((today.getTime() - start.getTime()) / MS_PER_DAY));

  // ─── Descuento por pausas ───
  // Para el porcentaje: sumamos los días de todas las pausas PASADAS y
  // los días transcurridos dentro de la pausa ACTIVA (si la hay).
  // Para la semana: congelamos en el momento del inicio de la pausa
  // activa (si aplica), en vez de seguir avanzando.
  let pausedDaysPast = 0;
  let activePause: { startDate: Date } | null = null;
  for (const p of pauses) {
    const s = new Date(p.startDate);
    s.setHours(0, 0, 0, 0);
    const e = new Date(p.actualEndDate ?? p.endDate);
    e.setHours(0, 0, 0, 0);
    if (today >= s && today < e) {
      activePause = { startDate: s };
      // Sumamos SOLO los días desde s hasta hoy (los futuros no).
      pausedDaysPast += Math.max(0, Math.floor((today.getTime() - s.getTime()) / MS_PER_DAY));
    } else if (e <= today) {
      // Pausa completamente pasada — descontar duración total efectiva.
      pausedDaysPast += Math.max(0, Math.floor((e.getTime() - s.getTime()) / MS_PER_DAY));
    }
  }

  const effectiveDays = Math.max(0, rawDays - pausedDaysPast);
  const consumedMonths = effectiveDays / DAYS_PER_MONTH;

  // Semana natural (1-based). Congelada en semana de pausa si aplica.
  let currentWeek: number;
  if (activePause) {
    const daysToPause = Math.max(0, Math.floor((activePause.startDate.getTime() - start.getTime()) / MS_PER_DAY));
    currentWeek = Math.floor(daysToPause / 7) + 1;
  } else {
    currentWeek = Math.floor(effectiveDays / 7) + 1;
  }

  return {
    consumedMonths,
    totalMonths,
    currentWeek,
    isPaused: !!activePause,
  };
}
