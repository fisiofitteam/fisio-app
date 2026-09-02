"use client";

/**
 * Bloque desplegable con las respuestas del formulario previo a una
 * llamada. Muestra las dos puntuaciones destacadas arriba (satisfacción
 * del programa + NPS del fisio) y debajo el resto de respuestas texto/
 * opción tal cual las escribió el paciente.
 *
 * Se usa en dos sitios:
 *   - Card 'Llamadas de seguimiento' de la ficha del paciente.
 *   - Panel /fisio/llamadas del equipo.
 *
 * El componente es puro presentacional — el server pasa el snapshot
 * (JSON con las preguntas al momento de responder) y las respuestas
 * (JSON con { [questionId]: value }).
 */

export type PreCallFormAnswersData = {
  formSnapshot: string;
  answers: string;
  satisfactionScore: number | null;
  npsScore: number | null;
  submittedAt: string;
};

export function PreCallFormAnswers({ response }: { response: PreCallFormAnswersData }) {
  let questions: Array<{ id: string; text: string; type: string }> = [];
  let answers: Record<string, unknown> = {};
  try {
    const snap = JSON.parse(response.formSnapshot);
    if (Array.isArray(snap?.questions)) questions = snap.questions;
  } catch {}
  try {
    answers = JSON.parse(response.answers) ?? {};
  } catch {}
  const submitted = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(response.submittedAt));

  return (
    <details className="rounded-lg" style={{ border: "1px solid #E5E5E5", background: "#FAFAFA" }}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium">📋 Respuestas del paciente</span>
          {response.satisfactionScore != null && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{ background: "#DBEAFE", color: "#1E3A8A" }}
            >
              Satisfacción {response.satisfactionScore}/10
            </span>
          )}
          {response.npsScore != null && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{ background: "#D1FAE5", color: "#065F46" }}
            >
              NPS {response.npsScore}/10
            </span>
          )}
        </div>
        <span className="text-[10px] text-neutral-500">{submitted}</span>
      </summary>
      <div className="px-3 pb-3 pt-1 space-y-2">
        {questions.length === 0 ? (
          <div className="text-[11px] text-neutral-500 italic">Sin preguntas guardadas.</div>
        ) : (
          questions.map((q) => {
            const raw = answers[q.id];
            const val = raw === undefined || raw === null || raw === "" ? "—" : String(raw);
            return (
              <div key={q.id}>
                <div className="text-[10px] uppercase tracking-wide text-neutral-500">{q.text}</div>
                <div className="text-xs text-neutral-800 whitespace-pre-wrap">{val}</div>
              </div>
            );
          })
        )}
      </div>
    </details>
  );
}
