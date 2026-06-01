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

  // Setter va directo a su lista de leads agendados
  if (user.role === "setter") {
    redirect("/fisio/leads");
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

  const patientWhere = isManager ? {} : { assignedProfessionalId: user.id };
  const patients = await prisma.patient.findMany({ where: patientWhere, orderBy: { fullName: "asc" } });

  const taskWhere: any = { completedAt: null };
  if (!isManager) {
    taskWhere.OR = [
      { assignedToProfessionalId: user.id },
      { source: "own", assignedToProfessionalId: null },
    ];
  }
  const tasks = await prisma.fisioTask.findMany({
    where: taskWhere,
    include: { patient: true },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    take: 5,
  });

  const callWhere = isManager
    ? { completedAt: null, scheduledAt: { gte: new Date() } }
    : { completedAt: null, scheduledAt: { gte: new Date() }, patient: { assignedProfessionalId: user.id } };
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
      ...(isManager ? {} : { assignment: { patient: { assignedProfessionalId: user.id } } }),
    },
    include: { assignment: { include: { patient: true, program: true } } },
    orderBy: { completedAt: "desc" },
    take: 5,
  });
  const pendingForms = pendingFormSessions.filter((s) => {
    const tasks = JSON.parse(s.tasksSnapshot) as any[];
    return tasks.some((t) => t.type === "FORM");
  });

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
          where: { assignedProfessionalId: f.id },
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

  const kpis = (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
      <KpiCard label={isManager ? "Pacientes totales" : "Mis pacientes"} value={patients.length} />
      <KpiCard label="Renuevan en 30d" value={renewalsIn30} accent={renewalsIn30 > 0 ? "warning" : undefined} />
      <KpiCard label="Tareas pendientes" value={tasks.length} accent={tasks.length > 0 ? "info" : undefined} />
      <KpiCard label="Formularios por revisar" value={pendingForms.length} accent={pendingForms.length > 0 ? "info" : undefined} />
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
          finance={{ ...financeSummary, periodLabel: label }}
        />
      </main>
    );
  }

  // === Resto (Head + fisios) ===
  // El bloque teamBlock vivía dentro del panel principal cuando el usuario era
  // manager. Ahora lo sacamos a una pestaña dedicada "Métricas equipo" para
  // que el head_success use el panel principal solo para su trabajo con
  // pacientes (programas a terminar, cargas, formularios, etc.).
  const panelContent = (
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

        <section className="card">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-medium text-sm">Tareas pendientes</h2>
            <Link href="/fisio/tareas" className="text-xs text-neutral-500 hover:text-neutral-900">Ver todas →</Link>
          </div>
          {tasks.length === 0 ? (
            <p className="text-xs text-neutral-400 py-4 text-center">No hay tareas pendientes</p>
          ) : (
            <div className="divide-y divide-neutral-100">
              {tasks.map((t) => (
                <div key={t.id} className="py-2 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-neutral-300 mt-0.5">☐</span>
                    <div className="flex-1 min-w-0">
                      <div>{t.title}</div>
                      <div className="text-xs text-neutral-500 mt-0.5 flex gap-2">
                        {t.patient && <span>· {t.patient.fullName}</span>}
                        {t.dueDate && (
                          <span className={daysFromNow(t.dueDate) < 0 ? "text-red-600" : daysFromNow(t.dueDate) <= 1 ? "text-amber-700" : ""}>
                            {formatDueDate(t.dueDate)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

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
        panel={panelContent}
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

  const panelContent = (
    <>
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
