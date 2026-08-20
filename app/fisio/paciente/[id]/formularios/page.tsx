import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getOnboardingConfig } from "@/lib/onboarding-config";
import { CallAnamnesisSection } from "@/components/CallAnamnesisSection";
import { PatientCallLinksCard } from "@/components/PatientCallLinksCard";

function fDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export default async function PatientFormsTab({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({ where: { id: params.id } });
  if (!patient) notFound();

  // baseUrl para armar el link público de reserva que la card copia / manda por WhatsApp.
  const hdrs = headers();
  const host = hdrs.get("host") ?? "app.fisiofit.team";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const callsBaseUrl = `${proto}://${host}`;

  // Lead que originó al paciente + su CallSummary (si Meet publicó
  // transcript se muestra el resumen clínico IA sobre el textarea de notas).
  const sourceLead = await prisma.lead.findFirst({
    where: { convertedPatientId: params.id, meetingUrl: { not: null } },
    orderBy: { callScheduledAt: "desc" },
    select: {
      callSummary: {
        select: {
          clinicalSummary: true,
          clinicalKeyPoints: true,
          noTranscript: true,
          errorMessage: true,
        },
      },
    },
  });
  const clinicalNotes = sourceLead?.callSummary
    ? {
        clinicalSummary: sourceLead.callSummary.clinicalSummary,
        clinicalKeyPoints: sourceLead.callSummary.clinicalKeyPoints,
        noTranscript: sourceLead.callSummary.noTranscript,
        errorMessage: sourceLead.callSummary.errorMessage,
      }
    : null;

  // ── Valoración inicial (anamnesis del onboarding) ──────────────────────────
  let anamnesis: Record<string, any> = {};
  try {
    anamnesis = patient.anamnesisData ? JSON.parse(patient.anamnesisData) : {};
  } catch {
    anamnesis = {};
  }
  const hasAnamnesis = Object.values(anamnesis).some((v) => v !== undefined && v !== null && String(v).trim() !== "");
  const { anamnesisSteps } = await getOnboardingConfig();
  const knownKeys = new Set(anamnesisSteps.flatMap((s) => s.fields.map((f) => f.key)));
  const orphans = Object.entries(anamnesis).filter(
    ([k, v]) => !knownKeys.has(k) && v !== undefined && v !== null && String(v).trim() !== ""
  );

  const sessions = await prisma.programSession.findMany({
    where: {
      assignment: { patientId: params.id },
      completedAt: { not: null },
    },
    include: { assignment: { include: { program: true } } },
    orderBy: { completedAt: "desc" },
  });

  // Parseo defensivo de questions: los snapshots modernos guardan el
  // campo ya como array (SessionRunner también lo maneja así). Los
  // snapshots antiguos lo guardaban como string JSON. Si viene otra cosa
  // devolvemos array vacío en lugar de crashear la página entera.
  function parseQuestions(raw: unknown): any[] {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string" && raw.trim()) {
      try {
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      } catch { return []; }
    }
    return [];
  }

  // Solo sesiones con FORM completado. Envolvemos todo en try por sesión —
  // un snapshot corrupto no debe romper la pestaña entera.
  const formSessions = sessions
    .map((s) => {
      try {
        const tasks = JSON.parse(s.tasksSnapshot) as any[];
        const responses = s.responses ? JSON.parse(s.responses) : {};
        const formTask = tasks.find((t) => t.type === "FORM" && responses[t.id]);
        if (!formTask) return null;
        return {
          sessionId: s.id,
          completedAt: s.completedAt,
          formReviewedAt: s.formReviewedAt,
          programName: s.assignment.program.name,
          formTitle: formTask.title,
          questions: parseQuestions(formTask.questions),
          responses: responses[formTask.id],
        };
      } catch (e) {
        console.error("[formularios] snapshot corrupto sesion", s.id, e);
        return null;
      }
    })
    .filter(Boolean) as any[];

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link
          href={`/fisio/paciente/${patient.id}/exportar?solo=formularios`}
          className="btn btn-ghost text-xs"
        >
          🖨️ Exportar formularios (PDF)
        </Link>
      </div>

      {/* ── Valoración inicial ──────────────────────────────────────────── */}
      <section>
        <h2 className="font-medium mb-2">Valoración inicial</h2>

        {!hasAnamnesis ? (
          <p className="text-sm text-neutral-500 text-center py-8 card">
            Este paciente todavía no ha rellenado la valoración inicial.
          </p>
        ) : (
          <details className="card group">
            <summary className="flex justify-between items-center gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <div>
                <div className="font-medium text-sm">Cuestionario de onboarding</div>
                {patient.anamnesisCompletedAt && (
                  <div className="text-xs text-neutral-500 mt-0.5">Completada el {fDate(patient.anamnesisCompletedAt)}</div>
                )}
              </div>
              <span className="text-neutral-400 text-xs group-open:rotate-180 transition-transform">▼</span>
            </summary>

            <div className="mt-3 border-t border-neutral-100 pt-3 space-y-4">
              {anamnesisSteps.map((step) => {
                const answered = step.fields.filter((f) => {
                  const v = anamnesis[f.key];
                  return v !== undefined && v !== null && String(v).trim() !== "";
                });
                if (answered.length === 0) return null;
                return (
                  <div key={step.id}>
                    <div className="font-medium text-sm mb-2">{step.title}</div>
                    <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
                      {answered.map((f) => {
                        const v = anamnesis[f.key];
                        const display = f.type === "scale" ? `${v} / 10` : String(v);
                        return (
                          <div key={f.key} className="text-xs">
                            <div className="text-neutral-500">{f.label}</div>
                            <div className="font-medium mt-0.5 whitespace-pre-wrap">{display}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Respuestas a preguntas que ya no existen en el cuestionario actual */}
              {orphans.length > 0 && (
                <div>
                  <div className="font-medium text-sm mb-2">Otras respuestas</div>
                  <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
                    {orphans.map(([k, v]) => (
                      <div key={k} className="text-xs">
                        <div className="text-neutral-500">{k}</div>
                        <div className="font-medium mt-0.5 whitespace-pre-wrap">{String(v)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </details>
        )}
      </section>

      {/* ── Llamada Anamnesis (texto manual + resumen clínico IA de la llamada de venta) ── */}
      <CallAnamnesisSection
        patientId={patient.id}
        initialText={patient.anamnesisCallNotes ?? null}
        clinicalNotes={clinicalNotes}
      />

      {/* ── Llamadas de seguimiento del fisio (optimización / renovación) ── */}
      <PatientCallLinksCard
        patientId={patient.id}
        patientGroupUrl={patient.whatsappGroupUrl ?? null}
        patientFirstName={patient.fullName.split(" ")[0] ?? patient.fullName}
        baseUrl={callsBaseUrl}
      />

      {/* ── Formularios de sesión ───────────────────────────────────────── */}
      <section>
        <h2 className="font-medium mb-2">Formularios de sesión</h2>
        <p className="text-xs text-neutral-500 mb-3">
          {formSessions.length} formulario{formSessions.length !== 1 && "s"} en el historial
        </p>

        {formSessions.length === 0 ? (
          <p className="text-sm text-neutral-500 text-center py-8 card">
            El paciente todavía no ha rellenado ningún formulario de sesión.
          </p>
        ) : (
          <div className="space-y-2">
            {formSessions.map((f) => {
              const headerScore = computeLikertScore(f.questions, f.responses);
              return (
              <details key={f.sessionId} className="card group">
                <summary className="flex justify-between items-center gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{f.formTitle}</div>
                    <div className="text-xs text-neutral-500 flex items-center gap-2 flex-wrap">
                      <span>{f.programName}</span>
                      {headerScore.count > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-medium">
                          Likert {headerScore.sum}/{headerScore.max}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-xs text-right">
                      <div className="text-neutral-500">{fDate(f.completedAt)}</div>
                      {f.formReviewedAt ? (
                        <div className="text-emerald-700 mt-0.5">✓ Revisado</div>
                      ) : (
                        <div className="text-amber-700 mt-0.5">Pendiente de revisar</div>
                      )}
                    </div>
                    <span className="text-neutral-400 text-xs group-open:rotate-180 transition-transform">▼</span>
                  </div>
                </summary>

                <div className="mt-2 border-t border-neutral-100 pt-2 space-y-1.5">
                  {(() => {
                    const score = computeLikertScore(f.questions, f.responses);
                    if (score.count === 0) return null;
                    const pct = score.max > 0 ? Math.round((score.sum / score.max) * 100) : 0;
                    return (
                      <div className="mb-2 p-2 rounded bg-blue-50 border border-blue-200">
                        <div className="text-[11px] uppercase tracking-wide text-blue-700">📊 Puntuación Likert</div>
                        <div className="text-sm font-semibold text-blue-900">
                          {score.sum} / {score.max} <span className="text-xs font-normal text-blue-700">· {pct}% · {score.count} pregunta{score.count > 1 ? "s" : ""}</span>
                        </div>
                      </div>
                    );
                  })()}
                  {f.questions.map((q: any) => {
                    const value = f.responses[q.id];
                    if (value === undefined || value === null || value === "") return null;
                    const display = formatAnswer(q, value);
                    return (
                      <div key={q.id} className="text-xs">
                        <div className="text-neutral-500">{q.text}</div>
                        <div className="font-medium mt-0.5">{display}</div>
                      </div>
                    );
                  })}
                </div>
              </details>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

const LIKERT_DEFAULT = [
  "Totalmente en desacuerdo", "En desacuerdo", "Neutral", "De acuerdo", "Totalmente de acuerdo",
];

function computeLikertScore(questions: any[], responses: Record<string, any>): { sum: number; max: number; count: number } {
  let sum = 0, max = 0, count = 0;
  for (const q of questions) {
    if (q.type !== "likert") continue;
    const v = Number(responses[q.id]);
    if (!Number.isFinite(v)) continue;
    const labels: string[] = Array.isArray(q.scaleLabels) && q.scaleLabels.length > 0 ? q.scaleLabels : LIKERT_DEFAULT;
    sum += v;
    max += labels.length;
    count += 1;
  }
  return { sum, max, count };
}

function formatAnswer(q: any, v: any): string {
  if (q.type === "likert") {
    const labels: string[] = Array.isArray(q.scaleLabels) && q.scaleLabels.length > 0 ? q.scaleLabels : LIKERT_DEFAULT;
    const idx = Number(v) - 1;
    const label = labels[idx];
    return label ? `${v}. ${label}` : String(v);
  }
  if (q.type === "scale") return `${v} / ${q.max ?? 10}`;
  return String(v);
}
