import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { getActiveProfessional } from "@/lib/session";
import { calculateAdherence } from "@/lib/adherence";
import { getPeriodRange, calculateFinanceSummary, type Period } from "@/lib/finance";
import { getProgramEndingsForProfessional } from "@/lib/program-endings";
import { getLoadReviewsForProfessional } from "@/lib/load-reviews";
import { TeamMetricsBlock } from "@/components/TeamMetricsBlock";
import { DashboardKpiCard, type KpiDetail } from "@/components/DashboardKpiCard";
import { RegenerateCallsButton } from "@/components/RegenerateCallsButton";
import { CEOPanelTabs } from "@/components/CEOPanelTabs";
import { FisioPanelTabs } from "@/components/FisioPanelTabs";
import { ProgramEndingsBox } from "@/components/ProgramEndingsBox";
import { LoadReviewsBox } from "@/components/LoadReviewsBox";
import { WeeklyTeamTasksBoard } from "@/components/WeeklyTeamTasksBoard";
import { buildWeeklyBoardForProfessional } from "@/lib/weekly-team-tasks";
import { AdHocTasksCard } from "@/components/AdHocTasksCard";
import { buildAdHocActiveForProfessional } from "@/lib/team-tasks-adhoc";
import { calculatePreventionMetrics } from "@/lib/prevention-metrics";
import { PreventionMetricsBlock } from "@/components/PreventionMetricsBlock";
import { hasPendingFormReview } from "@/lib/pending-form-review";
import { activePatientCondition } from "@/lib/patient-active";
import { getRenewalActivityInPeriod } from "@/lib/renewals";
import { markFormReviewed } from "./formularios-pendientes/actions";

const TYPE_LABELS: Record<string, string> = {
  optimizacion: "Optimización",
  renovacion: "Renovación",
};

function daysUntilRenewal(start: Date | null, periodMonths: number): number | null {
  if (!start) return null;
  const renewalDate = new Date(start);
  renewalDate.setMonth(renewalDate.getMonth() + periodMonths);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const renewal = new Date(renewalDate);
  renewal.setHours(0, 0, 0, 0);
  return Math.round((renewal.getTime() - now.getTime()) / 86400000);
}

