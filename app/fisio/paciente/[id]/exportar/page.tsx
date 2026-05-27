import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getOnboardingConfig } from "@/lib/onboarding-config";
import { PrintToolbar } from "@/components/PrintToolbar";

export const dynamic = "force-dynamic";

// ── Helpers de formato ───────────────────────────────────────────────────────
function fDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}
function fDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const x = new Date(d);
  return x.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) +
    " · " + x.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}
function eur(n: number): string {
  return n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}
const STATE_LABEL: Record<string, string> = { OK: "Permitido", CONDITIONAL: "Condicionado", BLOCKED: "Bloqueado" };
const TX_LABEL: Record<string, string> = {
  income_new: "Alta nueva", income_renewal: "Renovación", income_other: "Otro ingreso", expense: "Gasto",
};

export default async function PatientExportPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { solo?: string };
}) {
  const user = await getActiveProfessional();
  if (!user) redirect("/");

  const scope = searchParams.solo === "formularios" ? "forms" : "all";

  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    include: { appliedLevel: { include: { profile: true } } },
  });
  if (!patient) notFound();
  if (!user.isManager && patient.assignedProfessionalId !== user.id) redirect("/fisio/pacientes");

  // Profesional asignado (nombre)
  const assignedPro = patient.assignedProfessionalId
    ? await prisma.professional.findUnique({ where: { id: patient.assignedProfessionalId }, select: { fullName: true } })
    : null;

  // ── Valoración inicial (anamnesis) ──
  let anamnesis: Record<string, any> = {};
  try { anamnesis = patient.anamnesisData ? JSON.parse(patient.anamnesisData) : {}; } catch { anamnesis = {}; }
  const hasAnamnesis = Object.values(anamnesis).some((v) => v != null && String(v).trim() !== "");
  const { anamnesisSteps } = await getOnboardingConfig();

  // ── Programas, sesiones y formularios de sesión (siempre, para extraer forms) ──
  const assignments = await prisma.programAssignment.findMany({
    where: { patientId: params.id },
    include: { program: true, sessions: { orderBy: { scheduledDate: "asc" } } },
    orderBy: { startDate: "desc" },
  });

  const formSessions = assignments
    .flatMap((a) => a.sessions.map((s) => ({ s, programName: a.program.name })))
    .filter(({ s }) => s.completedAt)
    .map(({ s, programName }) => {
      const tasks = JSON.parse(s.tasksSnapshot) as any[];
      const responses = s.responses ? JSON.parse(s.responses) : {};
      const formTask = tasks.find((t) => t.type === "FORM" && responses[t.id]);
      if (!formTask) return null;
      return {
        sessionId: s.id,
        completedAt: s.completedAt,
        formReviewedAt: s.formReviewedAt,
        programName,
        formTitle: formTask.title,
        questions: formTask.questions ? JSON.parse(formTask.questions) : [],
        responses: responses[formTask.id],
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()) as any[];

  // ── Datos solo necesarios para el informe completo ──
  let adaptations: any[] = [], wodLogs: any[] = [], metrics: any[] = [];
  let sale: any = null, renewals: any[] = [], pauses: any[] = [], transactions: any[] = [], clinicalCase: any = null;
  let lifetimeValue = 0;

  if (scope === "all") {
    [adaptations, wodLogs, metrics, sale, renewals, pauses, transactions, clinicalCase] = await Promise.all([
      prisma.patientAdaptation.findMany({
        where: { patientId: params.id, state: { not: "OK" } },
        include: { movement: { include: { category: true } } },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.wodLog.findMany({ where: { patientId: params.id }, orderBy: { submittedAt: "desc" }, take: 30 }),
      prisma.patientMetric.findMany({
        where: { patientId: params.id, isVisible: true },
        include: { entries: { orderBy: { recordedAt: "asc" } } },
        orderBy: [{ isPreset: "desc" }, { order: "asc" }],
      }),
      prisma.sale.findFirst({ where: { patientId: params.id, status: "paid" }, orderBy: { paidAt: "desc" }, include: { closer: { select: { fullName: true } } } }),
      prisma.subscriptionRenewal.findMany({ where: { patientId: params.id }, orderBy: { decidedAt: "asc" } }),
      prisma.programPause.findMany({ where: { patientId: params.id }, orderBy: { startDate: "asc" } }),
      prisma.transaction.findMany({ where: { patientId: params.id }, orderBy: { occurredAt: "desc" } }),
      prisma.clinicalSessionCase.findUnique({ where: { patientId: params.id } }),
    ]);
    lifetimeValue = transactions.filter((t) => t.type.startsWith("income")).reduce((s, t) => s + t.amount, 0);
  }

  const all = scope === "all";
  const showMoney = user.role === "ceo"; // info financiera solo para el CEO
  const showDifficulty = user.isManager; // dificultad solo para managers
  const exportedAt = fDateTime(new Date());

  return (
    <>
      <style>{`
        @media print {
          @page { margin: 12mm; size: A4; }
          .print-toolbar { display: none !important; }
          html, body { background: #fff !important; }
          body * { visibility: hidden !important; }
          #patient-export, #patient-export * { visibility: visible !important; }
          #patient-export { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; box-shadow: none !important; }
          .pe-section { break-inside: avoid; }
          .pe-row { break-inside: avoid; }
        }
      `}</style>

      <PrintToolbar title={`Informe — ${patient.fullName}`} />

      <div id="patient-export" className="max-w-3xl mx-auto bg-white text-neutral-900 px-6 sm:px-10 py-2 pb-16 text-[13px] leading-relaxed">
        {/* ── Cabecera ── */}
        <header className="pe-section border-b-2 border-neutral-900 pb-3 mb-6">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold">{patient.fullName}</h1>
              <p className="text-neutral-600 mt-1">
                {[patient.programType, showDifficulty ? patient.difficulty : null, patient.diagnosis].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
            <div className="text-xs text-neutral-500 text-right">
              <div className="font-medium text-neutral-700">FisioFit Team</div>
              <div>{all ? "Informe completo del paciente" : "Formularios del paciente"}</div>
              <div>Generado: {exportedAt}</div>
              {assignedPro && <div>Fisio: {assignedPro.fullName}</div>}
            </div>
          </div>
        </header>

        {all && (
          <>
            <Section title="Ficha clínica">
              <Grid>
                <Field label="Deporte" value={patient.sport} />
                <Field label="Diagnóstico" value={patient.diagnosis} />
                <Field label="Zona corporal" value={patient.bodyZone} />
                <Field label="Programa" value={patient.programType} />
                {showDifficulty && <Field label="Dificultad" value={patient.difficulty} />}
                <Field label="Modo de programa" value={patient.programMode === "rolling" ? "Rolling" : "Fijo"} />
                {patient.appliedLevel && (
                  <Field label="Perfil clínico aplicado" value={`${patient.appliedLevel.profile.name} · ${patient.appliedLevel.name}`} />
                )}
                <Field label="Alta en plataforma" value={fDate(patient.startedAt)} />
              </Grid>
            </Section>

            <Section title="Suscripción">
              <Grid>
                <Field label="Inicio de suscripción" value={fDate(patient.subscriptionStartDate)} />
                <Field label="Periodo contratado" value={`${patient.subscriptionPeriodMonths} meses`} />
                <Field label="Meses totales acumulados" value={`${patient.subscriptionTotalMonths} meses`} />
                {showMoney && <Field label="Valor de vida (LTV)" value={eur(lifetimeValue)} />}
                {showMoney && sale && <Field label="Venta inicial" value={`${eur(sale.amountCents / 100)} · ${fDate(sale.paidAt)}${sale.closer ? ` · ${sale.closer.fullName}` : ""}`} />}
              </Grid>

              {renewals.length > 0 && (
                <>
                  <Sub>Fases / renovaciones</Sub>
                  <Table head={showMoney ? ["Periodo", "Meses", "Estado", "Importe", "Fecha"] : ["Periodo", "Meses", "Estado", "Fecha"]}
                    rows={renewals.map((r) => showMoney
                      ? [r.programType ?? "—", String(r.periodMonths), r.status, r.amountPaid != null ? eur(r.amountPaid) : "—", fDate(r.decidedAt)]
                      : [r.programType ?? "—", String(r.periodMonths), r.status, fDate(r.decidedAt)])} />
                </>
              )}
              {pauses.length > 0 && (
                <>
                  <Sub>Pausas</Sub>
                  <Table head={["Inicio", "Fin", "Motivo", "Días extendidos", "Estado"]}
                    rows={pauses.map((p) => [fDate(p.startDate), fDate(p.actualEndDate ?? p.endDate), p.reason ?? "—", String(p.daysExtended), p.status])} />
                </>
              )}
              {showMoney && transactions.length > 0 && (
                <>
                  <Sub>Movimientos económicos</Sub>
                  <Table head={["Fecha", "Tipo", "Concepto", "Importe"]}
                    rows={transactions.map((t) => [fDate(t.occurredAt), TX_LABEL[t.type] ?? t.type, t.description ?? t.category ?? "—", (t.type === "expense" ? "-" : "") + eur(t.amount)])} />
                </>
              )}
            </Section>

            <Section title="Control de cargas">
              {adaptations.length === 0 ? (
                <Empty>Sin adaptaciones de carga registradas (todos los movimientos permitidos).</Empty>
              ) : (
                <Table head={["Movimiento", "Estado", "Sustitución", "Carga", "Aviso fisio"]}
                  rows={adaptations.map((a) => [
                    `${a.movement?.category?.name ? a.movement.category.name + " · " : ""}${a.movement?.displayName ?? "—"}`,
                    STATE_LABEL[a.state] ?? a.state, a.substitutionText ?? "—", a.loadConstraint ?? "—", a.physioWarning ?? "—",
                  ])} />
              )}
              {wodLogs.length > 0 && (
                <>
                  <Sub>Registros de WOD recientes</Sub>
                  <Table head={["Fecha", "RPE", "Dolor", "WOD escrito por el paciente"]}
                    rows={wodLogs.map((w) => [fDate(w.submittedAt), w.rpe != null ? String(w.rpe) : "—", w.painScore != null ? String(w.painScore) : "—", (w.rawText || "—").replace(/\s*\n\s*/g, " / ")])} />
                </>
              )}
            </Section>

            <Section title="Evolución (métricas)">
              {metrics.length === 0 || metrics.every((m) => m.entries.length === 0) ? (
                <Empty>Todavía no hay datos de métricas registrados.</Empty>
              ) : (
                metrics.filter((m) => m.entries.length > 0).map((m) => {
                  const vals = m.entries.map((e: any) => e.value);
                  const last = m.entries[m.entries.length - 1];
                  return (
                    <div key={m.id} className="pe-row mb-3">
                      <div className="font-medium">{m.name}{m.unit ? ` (${m.unit})` : ""}</div>
                      <div className="text-xs text-neutral-500 mb-1">
                        {m.entries.length} registros · último: {last.value} el {fDate(last.recordedAt)} · mín {Math.min(...vals)} / máx {Math.max(...vals)}
                      </div>
                      <div className="text-xs text-neutral-600">
                        {m.entries.map((e: any) => `${fDate(e.recordedAt)}: ${e.value}`).join("   ·   ")}
                      </div>
                    </div>
                  );
                })
              )}
            </Section>

            <Section title="Programas">
              {(() => {
              const programAssignments = assignments.filter((a) => !a.program.isStandalone);
              return programAssignments.length === 0 ? (
                <Empty>Sin programas asignados.</Empty>
              ) : (
                <Table head={["Programa", "Inicio", "Duración", "Cumplimiento"]}
                  rows={programAssignments.map((a) => {
                    const total = a.sessions.length;
                    const done = a.sessions.filter((s) => s.completedAt).length;
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                    return [
                      a.program.name + (a.isActive ? "" : " (finalizado)"),
                      fDate(a.startDate),
                      `${a.weeksCount} semanas`,
                      total > 0 ? `${done}/${total} (${pct}%)` : "—",
                    ];
                  })} />
              );
              })()}
            </Section>
          </>
        )}

        {/* ── Valoración inicial ── */}
        <Section title="Valoración inicial">
          {patient.anamnesisCompletedAt && <p className="text-xs text-neutral-500 mb-2">Completada el {fDate(patient.anamnesisCompletedAt)}</p>}
          {!hasAnamnesis ? (
            <Empty>El paciente no ha rellenado la valoración inicial.</Empty>
          ) : (
            anamnesisSteps.map((step) => {
              const answered = step.fields.filter((f) => { const v = anamnesis[f.key]; return v != null && String(v).trim() !== ""; });
              if (answered.length === 0) return null;
              return (
                <div key={step.id} className="pe-row mb-3">
                  <div className="font-medium">{step.title}</div>
                  <Grid>
                    {answered.map((f) => (
                      <Field key={f.key} label={f.label} value={f.type === "scale" ? `${anamnesis[f.key]} / 10` : String(anamnesis[f.key])} />
                    ))}
                  </Grid>
                </div>
              );
            })
          )}
        </Section>

        {/* ── Formularios de sesión ── */}
        <Section title="Formularios de sesión">
          {formSessions.length === 0 ? (
            <Empty>Sin formularios de sesión rellenados.</Empty>
          ) : (
            formSessions.map((f) => (
              <div key={f.sessionId} className="pe-row mb-3 border-l-2 border-neutral-200 pl-3">
                <div className="flex justify-between items-baseline">
                  <div className="font-medium">{f.formTitle} <span className="text-xs text-neutral-500 font-normal">· {f.programName}</span></div>
                  <div className="text-xs text-neutral-500">{fDate(f.completedAt)}{f.formReviewedAt ? " · ✓ revisado" : ""}</div>
                </div>
                <div className="mt-1 space-y-1">
                  {f.questions.map((q: any) => {
                    const v = f.responses[q.id];
                    if (v == null || v === "") return null;
                    return (
                      <div key={q.id} className="text-xs">
                        <span className="text-neutral-500">{q.text}: </span>
                        <span className="font-medium">{String(v)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </Section>

        {all && clinicalCase && (clinicalCase.situation || clinicalCase.proposedSolutions || clinicalCase.consensusSolution) && (
          <Section title="Caso clínico">
            <Field label="Estado" value={clinicalCase.status} />
            {clinicalCase.situation && <Field label="Situación" value={clinicalCase.situation} />}
            {clinicalCase.proposedSolutions && <Field label="Soluciones propuestas" value={clinicalCase.proposedSolutions} />}
            {clinicalCase.consensusSolution && <Field label="Solución consensuada" value={clinicalCase.consensusSolution} />}
          </Section>
        )}

        {all && patient.contractSignedAt && (
          <Section title="Contrato">
            <Grid>
              <Field label="Firmado el" value={fDateTime(patient.contractSignedAt)} />
              <Field label="DNI/NIE" value={patient.contractDNI} />
              <Field label="Versión" value={patient.contractVersion} />
            </Grid>
          </Section>
        )}

        <p className="text-[10px] text-neutral-400 mt-8 pt-3 border-t border-neutral-200">
          Documento generado automáticamente por FisioFit Team el {exportedAt}. Contiene datos personales y de salud — trátese conforme al RGPD.
        </p>
      </div>
    </>
  );
}

// ── Componentes de presentación ──────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pe-section mb-6">
      <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-700 border-b border-neutral-300 pb-1 mb-2">{title}</h2>
      {children}
    </section>
  );
}
function Sub({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold text-neutral-600 mt-3 mb-1">{children}</div>;
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1.5">{children}</div>;
}
function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (value == null || String(value).trim() === "") return null;
  return (
    <div>
      <span className="text-neutral-500">{label}: </span>
      <span className="font-medium whitespace-pre-wrap">{value}</span>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-neutral-400 italic">{children}</p>;
}
function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-xs border-collapse mt-1">
      <thead>
        <tr>{head.map((h) => <th key={h} className="text-left font-semibold text-neutral-500 border-b border-neutral-300 py-1 pr-2 align-bottom">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="pe-row">{r.map((c, j) => <td key={j} className="border-b border-neutral-100 py-1 pr-2 align-top">{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}
