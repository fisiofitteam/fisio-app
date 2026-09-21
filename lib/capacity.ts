import { prisma } from "@/lib/prisma";
import { getOpsConfig, type OpsConfigShape } from "@/lib/ops-config";

/**
 * Reporte de capacidad operativa: cuánta carga lleva cada fisio (+ head
 * coach), cuántos huecos previstos tiene, y cómo va su tasa histórica de
 * renovación. Este helper es la ÚNICA fuente de verdad para el panel y
 * cualquier widget que quiera consumir estos números — así evitamos
 * fórmulas duplicadas con umbrales ligeramente distintos.
 *
 * Definiciones:
 *  - Coach: Professional con role ∈ { "fisio", "head_success" } y active=true.
 *  - Assigned: pacientes con assignedProfessionalId = coach.id, excluyendo
 *    fantasmas (isTest=true).
 *  - Active: assigned + tiene un SubscriptionRenewal con status="active" y
 *    endDate > now.
 *  - Paused: active + hay ProgramPause con status en scheduled/active que
 *    contenga la fecha de hoy.
 *  - Capacity: Professional.maxPatients ?? OpsConfig.defaultMaxPatients.
 *  - Occupancy: (base / capacity) * 100. base = active o assigned según
 *    OpsConfig.occupancyBasis.
 *  - RenewsSoon: pacientes con renewal activo y endDate ≤ hoy + expectedRenewDays.
 *  - RenewalRate: sobre renewals FINALIZADOS en los últimos M meses,
 *    (renewed / (renewed + lost)) * 100. Si el coach no tiene histórico
 *    suficiente (≤2 decisiones), cae a la media del equipo (useTeamFallback).
 *  - ExpectedRenew: renewsSoon * rate/100. Cuántas plazas se liberarán.
 *  - ProjectedFree: free + expectedRenew - renewsSoon (renewsSoon vacía
 *    la plaza aunque renueve porque asumimos que el renewal reserva el
 *    slot antes de vencer). Simplificamos a: (capacity - active) - (renewsSoon
 *    - expectedRenew). El signo importa: negativo = déficit.
 */

export type CoachRow = {
  id: string;
  fullName: string;
  role: string;
  photoUrl: string | null;
  capacity: number;
  maxPatientsOverride: number | null;
  assigned: number;
  active: number;
  paused: number;
  free: number;
  occupancy: number;                 // %
  renewsSoon: number;
  renewalRate: number | null;        // %
  useTeamFallback: boolean;
  expectedRenew: number;
  projectedFree: number;
};

export type PausedPatientRow = {
  id: string;
  fullName: string;
  coachId: string | null;
  coachName: string | null;
  pauseStart: string;
  pauseEnd: string;
  daysLeft: number;
};

export type CapacityReport = {
  config: OpsConfigShape;
  generatedAt: string;
  summary: {
    coaches: number;
    assigned: number;
    active: number;
    paused: number;
    capacityTotal: number;
    freeTotal: number;
    renewsSoonTotal: number;
    expectedRenewTotal: number;
    saturatedCoaches: number;
  };
  coaches: CoachRow[];
  pausedPatients: PausedPatientRow[];
};

/** Añade N meses conservando final de mes. */
function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d;
}

