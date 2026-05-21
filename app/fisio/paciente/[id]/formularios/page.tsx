import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function PatientFormsTab({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({ where: { id: params.id } });
  if (!patient) notFound();

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
    <div>
      <header className="mb-4">
        <h2 className="font-medium">Formularios rellenados</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          {formSessions.length} formulario{formSessions.length !== 1 && "s"} en el historial
        </p>
      </header>

      {formSessions.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-12">
          El paciente todavía no ha rellenado ningún formulario.
        </p>
      ) : (
        <div className="space-y-2">
          {formSessions.map((f) => (
            <article key={f.sessionId} className="card">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-medium text-sm">{f.formTitle}</div>
                  <div className="text-xs text-neutral-500">{f.programName}</div>
                </div>
                <div className="text-xs text-right flex-shrink-0">
                  <div className="text-neutral-500">
                    {new Date(f.completedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                  {f.formReviewedAt ? (
                    <div className="text-emerald-700 mt-0.5">✓ Revisado</div>
                  ) : (
                    <div className="text-amber-700 mt-0.5">Pendiente de revisar</div>
                  )}
                </div>
              </div>

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
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