function parseCustomRange(from?: string, to?: string): { start: Date; end: Date } | null {
  if (!from || !to) return null;
  const start = new Date(from);
  const end = new Date(to);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export default async function FisioPanelPage({
  searchParams,
}: {
  searchParams: {
    teamPeriod?: string;
    from?: string;
    to?: string;
    salesPeriod?: string;
    salesFrom?: string;
    salesTo?: string;
  };
}) {
  const user = (await getActiveProfessional())!;

  // === SETTER: panel propio (llamadas agendadas, show rate, IA vs setter, tareas) ===
  if (user.role === "setter") {
    return renderSetterPanel(user, searchParams);
  }

  // === CLOSER: panel propio con métricas + ventas del período ===
  if (user.role === "closer") {
    return renderCloserPanel(user, searchParams);
  }

  const isManager = user.isManager;

  // Período del bloque "Métricas equipo"
  const customRange = parseCustomRange(searchParams.from, searchParams.to);
  const teamPeriod: Period | "custom" = customRange
    ? "custom"
    : (["month", "quarter", "year"].includes(searchParams.teamPeriod ?? "")
      ? (searchParams.teamPeriod as Period)
      : "month");

  let periodStart: Date, periodEnd: Date, periodLabel: string;
  if (customRange) {
    periodStart = customRange.start;
    periodEnd = customRange.end;
    const fmt = (d: Date) => d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
    periodLabel = `${fmt(periodStart)} → ${fmt(periodEnd)}`;
  } else {
    const r = getPeriodRange(teamPeriod as Period);
    periodStart = r.start; periodEnd = r.end; periodLabel = r.label;
  }

  // KPIs excluyen pacientes fantasma (isTest=true) — el listado
  // /fisio/pacientes sigue mostrandolos con badge, aqui no cuentan.
  const patientWhere: any = isManager ? { isTest: false } : { isTest: false, assignedProfessionalId: user.id };
  const patients = await prisma.patient.findMany({ where: patientWhere, orderBy: { fullName: "asc" } });

  // Tareas: excluimos las asociadas a pacientes fantasma (isTest). Las
  // tareas sin paciente (sueltas) o con lead siguen apareciendo.
  const taskWhere: any = {
    completedAt: null,
    OR: [
      { patientId: null },
      { patient: { isTest: false } },
    ],
  };
  if (!isManager) {
    // Combinamos con el filtro de asignacion sin cargarse el OR anterior.
    taskWhere.AND = [
      {
        OR: [
          { assignedToProfessionalId: user.id },
          { source: "own", assignedToProfessionalId: null },
        ],
      },
    ];
  }
  const tasks = await prisma.fisioTask.findMany({
    where: taskWhere,
    include: { patient: true },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    take: 5,
  });

  // Excluimos ScheduledCall de pacientes fantasma tambien.
  // Aceptamos scheduledAt null ("pendiente de agendar") y también fechas
  // futuras. Ponemos los sin-fecha arriba para que salten a la vista.
  const scheduleWhere = {
    OR: [
      { scheduledAt: null },
      { scheduledAt: { gte: new Date() } },
    ],
  };
  const callWhere: any = isManager
    ? { completedAt: null, ...scheduleWhere, patient: { isTest: false, ...activePatientCondition() } }
    : { completedAt: null, ...scheduleWhere, patient: { isTest: false, assignedProfessionalId: user.id, ...activePatientCondition() } };
  const calls = await prisma.scheduledCall.findMany({
    where: callWhere,
    include: { patient: true },
    orderBy: [
      { scheduledAt: { sort: "asc", nulls: "first" } },
      { createdAt: "asc" },
    ],
    take: 5,
  });

  const pendingFormSessions = await prisma.programSession.findMany({
    where: {
      completedAt: { not: null },
      formReviewedAt: null,
      // Fuera formularios de pacientes fantasma y terminados.
      assignment: isManager
        ? { patient: { isTest: false, ...activePatientCondition() } }
        : { patient: { isTest: false, assignedProfessionalId: user.id, ...activePatientCondition() } },
    },
    include: { assignment: { include: { patient: true, program: true } } },
    orderBy: { completedAt: "desc" },
    // Traemos un pool amplio y filtramos en memoria (predicado no
    // expresable en Prisma). Si ponemos take: 5 aqui y las 5 mas recientes
    // no tienen respuestas guardadas, el recuadro sale vacio aunque haya
    // muchos mas rellenados por debajo — que era exactamente lo que veian
    // los fisios. 200 cubre de sobra un mes de actividad.
    take: 200,
  });
  // Solo dejamos los que el paciente REALMENTE rellenó (no vacíos, no
  // sentinels de "skipped"). El filtro anterior contaba cualquier sesion
  // con task FORM aunque nadie la hubiese contestado — por eso a los
  // fisios no les aparecian pacientes con forms recien rellenados.
  // Recortamos a 5 tras filtrar para el recuadro compacto.
  const pendingForms = pendingFormSessions.filter(hasPendingFormReview).slice(0, 5);

  // Renovaciones próximas: partimos del endDate REAL del SubscriptionRenewal
  // activo/scheduled más tardío de cada paciente (no del subscriptionStartDate
  // inicial + periodMonths, que no refleja renovaciones — los pacientes
  // renovados salían como "vencida hace 29 días").
  //
  // Ventana: solo FUTURAS, de hoy a +30 días. Las vencidas no salen aquí
  // (ya se ven en /fisio/pacientes y en otros paneles). Las de más de 30
  // días también se salen para no saturar.
  //
  // Filtramos por assigned al fisio si no es manager, y por pacientes
  // activos (activePatientCondition + no test). Reservas de plaza NO
  // cuentan como "renovación cubierta": el paciente tiene reserva, pero
  // su renovación real sigue pendiente — para saber cuándo hay que
  // perseguir, miramos el endDate del último periodo NO reserva.
  const renewalsWindowFrom = new Date();
  renewalsWindowFrom.setHours(0, 0, 0, 0);
  const renewalsWindowTo = new Date();
  renewalsWindowTo.setDate(renewalsWindowTo.getDate() + 30);
  const activePeriods = await prisma.subscriptionRenewal.findMany({
    where: {
      status: { in: ["active", "scheduled"] },
      isReservation: false,
      endDate: { gte: renewalsWindowFrom, lte: renewalsWindowTo },
      patient: {
        isTest: false,
        ...activePatientCondition(),
        ...(isManager ? {} : { assignedProfessionalId: user.id }),
      },
    },
    select: {
      patientId: true,
      endDate: true,
      patient: { select: { id: true, fullName: true } },
    },
  });
  // Cuando un paciente tiene active + scheduled, nos quedamos con el endDate
  // más tardío (que es el próximo vencimiento real, ya que el scheduled
  // arranca cuando acaba el active).
  const byPatient = new Map<string, { patient: { id: string; fullName: string }; endDate: Date }>();
  for (const p of activePeriods) {
    if (!p.endDate) continue;
    const prev = byPatient.get(p.patientId);
    if (!prev || p.endDate.getTime() > prev.endDate.getTime()) {
      byPatient.set(p.patientId, { patient: p.patient, endDate: p.endDate });
    }
  }
  const nowStart = new Date();
  nowStart.setHours(0, 0, 0, 0);
  // Ojo: el KPI "Renuevan en 30d" se cuenta sobre TODOS los que caen en
  // ventana; el listado visual se recorta a los 5 más próximos después.
  // Antes se hacía el slice antes del count y el KPI se quedaba clavado
  // en un máximo de 5 aunque hubiese más pacientes por renovar.
  const withRenewalAll = Array.from(byPatient.values())
    .map(({ patient, endDate }) => ({
      patient,
      days: Math.round((endDate.getTime() - nowStart.getTime()) / 86400000),
    }))
    .sort((a, b) => a.days - b.days);
  const renewalsIn30 = withRenewalAll.filter((x) => x.days >= 0 && x.days <= 30).length;
  const withRenewal = withRenewalAll.slice(0, 5);

  // Programas asignados a punto de terminar (≤7 días) → recuadro + campanita
  const programEndings = await getProgramEndingsForProfessional(user.id);

  // Controles de cargas pendientes de revisar (cada loadReviewIntervalWeeks).
  // El CEO ve los de todos; el head_success y los fisios solo los de SUS
  // pacientes asignados.
  const loadReviews = await getLoadReviewsForProfessional(user.id, {
    all: user.role === "ceo",
  });

  // Board semanal de tareas del equipo (fisio / head_success). El CEO ve los
  // dos paneles + edita en /fisio/tareas; fisios y head_success ven solo el
  // suyo en modo "self" (las completadas desaparecen).
  const [weeklyBoard, adHocTasks] =
    user.role === "fisio" || user.role === "head_success"
      ? await Promise.all([
          buildWeeklyBoardForProfessional(user.id, user.role),
          buildAdHocActiveForProfessional(user.id, user.role),
        ])
      : [null, []];

  // Métricas para managers en el período seleccionado.
  //
  // Renewal rate real: cualquier SubscriptionRenewal cuyo endDate cae en
  // el rango es una "oportunidad de renovación". Se clasifica como
  // renewed si el paciente tiene otro periodo posterior, lost si no.
  // El ratio = renewed / (renewed + lost).
  //
  // Distinto de "decisiones de renovación por fecha de creación" (que
  // sigue en compensation.ts para comisiones): esto es el KPI clásico
  // del negocio — de los que TUVIERON que decidir, cuántos siguieron.
  let teamRenewals = { renewed: 0, lost: 0, total: 0, rate: null as number | null };
  let perFisio: PerFisio[] = [];
  if (isManager) {
    const opportunities = await getRenewalActivityInPeriod(periodStart, periodEnd);
    const tr = opportunities.filter((o) => o.outcome === "renewed").length;
    const tl = opportunities.filter((o) => o.outcome === "lost").length;
    const tt = tr + tl;
    teamRenewals = {
      renewed: tr, lost: tl, total: tt,
      rate: tt > 0 ? Math.round((tr / tt) * 100) : null,
    };

    const fisios = await prisma.professional.findMany({
      where: { role: { in: ["fisio", "head_success"] } },
      orderBy: { fullName: "asc" },
    });
    perFisio = await Promise.all(
      fisios.map(async (f) => {
        const myPatients = await prisma.patient.findMany({
          where: { assignedProfessionalId: f.id, isTest: false },
          select: { id: true },
        });
        const myPatientIds = myPatients.map((p) => p.id);
        // Atribución: por assignedProfessionalId actual del paciente.
        // Si un paciente cambió de fisio a media suscripción, la
        // decisión se cuenta para su fisio actual.
        const myOpps = opportunities.filter((o) => o.assignedProfessionalId === f.id);
        const fr = myOpps.filter((o) => o.outcome === "renewed").length;
        const fl = myOpps.filter((o) => o.outcome === "lost").length;
        const ft = fr + fl;
        const fRate = ft > 0 ? Math.round((fr / ft) * 100) : null;
        const adhs = await Promise.all(myPatientIds.map((id) => calculateAdherence(id)));
        const validAdhs = adhs.filter((a) => a.total > 0);
        const avgAdh = validAdhs.length > 0
          ? Math.round(validAdhs.reduce((acc, a) => acc + a.percentage, 0) / validAdhs.length)
          : null;
        return {
          id: f.id, fullName: f.fullName, role: f.role,
          patientsCount: myPatientIds.length,
          renewed: fr, lost: fl, rate: fRate, adherence: avgAdh,
        };
      })
    );
  }

  // === Header común ===
  const headerContent = (
    <header className="mb-5 flex justify-between items-end flex-wrap gap-2">
      <div>
        <h1 className="text-xl font-semibold">Panel de control</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Hola {user.fullName.split(" ")[0]} · {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>
      {isManager && (
        <div className={`text-xs px-2 py-1 rounded-full ${user.role === "ceo" ? "bg-amber-100 text-amber-900" : "bg-purple-100 text-purple-900"}`}>
          {user.role === "ceo" ? "👑 Vista CEO" : "⭐ Vista de equipo"}
        </div>
      )}
    </header>
  );

  // KPIs superiores. Managers (CEO + head_success) ven una batería amplia
  // (8 tarjetas); fisios normales solo los 2 estables. Los cálculos
  // adicionales de "Sin asignar", "Adherencia media", "En riesgo", "Tasa
  // renovación", "Formularios por revisar" y "Llamadas (7d)" se calculan
  // aquí para no arrastrar toda la lógica de finance/adherencia hasta la
  // vista.
  let extraKpisBlock: React.ReactNode = null;
  if (isManager) {
    // Pacientes candidatos para adherencia: activos, no terminados.
    const patientsForAdh = patients.filter((p) => (p as any).onboardingStatus !== "finished");
    const [unassignedList, adhsWithPatient, pendingFormsPool, callsIn7List] = await Promise.all([
      prisma.patient.findMany({
        where: { isTest: false, assignedProfessionalId: null, ...activePatientCondition() },
        select: { id: true, fullName: true, programType: true, subscriptionStartDate: true },
        orderBy: { fullName: "asc" },
      }),
      Promise.all(
        patientsForAdh.map((p) =>
          calculateAdherence(p.id).then((adh) => ({ patient: p, adh })),
        ),
      ),
      // Formularios: SQL cuenta sesiones completadas sin revisar, pero muchas
      // no tienen FORM o el paciente no las rellenó. Filtramos en memoria con
      // hasPendingFormReview para dar el count REAL. Precargamos solo las
      // que tienen respuestas guardadas — sin responses no puede haber FORM
      // rellenado.
      prisma.programSession.findMany({
        where: {
          completedAt: { not: null },
          formReviewedAt: null,
          responses: { not: null },
          assignment: { patient: { isTest: false, ...activePatientCondition() } },
        },
        select: {
          id: true, tasksSnapshot: true, responses: true, completedAt: true,
          assignment: { select: { patient: { select: { id: true, fullName: true } } } },
        },
        orderBy: { completedAt: "desc" },
      }),
      prisma.scheduledCall.findMany({
        where: {
          completedAt: null,
          scheduledAt: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 86_400_000),
          },
          patient: { isTest: false, ...activePatientCondition() },
        },
        select: {
          id: true, type: true, scheduledAt: true,
          patient: { select: { id: true, fullName: true } },
        },
        orderBy: { scheduledAt: "asc" },
      }),
    ]);
    const pendingFormsFiltered = pendingFormsPool.filter(hasPendingFormReview);
    const pendingFormsCount = pendingFormsFiltered.length;
    const validAdhs = adhsWithPatient.filter((x) => x.adh.total > 0);
    const avgAdh = validAdhs.length > 0
      ? Math.round(validAdhs.reduce((acc, x) => acc + x.adh.percentage, 0) / validAdhs.length)
      : null;
    // Helpers de formateo para los detalles
    const fmtDate = (d: Date) => d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    const fmtDateTime = (d: Date) => d.toLocaleDateString("es-ES", { day: "numeric", month: "short" }) +
      " · " + d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    const callTypeLabel = (t: string) => t === "optimizacion" ? "Optimización" : t === "renovacion" ? "Renovación" : t;

    // Renuevan en 30d: reutilizamos withRenewalAll (ya filtrado 0..30 días)
    const renewalsIn30List = withRenewalAll.filter((x) => x.days >= 0 && x.days <= 30);

    // Adherencia media: top 5 mejores y bottom 5 peores para dar contexto
    // sobre por qué el promedio queda como queda.
    const sortedByAdh = [...validAdhs].sort((a, b) => a.adh.percentage - b.adh.percentage);

    // === DETAILS ===
    const detailTotal: KpiDetail = {
      title: "Pacientes totales",
      description: `${patients.length} activos (excluye Prevention, fantasma y terminados).`,
      rows: [...patients]
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
        .map((p) => ({
          href: `/fisio/paciente/${p.id}`,
          title: p.fullName,
          subtitle: p.programType ?? "—",
        })),
    };
    const detailUnassigned: KpiDetail = {
      title: "Sin asignar",
      description: "Pacientes activos sin fisio asignado. Asígnales uno cuanto antes.",
      emptyText: "Todos los pacientes activos tienen fisio. 🎉",
      rows: unassignedList.map((p) => ({
        href: `/fisio/paciente/${p.id}`,
        title: p.fullName,
        subtitle: p.programType ?? "—",
      })),
    };
    const detailRenewals: KpiDetail = {
      title: "Renuevan en 30 días",
      description: "Ordenados por proximidad de vencimiento.",
      emptyText: "Nadie vence en los próximos 30 días.",
      rows: renewalsIn30List.map((x) => ({
        href: `/fisio/paciente/${x.patient.id}`,
        title: x.patient.fullName,
        meta: `en ${x.days}d`,
        metaAccent: x.days <= 7 ? "danger" : x.days <= 14 ? "warning" : null,
      })),
    };
    const detailForms: KpiDetail = {
      title: "Formularios por revisar",
      description: "Sesiones con formulario rellenado por el paciente y sin revisión del fisio.",
      emptyText: "Ningún formulario pendiente. 🎉",
      rows: pendingFormsFiltered.slice(0, 50).map((s: any) => ({
        href: s.assignment?.patient?.id ? `/fisio/paciente/${s.assignment.patient.id}/formularios` : undefined,
        title: s.assignment?.patient?.fullName ?? "Paciente",
        subtitle: s.completedAt ? `Completado ${fmtDate(s.completedAt)}` : undefined,
      })),
    };
    const detailAdherence: KpiDetail = {
      title: "Adherencia media",
      description: `Promedio del ${avgAdh ?? 0}% entre ${validAdhs.length} pacientes con datos. Los 10 con menor adherencia:`,
      rows: sortedByAdh.slice(0, 10).map((x) => ({
        href: `/fisio/paciente/${x.patient.id}`,
        title: x.patient.fullName,
        subtitle: `${x.adh.completed}/${x.adh.total} sesiones`,
        meta: `${x.adh.percentage}%`,
        metaAccent: x.adh.percentage < 30 ? "danger" : x.adh.percentage < 50 ? "warning" : null,
      })),
    };
    const detailRenewalRate: KpiDetail = {
      title: `Tasa de renovación (${periodLabel})`,
      description: teamRenewals.total > 0
        ? `${teamRenewals.renewed}/${teamRenewals.total} renovaron. Detalle por fisio:`
        : "Sin oportunidades de renovación en este período.",
      emptyText: "Sin datos por fisio en este período.",
      rows: perFisio
        .filter((f) => (f.renewed + f.lost) > 0)
        .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1))
        .map((f) => ({
          title: f.fullName,
          subtitle: `${f.renewed} renov · ${f.lost} perd · ${f.renewed + f.lost} decisiones`,
          meta: f.rate !== null ? `${f.rate}%` : "—",
          metaAccent: f.rate !== null && f.rate < 50 ? "danger" : f.rate !== null && f.rate < 70 ? "warning" : null,
        })),
    };
    const detailCalls: KpiDetail = {
      title: "Llamadas próximas (7 días)",
      description: "Ordenadas por fecha.",
      emptyText: "Sin llamadas programadas los próximos 7 días.",
      rows: callsIn7List.map((c) => ({
        href: `/fisio/paciente/${c.patient.id}`,
        title: c.patient.fullName,
        subtitle: callTypeLabel(c.type),
        meta: c.scheduledAt ? fmtDateTime(c.scheduledAt) : "sin fecha",
      })),
    };

    extraKpisBlock = (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
        <DashboardKpiCard label="Pacientes totales" value={patients.length} detail={detailTotal} />
        <DashboardKpiCard label="Sin asignar" value={unassignedList.length} accent={unassignedList.length > 0 ? "warning" : undefined} detail={detailUnassigned} />
        <DashboardKpiCard label="Renuevan en 30d" value={renewalsIn30} accent={renewalsIn30 > 0 ? "warning" : undefined} detail={detailRenewals} />
        <DashboardKpiCard label="Formularios por revisar" value={pendingFormsCount} accent={pendingFormsCount > 0 ? "warning" : undefined} detail={detailForms} />
        <DashboardKpiCard label="Adherencia media" value={avgAdh !== null ? `${avgAdh}%` : "—"} detail={detailAdherence} />
        <DashboardKpiCard label="Tasa renovación" value={teamRenewals.rate !== null ? `${teamRenewals.rate}%` : "—"} detail={detailRenewalRate} />
        <DashboardKpiCard label="Llamadas (7 días)" value={callsIn7List.length} detail={detailCalls} />
      </div>
    );
  }

  const kpis = isManager ? extraKpisBlock : (
    <div className="grid grid-cols-2 gap-2 mb-5 max-w-md">
      <KpiCard label="Mis pacientes" value={patients.length} />
      <KpiCard label="Renuevan en 30d" value={renewalsIn30} accent={renewalsIn30 > 0 ? "warning" : undefined} />
    </div>
  );

  const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const teamBlock = (
    <TeamMetricsBlock
      period={teamPeriod}
      periodLabel={periodLabel}
      from={searchParams.from ?? ""}
      to={searchParams.to ?? ""}
      periodFrom={isoDate(periodStart)}
      periodTo={isoDate(periodEnd)}
      renewals={teamRenewals}
      perFisio={perFisio}
    />
  );

  // === CEO con pestañas (Ventas + Métricas equipo + Finanzas) ===
  if (user.role === "ceo") {
    const { start, end, label } = getPeriodRange("month");
    const financeSummary = await calculateFinanceSummary(start, end);

    // Métricas de venta (período seleccionable)
    const { calculateSalesMetrics, calculateSalesByCloser, calculateLeadOriginMetrics } = await import("@/lib/sales");
    const { SalesMetricsBlock } = await import("@/components/SalesMetricsBlock");
    const { LeadOriginBlock } = await import("@/components/LeadOriginBlock");

    const salesCustomRange = parseCustomRange(searchParams.salesFrom, searchParams.salesTo);
    const salesPeriod: any = salesCustomRange
      ? "custom"
      : (["month", "quarter", "year"].includes(searchParams.salesPeriod ?? "")
        ? searchParams.salesPeriod
        : "month");

    let salesStart: Date, salesEnd: Date, salesLabel: string;
    if (salesCustomRange) {
      salesStart = salesCustomRange.start;
      salesEnd = salesCustomRange.end;
      const fmt = (d: Date) => d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
      salesLabel = `${fmt(salesStart)} → ${fmt(salesEnd)}`;
    } else {
      const r = getPeriodRange(salesPeriod);
      salesStart = r.start; salesEnd = r.end; salesLabel = r.label;
    }

    const salesGlobal = await calculateSalesMetrics(salesStart, salesEnd);
    const salesByCloser = await calculateSalesByCloser(salesStart, salesEnd);
    const originMetrics = await calculateLeadOriginMetrics(salesStart, salesEnd);

    // Métricas de FisioFit Prevention (MRR, activos, trials, churn) — usan el
    // mismo período seleccionado que "Métricas equipo" para coherencia.
    const preventionMetrics = await calculatePreventionMetrics(periodStart, periodEnd, periodLabel);

    const salesBlock = (
      <>
        <SalesMetricsBlock
          period={salesPeriod}
          periodLabel={salesLabel}
          from={searchParams.salesFrom ?? ""}
          to={searchParams.salesTo ?? ""}
          metrics={salesGlobal}
          perCloser={salesByCloser}
          title="Métricas de venta — Equipo"
        />
        <LeadOriginBlock metrics={originMetrics} periodLabel={salesLabel} />
      </>
    );

    return (
      <main>
        {headerContent}
        {kpis}
        <div className="mb-4 flex justify-end">
          <Link
            href="/fisio/informe-ceo"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-colors"
          >
            <span>🧠</span>
            <span>Informe CEO</span>
          </Link>
        </div>
        <CEOPanelTabs
          teamBlock={teamBlock}
          salesBlock={salesBlock}
          preventionBlock={<PreventionMetricsBlock metrics={preventionMetrics} />}
          finance={{ ...financeSummary, periodLabel: label }}
          userFullName={user.fullName}
        />
      </main>
    );
  }

  // === Resto (Head + fisios) ===
  // El panel se divide en 2 sub-pestañas dentro de FisioPanelTabs:
  //   "📋 Tareas"            → board semanal + tareas puntuales
  //   "👥 Gestión de pacientes" → programas, cargas, renovaciones, formularios,
  //                              llamadas
  // Más las pestañas externas Métricas equipo (head_success) y salario.
  const tareasContent = (
    <div className="space-y-3">
      {weeklyBoard && (
        <WeeklyTeamTasksBoard
          board={weeklyBoard}
          role={user.role as "fisio" | "head_success"}
          mode="self"
        />
      )}
      {adHocTasks.length > 0 && <AdHocTasksCard tasks={adHocTasks} />}
      {!weeklyBoard && adHocTasks.length === 0 && (
        <p className="text-sm text-neutral-400 italic text-center py-12">
          No hay tareas configuradas para tu rol.
        </p>
      )}
    </div>
  );

  const gestionContent = (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
        <ProgramEndingsBox initialItems={programEndings} />
        <LoadReviewsBox initialItems={loadReviews} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <section className="card">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-medium text-sm">Renovaciones próximas</h2>
            <Link href="/fisio/pacientes" className="text-xs text-neutral-500 hover:text-neutral-900">Ver todos →</Link>
          </div>
          {withRenewal.length === 0 ? (
            <p className="text-xs text-neutral-400 py-4 text-center">Sin renovaciones programadas</p>
          ) : (
            <div className="divide-y divide-neutral-100">
              {withRenewal.map(({ patient, days }) => (
                <Link
                  key={patient.id}
                  href={`/fisio/paciente/${patient.id}/ficha`}
                  className="flex justify-between items-center py-2 text-sm hover:bg-neutral-50 -mx-2 px-2 rounded"
                >
                  <span>{patient.fullName}</span>
                  <span className={`text-xs ${
                    days! < 0 ? "text-red-600" : days! <= 15 ? "text-amber-700" : days! <= 30 ? "text-neutral-700" : "text-neutral-400"
                  }`}>
                    {days! < 0 ? `vencida hace ${-days!} días` : days! === 0 ? "hoy" : `en ${days} días`}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

{/* "Tareas pendientes" (FisioTask) se quitó del panel — se sustituyó por
            WeeklyTeamTasksBoard arriba. La página /fisio/tareas mantiene la
            antigua lista para FisioTask por compat, pero no se enseña aquí. */}

        <section className="card">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-medium text-sm">Formularios por revisar</h2>
            <Link href="/fisio/formularios-pendientes" className="text-xs text-neutral-500 hover:text-neutral-900">Ver todos →</Link>
          </div>
          {pendingForms.length === 0 ? (
            <p className="text-xs text-neutral-400 py-4 text-center">No hay formularios pendientes</p>
          ) : (
            <div className="divide-y divide-neutral-100">
              {pendingForms.map((s) => {
                const tasks = JSON.parse(s.tasksSnapshot) as any[];
                const formTitle = tasks.find((t) => t.type === "FORM")?.title ?? "Formulario";
                return (
                  <div key={s.id} className="py-2 flex items-center justify-between gap-2 -mx-2 px-2 rounded hover:bg-neutral-50">
                    <Link
                      href={`/fisio/paciente/${s.assignment.patientId}/formularios`}
                      className="flex-1 min-w-0 text-sm"
                    >
                      <div className="font-medium truncate">{s.assignment.patient.fullName}</div>
                      <div className="text-xs text-neutral-500 mt-0.5 truncate">
                        {formTitle} · {s.completedAt && formatDateRelative(s.completedAt)}
                      </div>
                    </Link>
                    <form action={markFormReviewed.bind(null, s.id)} className="flex-shrink-0">
                      <button
                        type="submit"
                        className="text-[11px] font-medium px-2 py-1 rounded border border-neutral-300 bg-white hover:bg-neutral-100"
                        title="Marcar como revisado"
                      >
                        ✓ Revisado
                      </button>
                    </form>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="card">
          <div className="flex justify-between items-center mb-3 gap-3 flex-wrap">
            <h2 className="font-medium text-sm">Próximas llamadas</h2>
            <div className="flex items-center gap-3">
              <RegenerateCallsButton />
              <Link href="/fisio/llamadas" className="text-xs text-neutral-500 hover:text-neutral-900">Ver todas →</Link>
            </div>
          </div>
          {calls.length === 0 ? (
            <p className="text-xs text-neutral-400 py-4 text-center">Sin llamadas programadas</p>
          ) : (
            <div className="divide-y divide-neutral-100">
              {calls.map((c) => (
                <div key={c.id} className="py-2 text-sm">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="font-medium">{c.patient.fullName}</span>
                      <WhatsAppButton url={c.patient.whatsappGroupUrl} />
                    </div>
                    <span className="text-xs text-neutral-500 flex-shrink-0">
                      {formatCallDate(c.scheduledAt)}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    {TYPE_LABELS[c.type] ?? c.type}
                    {c.notes && ` · ${c.notes}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );

  return (
    <main>
      {headerContent}
      {kpis}
      <FisioPanelTabs
        tareasContent={tareasContent}
        gestionContent={gestionContent}
        teamBlock={isManager ? teamBlock : null}
        professionalId={user.id}
      />
    </main>
  );
}

type PerFisio = {
  id: string;
  fullName: string;
  role: string;
  patientsCount: number;
  renewed: number;
  lost: number;
  rate: number | null;
  adherence: number | null;
};

function KpiCard({ label, value, accent }: { label: string; value: number | string; accent?: "warning" | "info" | "danger" }) {
  const accentClass =
    accent === "warning" ? "text-amber-700"
    : accent === "danger" ? "text-red-600"
    : accent === "info" ? "text-neutral-900"
    : "text-neutral-900";
  return (
    <div className="bg-neutral-50 rounded-lg p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${accentClass}`}>{value}</div>
    </div>
  );
}

function daysFromNow(d: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

function formatDueDate(d: Date): string {
  const days = daysFromNow(d);
  if (days < 0) return `vencida hace ${-days}d`;
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  if (days < 7) return `en ${days}d`;
  return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function formatDateRelative(d: Date): string {
  const days = -daysFromNow(d);
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function formatCallDate(d: Date | null): string {
  if (!d) return "Pendiente de agendar";
  const days = daysFromNow(d);
  const time = new Date(d).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  if (days === 0) return `Hoy ${time}`;
  if (days === 1) return `Mañana ${time}`;
  if (days < 7) return `${new Date(d).toLocaleDateString("es-ES", { weekday: "short" })} ${time}`;
  return `${new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} ${time}`;
}

async function renderCloserPanel(
  user: { id: string; fullName: string },
  searchParams: { salesPeriod?: string; salesFrom?: string; salesTo?: string }
) {
  const { calculateSalesMetrics } = await import("@/lib/sales");
  const { SalesMetricsBlock } = await import("@/components/SalesMetricsBlock");
  const { FisioPanelTabs } = await import("@/components/FisioPanelTabs");

  const customRange = parseCustomRange(searchParams.salesFrom, searchParams.salesTo);
  const salesPeriod: any = customRange
    ? "custom"
    : (["month", "quarter", "year"].includes(searchParams.salesPeriod ?? "")
      ? searchParams.salesPeriod
      : "month");

  let pStart: Date, pEnd: Date, pLabel: string;
  if (customRange) {
    pStart = customRange.start; pEnd = customRange.end;
    const fmt = (d: Date) => d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
    pLabel = `${fmt(pStart)} → ${fmt(pEnd)}`;
  } else {
    const r = getPeriodRange(salesPeriod);
    pStart = r.start; pEnd = r.end; pLabel = r.label;
  }

  const metrics = await calculateSalesMetrics(pStart, pEnd, user.id);

  // Ventas atribuidas al closer con IMPORTE CONTRATADO (no cobrado).
  // Un fraccionado a 4 cuotas de 366€ cuenta como 1464€, no 366€.
  // Prevention cae al PatientSubscription.amountCents (primera cobro).
  const { getCloserSalesInPeriod, sumContracted } = await import("@/lib/closer-sales");
  const closerSales = await getCloserSalesInPeriod(user.id, pStart, pEnd);
  const contratado = sumContracted(closerSales);
  const ticketMedio = closerSales.length > 0 ? Math.round(contratado / closerSales.length) : null;

  const ventas = closerSales.map((r) => ({
    leadId: r.leadId,
    key: r.key,
    leadName: r.patientName,
    patient: r.patientId ? { id: r.patientId, fullName: r.patientName, programType: r.programType } : null,
    amount: r.contractedAmount,
    saleType: r.saleType,
    decidedAt: r.decidedAt,
  }));

  const commission = Math.round(contratado * 0.10);
  const eur = (n: number) => `${n.toLocaleString("es-ES", { maximumFractionDigits: 0 })} €`;

  // Tareas puntuales del closer
  const adHocTasks = await buildAdHocActiveForProfessional(user.id, "closer");

  const panelContent = (
    <>
      {adHocTasks.length > 0 && (
        <div className="mb-5">
          <AdHocTasksCard tasks={adHocTasks} />
        </div>
      )}

      <SalesMetricsBlock
        period={salesPeriod}
        periodLabel={pLabel}
        from={searchParams.salesFrom ?? ""}
        to={searchParams.salesTo ?? ""}
        metrics={metrics}
        title="Tus métricas de venta"
        showProgramBreakdown={false}
      />

      {/* Cuadros de ventas / facturación / comisión */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <div className="rounded-xl p-4 border border-emerald-200" style={{ background: "#ECFDF5" }}>
          <div className="text-xs uppercase text-emerald-700 font-medium">Ventas</div>
          <div className="text-3xl font-bold text-emerald-800 mt-1">{metrics.won}</div>
          <div className="text-xs text-emerald-700 mt-0.5">cerradas en el período</div>
        </div>
        <div className="rounded-xl p-4 border border-neutral-200" style={{ background: "#FAFAFA" }}>
          <div className="text-xs uppercase text-neutral-600 font-medium">Contratado</div>
          <div className="text-3xl font-bold text-neutral-900 mt-1">{eur(contratado)}</div>
          <div className="text-xs text-neutral-600 mt-0.5">
            Ticket medio: {ticketMedio !== null ? eur(ticketMedio) : "—"}
          </div>
        </div>
        <div className="rounded-xl p-4 border border-blue-200" style={{ background: "#EFF6FF" }}>
          <div className="text-xs uppercase text-blue-700 font-medium">Tu comisión (10%)</div>
          <div className="text-3xl font-bold text-blue-800 mt-1">{eur(commission)}</div>
          <div className="text-xs text-blue-700 mt-0.5">sobre importe contratado</div>
        </div>
      </div>

      {/* Lista de ventas del período */}
      <section className="card">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h2 className="font-medium text-sm">Ventas realizadas</h2>
            <p className="text-xs text-neutral-500">{ventas.length} en el período</p>
          </div>
        </div>

        {ventas.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-8 italic">
            No has cerrado ventas en este período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-neutral-500 uppercase border-b border-neutral-200">
                  <th className="text-left py-2 px-2 font-medium">Paciente</th>
                  <th className="text-left py-2 px-2 font-medium">Programa</th>
                  <th className="text-right py-2 px-2 font-medium">Fecha</th>
                  <th className="text-right py-2 px-2 font-medium">Precio</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map((v) => (
                  <tr key={v.key} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="py-2 px-2">
                      {v.patient ? (
                        <Link href={`/fisio/paciente/${v.patient.id}`} className="font-medium hover:underline">
                          {v.patient.fullName}
                        </Link>
                      ) : (
                        <span>{v.leadName}</span>
                      )}
                      {v.saleType === "installment" && (
                        <span className="ml-2 text-[9px] uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium">Fraccionado</span>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {v.patient?.programType ? (
                        <span className="text-[10px] uppercase bg-neutral-100 text-neutral-700 border border-neutral-300 px-2 py-0.5 rounded-full font-medium">
                          {v.patient.programType}
                        </span>
                      ) : (
                        <span className="text-neutral-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="text-right py-2 px-2 text-xs text-neutral-500 whitespace-nowrap">
                      {v.decidedAt && new Date(v.decidedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                    </td>
                    <td className="text-right py-2 px-2 font-medium text-emerald-700 tabular-nums">
                      {v.amount > 0 ? eur(v.amount) : <span className="text-neutral-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );

  return (
    <main>
      <header className="mb-5">
        <h1 className="text-xl font-semibold">Panel de control</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Hola {user.fullName.split(" ")[0]} · {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </header>
      <FisioPanelTabs panel={panelContent} professionalId={user.id} />
    </main>
  );
}

// ============================================================================
// SETTER (Niki): panel propio con métricas de llamadas + IA vs setter + tareas
// ============================================================================
async function renderSetterPanel(
  user: { id: string; fullName: string },
  searchParams: { salesPeriod?: string; salesFrom?: string; salesTo?: string }
) {
  const { calculateLeadOriginMetrics } = await import("@/lib/sales");
  const { LeadOriginBlock } = await import("@/components/LeadOriginBlock");

  const customRange = parseCustomRange(searchParams.salesFrom, searchParams.salesTo);
  const salesPeriod: any = customRange
    ? "custom"
    : (["month", "quarter", "year"].includes(searchParams.salesPeriod ?? "")
      ? searchParams.salesPeriod
      : "month");

  let pStart: Date, pEnd: Date, pLabel: string;
  if (customRange) {
    pStart = customRange.start; pEnd = customRange.end;
    const fmt = (d: Date) => d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
    pLabel = `${fmt(pStart)} → ${fmt(pEnd)}`;
  } else {
    const r = getPeriodRange(salesPeriod);
    pStart = r.start; pEnd = r.end; pLabel = r.label;
  }

  // Métricas de llamadas del período (todas las leads con cita en el rango)
  const leadsInPeriod = await prisma.lead.findMany({
    where: { callScheduledAt: { gte: pStart, lte: pEnd } },
    select: { status: true },
  });
  const callsScheduled = leadsInPeriod.length;
  const callsDone = leadsInPeriod.filter((l) => l.status === "won" || l.status === "lost").length;
  const callsNoShow = leadsInPeriod.filter((l) => l.status === "no_show").length;
  const showBase = callsDone + callsNoShow;
  const showRate = showBase > 0 ? Math.round((callsDone / showBase) * 100) : null;

  // IA vs Setter (origen de los leads en el período)
  const originMetrics = await calculateLeadOriginMetrics(pStart, pEnd);

  // Tareas puntuales del setter
  const adHocTasks = await buildAdHocActiveForProfessional(user.id, "setter");

  const panelContent = (
    <>
      {adHocTasks.length > 0 && (
        <div className="mb-5">
          <AdHocTasksCard tasks={adHocTasks} />
        </div>
      )}

      {/* KPIs de llamadas del período */}
      <section className="card mb-5">
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-medium text-sm">Llamadas del período</h2>
          <span className="text-xs text-neutral-500 capitalize">{pLabel}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl p-4 border border-neutral-200 bg-neutral-50">
            <div className="text-xs uppercase text-neutral-600 font-medium">Agendadas</div>
            <div className="text-3xl font-bold text-neutral-900 mt-1 tabular-nums">{callsScheduled}</div>
            <div className="text-xs text-neutral-600 mt-0.5">leads con cita en el periodo</div>
          </div>
          <div className="rounded-xl p-4 border border-blue-200" style={{ background: "#EFF6FF" }}>
            <div className="text-xs uppercase text-blue-700 font-medium">Realizadas</div>
            <div className="text-3xl font-bold text-blue-800 mt-1 tabular-nums">{callsDone}</div>
            <div className="text-xs text-blue-700 mt-0.5">won o lost (sí asistió)</div>
          </div>
          <div
            className="rounded-xl p-4 border"
            style={{
              background: showRate !== null && showRate >= 70 ? "#ECFDF5" : showRate !== null && showRate < 50 ? "#FEF2F2" : "#FAFAFA",
              borderColor: showRate !== null && showRate >= 70 ? "#A7F3D0" : showRate !== null && showRate < 50 ? "#FECACA" : "#E5E5E5",
            }}
          >
            <div className="text-xs uppercase font-medium" style={{ color: showRate !== null && showRate >= 70 ? "#047857" : showRate !== null && showRate < 50 ? "#B91C1C" : "#525252" }}>
              Show rate
            </div>
            <div className="text-3xl font-bold mt-1 tabular-nums" style={{ color: showRate !== null && showRate >= 70 ? "#065F46" : showRate !== null && showRate < 50 ? "#7F1D1D" : "#171717" }}>
              {showRate !== null ? `${showRate}%` : "—"}
            </div>
            <div className="text-xs mt-0.5" style={{ color: showRate !== null && showRate >= 70 ? "#047857" : showRate !== null && showRate < 50 ? "#B91C1C" : "#525252" }}>
              {callsNoShow > 0 ? `${callsNoShow} no_show · base ${showBase}` : "sin no_shows aún"}
            </div>
          </div>
        </div>
      </section>

      {/* IA vs Setter */}
      <LeadOriginBlock metrics={originMetrics} periodLabel={pLabel} />
    </>
  );

  return (
    <main>
      <header className="mb-5">
        <h1 className="text-xl font-semibold">Panel de Niki</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Hola {user.fullName.split(" ")[0]} · {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </header>
      {panelContent}
    </main>
  );
}