export async function computeCapacityReport(): Promise<CapacityReport> {
  const config = await getOpsConfig();
  const now = new Date();

  // 1) Coaches — fisios + head_success activos.
  const coaches = await prisma.professional.findMany({
    where: { role: { in: ["fisio", "head_success"] }, active: true },
    orderBy: [{ role: "desc" }, { fullName: "asc" }],
    select: { id: true, fullName: true, role: true, photoUrl: true, maxPatients: true },
  });

  // 2) Todos los pacientes asignados (no test) con su renewal activo y
  //    pausas actuales. Traemos un batch, luego agrupamos en memoria.
  const patients = await prisma.patient.findMany({
    where: {
      isTest: false,
      assignedProfessionalId: { in: coaches.map((c) => c.id) },
    },
    select: {
      id: true,
      fullName: true,
      assignedProfessionalId: true,
      renewals: {
        where: { status: "active", endDate: { gt: now } },
        orderBy: { endDate: "desc" },
        take: 1,
        select: { endDate: true },
      },
      programPauses: {
        where: {
          status: { in: ["scheduled", "active"] },
          startDate: { lte: now },
          OR: [
            { actualEndDate: null, endDate: { gt: now } },
            { actualEndDate: { gt: now } },
          ],
        },
        orderBy: { startDate: "desc" },
        take: 1,
        select: { startDate: true, endDate: true, actualEndDate: true },
      },
    },
  });

  // 3) Histórico de renovaciones finalizadas en los últimos M meses para
  //    calcular la tasa. Un renewal "finalizado" tiene status="finished"
  //    (renovó) o status="lost" (no renovó).
  const historyFrom = addMonths(now, -config.renewalHistoryMonths);
  const historicalRenewals = await prisma.subscriptionRenewal.findMany({
    where: {
      status: { in: ["finished", "lost"] },
      decidedAt: { gte: historyFrom },
      patient: { isTest: false, assignedProfessionalId: { in: coaches.map((c) => c.id) } },
    },
    select: {
      status: true,
      patient: { select: { assignedProfessionalId: true } },
    },
  });

  const renewalsByCoach = new Map<string, { won: number; lost: number }>();
  for (const r of historicalRenewals) {
    const cid = r.patient.assignedProfessionalId;
    if (!cid) continue;
    const cur = renewalsByCoach.get(cid) ?? { won: 0, lost: 0 };
    if (r.status === "finished") cur.won++;
    else if (r.status === "lost") cur.lost++;
    renewalsByCoach.set(cid, cur);
  }

  // Tasa de equipo (fallback para coaches nuevos sin histórico suficiente).
  const teamTotals = Array.from(renewalsByCoach.values()).reduce(
    (acc, v) => ({ won: acc.won + v.won, lost: acc.lost + v.lost }),
    { won: 0, lost: 0 },
  );
  const teamRate = teamTotals.won + teamTotals.lost > 0
    ? Math.round((teamTotals.won / (teamTotals.won + teamTotals.lost)) * 100)
    : null;

  // 4) Construir filas por coach.
  const soonThresholdMs = now.getTime() + config.expectedRenewDays * 86_400_000;
  const rows: CoachRow[] = coaches.map((c) => {
    const myPatients = patients.filter((p) => p.assignedProfessionalId === c.id);
    const assigned = myPatients.length;
    const active = myPatients.filter((p) => p.renewals.length > 0).length;
    const paused = myPatients.filter((p) => p.programPauses.length > 0).length;

    const capacity = c.maxPatients ?? config.defaultMaxPatients;
    const base = config.occupancyBasis === "assigned" ? assigned : active;
    const occupancy = capacity > 0 ? Math.round((base / capacity) * 100) : 0;
    const free = Math.max(0, capacity - base);

    // Renuevan pronto: pacientes activos cuyo endDate cae dentro de la
    // ventana `expectedRenewDays`.
    const renewsSoon = myPatients.filter((p) => {
      const r = p.renewals[0];
      return r?.endDate && r.endDate.getTime() <= soonThresholdMs;
    }).length;

    const hist = renewalsByCoach.get(c.id) ?? { won: 0, lost: 0 };
    const decisions = hist.won + hist.lost;
    const useTeamFallback = decisions <= 2;
    const renewalRate = useTeamFallback
      ? teamRate
      : Math.round((hist.won / decisions) * 100);

    const expectedRenew = renewalRate != null
      ? Math.round(renewsSoon * (renewalRate / 100))
      : renewsSoon; // sin datos asumimos que renuevan todos para no infra-estimar carga

    // Huecos previstos: los que ya hay + los que se liberan (los que no
    // renuevan) - los que renuevan pero aún cuentan como carga en el
    // periodo. Simplificamos: free + (renewsSoon - expectedRenew).
    const projectedFree = free + (renewsSoon - expectedRenew);

    return {
      id: c.id,
      fullName: c.fullName,
      role: c.role,
      photoUrl: c.photoUrl ?? null,
      capacity,
      maxPatientsOverride: c.maxPatients ?? null,
      assigned,
      active,
      paused,
      free,
      occupancy,
      renewsSoon,
      renewalRate,
      useTeamFallback,
      expectedRenew,
      projectedFree,
    };
  });

  // 5) Sección de pacientes en pausa. Los ordenamos por fecha de fin
  //    (los que vuelven antes salen arriba).
  const coachById = new Map(coaches.map((c) => [c.id, c] as const));
  const pausedPatients: PausedPatientRow[] = patients
    .filter((p) => p.programPauses.length > 0)
    .map((p) => {
      const pause = p.programPauses[0];
      const end = pause.actualEndDate ?? pause.endDate;
      const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
      const coach = p.assignedProfessionalId ? coachById.get(p.assignedProfessionalId) ?? null : null;
      return {
        id: p.id,
        fullName: p.fullName,
        coachId: coach?.id ?? null,
        coachName: coach?.fullName ?? null,
        pauseStart: pause.startDate.toISOString(),
        pauseEnd: end.toISOString(),
        daysLeft,
      };
    })
    .sort((a, b) => a.pauseEnd.localeCompare(b.pauseEnd));

  const summary = {
    coaches: rows.length,
    assigned: rows.reduce((n, r) => n + r.assigned, 0),
    active: rows.reduce((n, r) => n + r.active, 0),
    paused: rows.reduce((n, r) => n + r.paused, 0),
    capacityTotal: rows.reduce((n, r) => n + r.capacity, 0),
    freeTotal: rows.reduce((n, r) => n + r.free, 0),
    renewsSoonTotal: rows.reduce((n, r) => n + r.renewsSoon, 0),
    expectedRenewTotal: rows.reduce((n, r) => n + r.expectedRenew, 0),
    saturatedCoaches: rows.filter((r) => r.occupancy >= config.occupancyCrit).length,
  };

  return {
    config,
    generatedAt: now.toISOString(),
    summary,
    coaches: rows,
    pausedPatients,
  };
}
