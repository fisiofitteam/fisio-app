import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { hasPendingFormReview, parseFormQuestions } from "@/lib/pending-form-review";
import { markFormReviewed } from "./actions";

export const dynamic = "force-dynamic";

export default async function PendingFormsPage() {
  const user = (await getActiveProfessional())!;
  const isManager = user.isManager;

  // Excluimos pacientes fantasma (isTest). Los fisios normales solo ven
  // formularios de sus atletas asignados.
  const sessions = await prisma.programSession.findMany({
    where: {
      completedAt: { not: null },
      formReviewedAt: null,
      assignment: isManager
        ? { patient: { isTest: false } }
        : { patient: { isTest: false, assignedProfessionalId: user.id } },
    },
    include: { assignment: { include: { patient: true, program: true } } },
    orderBy: { completedAt: "desc" },
  });

  // Solo quedan las sesiones donde el paciente REALMENTE ha rellenado el
  // formulario (respuesta no vacia + sin sentinel de skipped).
  const pending = sessions.filter(hasPendingFormReview);

  return (
    <main>
      <header className="mb-5">
        <Link href="/fisio" className="text-xs text-neutral-500">← Panel</Link>
        <h1 className="text-xl font-semibold mt-1">Formularios por revisar</h1>
        <p className="text-xs text-neutral-500 mt-0.5">{pending.length} pendiente{pending.length !== 1 && "s"}</p>
      </header>

      {pending.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-12">
          No hay formularios pendientes de revisión.
        </p>
      ) : (
        <div className="space-y-2">
          {pending.map((s) => {
            let tasks: any[] = [];
            try { tasks = JSON.parse(s.tasksSnapshot); } catch { tasks = []; }
            const formTask = tasks.find((t) => t?.type === "FORM");
            let responses: Record<string, any> = {};
            if (s.responses) {
              try { responses = JSON.parse(s.responses); } catch { responses = {}; }
            }
            const formResponse = formTask ? responses[formTask.id] : null;
            // Snapshots modernos guardan questions ya como array; los
            // antiguos como string JSON. parseFormQuestions cubre ambos.
            const questions = parseFormQuestions(formTask?.questions);

            return (
              <article key={s.id} className="card">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-medium">{s.assignment.patient.fullName}</div>
                    <div className="text-xs text-neutral-500">
                      {formTask?.title ?? "Formulario"} · {s.assignment.program.name}
                    </div>
                  </div>
                  <div className="text-xs text-neutral-500 text-right flex-shrink-0">
                    {s.completedAt && new Date(s.completedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                  </div>
                </div>

                {formResponse && typeof formResponse === "object" && questions.length > 0 && (
                  <div className="mt-2 border-t border-neutral-100 pt-2 space-y-1.5">
                    {questions.map((q: any) => {
                      const value = formResponse[q.id];
                      if (value === undefined || value === null || value === "") return null;
                      return (
                        <div key={q.id} className="text-xs">
                          <span className="text-neutral-500">{q.text}: </span>
                          <span className="font-medium">{String(value)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-3 flex gap-2 justify-end">
                  <Link
                    href={`/fisio/paciente/${s.assignment.patientId}/formularios`}
                    className="text-xs text-neutral-500 hover:text-neutral-900"
                  >
                    Ver todos del paciente →
                  </Link>
                  <ReviewButton sessionId={s.id} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}

function ReviewButton({ sessionId }: { sessionId: string }) {
  return (
    <form action={markFormReviewed.bind(null, sessionId)}>
      <button type="submit" className="btn btn-primary text-xs">
        ✓ Marcar como revisado
      </button>
    </form>
  );
}
