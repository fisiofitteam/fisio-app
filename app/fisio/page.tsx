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
  const callWhere: any = isManager
    ? { completedAt: null, scheduledAt: { gte: new Date() }, patient: { isTest: false } }
    : { completedAt: null, scheduledAt: { gte: new Date() }, patient: { isTest: false, assignedProfessionalId: user.id } };
  const calls = await prisma.scheduledCall.findMany({
    where: callWhere,
    include: { patient: true },
    orderBy: { scheduledAt: "asc" },
    take: 5,
  });

  const pendingFormSessions = await prisma.programSession.findMany({
    where: {
      completedAt: { not: null },
      formReviewedAt: null,
      // Fuera formularios de pacientes fantasma (isTest).
      assignment: isManager
        ? { patient: { isTest: false } }
        : { patient: { isTest: false, assignedProfessionalId: user.id } },
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

  const withRenewal = patients
    .map((p) => ({ patient: p, days: daysUntilRenewal(p.subscriptionStartDate, p.subscriptionPeriodMonths) }))
    .filter((x) => x.days !== null)
    .sort((a, b) => (a.days! - b.days!))
    .slice(0, 5);
  const renewalsIn30 = withRenewal.filter((x) => x.days !== null && x.days <= 30).length;

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

  // Métricas para managers en el período seleccionado
  let teamRenewals = { renewed: 0, lost: 0, total: 0, rate: null as number | null };
  let perFisio: PerFisio[] = [];
  if (isManager) {
    const periodRenewals = await prisma.subscriptionRenewal.findMany({
      where: { decidedAt: { gte: periodStart, lte: periodEnd } },
      include: { patient: true },
    });
    const tr = periodRenewals.filter((r) => r.outcome === "renewed").length;
    const tl = periodRenewals.filter((r) => r.outcome === "lost").length;
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
        const fisioRenewals = periodRenewals.filter((r) => myPatientIds.includes(r.patientId));
        const fr = fisioRenewals.filter((r) => r.outcome === "renewed").length;
        const fl = fisioRenewals.filter((r) => r.outcome === "lost").length;
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

  // Solo dejamos los 2 KPIs estables (pacientes y renovaciones). Las tarjetas
  // de "Tareas pendientes" y "Formularios por revisar" se quitaron porque ya
  // tienen su propia sección detallada más abajo y duplicaban información.
  const kpis = (
    <div className="grid grid-cols-2 gap-2 mb-5 max-w-md">
      <KpiCard label={isManager ? "Pacientes totales" : "Mis pacientes"} value={patients.length} />
      <KpiCard label="Renuevan en 30d" value={renewalsIn30} accent={renewalsIn30 > 0 ? "warning" : undefined} />
    </div>
  );

  const teamBlock = (
    <TeamMetricsBlock
      period={teamPeriod}
      periodLabel={periodLabel}
      from={searchParams.from ?? ""}
      to={searchParams.to ?? ""}
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
                  <Link
                    key={s.id}
                    href={`/fisio/paciente/${s.assignment.patientId}/calendario`}
                    className="block py-2 text-sm hover:bg-neutral-50 -mx-2 px-2 rounded"
                  >
                    <div className="font-medium">{s.assignment.patient.fullName}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">
                      {formTitle} · {s.completedAt && formatDateRelative(s.completedAt)}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="card">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-medium text-sm">Próximas llamadas</h2>
            <Link href="/fisio/llamadas" className="text-xs text-neutral-500 hover:text-neutral-900">Ver todas →</Link>
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

function KpiCard({ label, value, accent }: { label: string; value: number; accent?: "warning" | "info" }) {
  const accentClass =
    accent === "warning" ? "text-amber-700"
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

function formatCallDate(d: Date): string {
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

  // Ventas realizadas en el período (con paciente y precio)
  const wonLeads = await prisma.lead.findMany({
    where: {
      closerId: user.id,
      status: "won",
      decidedAt: { gte: pStart, lte: pEnd },
    },
    include: {
      convertedPatient: {
        select: { id: true, fullName: true, programType: true },
      },
    },
    orderBy: { decidedAt: "desc" },
  });

  // Buscar transacciones income_new asociadas
  const patientIds = wonLeads.map((l) => l.convertedPatient?.id).filter(Boolean) as string[];
  const txs = patientIds.length > 0 ? await prisma.transaction.findMany({
    where: { type: "income_new", patientId: { in: patientIds } },
  }) : [];
  const txByPatient = new Map<string, number>();
  for (const t of txs) {
    if (t.patientId) txByPatient.set(t.patientId, (txByPatient.get(t.patientId) ?? 0) + t.amount);
  }

  const ventas = wonLeads.map((l) => ({
    leadId: l.id,
    leadName: l.fullName,
    patient: l.convertedPatient,
    amount: l.convertedPatient ? (txByPatient.get(l.convertedPatient.id) ?? 0) : 0,
    decidedAt: l.decidedAt,
  }));

  const commission = Math.round(metrics.revenue * 0.10);
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
          <div className="text-xs uppercase text-neutral-600 font-medium">Facturación</div>
          <div className="text-3xl font-bold text-neutral-900 mt-1">{eur(metrics.revenue)}</div>
          <div className="text-xs text-neutral-600 mt-0.5">
            Ticket medio: {metrics.ticketAvg !== null ? eur(metrics.ticketAvg) : "—"}
          </div>
        </div>
        <div className="rounded-xl p-4 border border-blue-200" style={{ background: "#EFF6FF" }}>
          <div className="text-xs uppercase text-blue-700 font-medium">Tu comisión (10%)</div>
          <div className="text-3xl font-bold text-blue-800 mt-1">{eur(commission)}</div>
          <div className="text-xs text-blue-700 mt-0.5">según facturación cobrada</div>
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
                  <tr key={v.leadId} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="py-2 px-2">
                      {v.patient ? (
                        <Link href={`/fisio/paciente/${v.patient.id}`} className="font-medium hover:underline">
                          {v.patient.fullName}
                        </Link>
                      ) : (
                        <span>{v.leadName}</span>
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
