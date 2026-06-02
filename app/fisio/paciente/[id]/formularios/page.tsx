import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOnboardingConfig } from "@/lib/onboarding-config";
import { CallAnamnesisSection } from "@/components/CallAnamnesisSection";

function fDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export default async function PatientFormsTab({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({ where: { id: params.id } });
  if (!patient) notFound();

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

  // Solo sesiones con FORM completado
  const formSessions = sessions
    .map((s) => {
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
        questions: formTask.questions ? JSON.parse(formTask.questions) : [],
        responses: responses[formTask.id],
      };
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

      {/* ── Llamada Anamnesis (texto manual) ───────────────────────────── */}
      <CallAnamnesisSection patientId={patient.id} initialText={patient.anamnesisCallNotes ?? null} />

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
            {formSessions.map((f) => (
              <details key={f.sessionId} className="card group">
                <summary className="flex justify-between items-center gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{f.formTitle}</div>
                    <div className="text-xs text-neutral-500">{f.programName}</div>
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
                  {f.questions.map((q: any) => {
                    const value = f.responses[q.id];
                    if (value === undefined || value === null || value === "") return null;
                    return (
                      <div key={q.id} className="text-xs">
                        <div className="text-neutral-500">{q.text}</div>
                        <div className="font-medium mt-0.5">{String(value)}</div>
                      </div>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
