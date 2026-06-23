"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { youtubeEmbedUrl } from "@/lib/youtube";

type Exercise = { id: string; name: string; category: string; youtubeUrl: string | null; description: string | null };

type Task = {
  id: string;
  type: "WORKOUT" | "VIDEO" | "FORM" | "EVOLUTION";
  title: string;
  order: number;
  bodyText?: string;
  // Snapshot moderno: `exercises` con campos planos.
  exercises?: Exercise[];
  // Snapshots antiguos guardaron los ejercicios bajo `linkedExercises` (legacy
  // del WorkoutTaskEditor en modo snapshot). Toleramos ambos.
  linkedExercises?: Exercise[];
  youtubeUrl?: string;
  description?: string | null;
  questions?: { id: string; text: string; type: string; min?: number; max?: number; options?: string[] }[];
  instructions?: string | null;
};

// Normaliza la lista de ejercicios de una tarea WORKOUT independientemente de
// cómo se serializó el snapshot.
function getTaskExercises(t: Task): Exercise[] {
  const arr = t.exercises ?? t.linkedExercises ?? [];
  return arr.map((ex: any) => ({
    id: String(ex.id),
    name: String(ex.name ?? ""),
    category: String(ex.category ?? ""),
    youtubeUrl: ex.youtubeUrl ?? null,
    description: ex.description ?? null,
  }));
}

export function SessionRunner({
  sessionId,
  patientId,
  tasks,
  completed,
  existingResponses,
  whatsappUrl = null,
}: {
  sessionId: string;
  patientId: string;
  tasks: Task[];
  completed: boolean;
  existingResponses: string | null;
  whatsappUrl?: string | null;
}) {
  const router = useRouter();
  const initialResponses = existingResponses ? JSON.parse(existingResponses) : {};
  const [responses, setResponses] = useState<Record<string, any>>(initialResponses);
  const [saving, setSaving] = useState(false);
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);

  function setTaskResponse(taskId: string, data: any) {
    setResponses((prev) => ({ ...prev, [taskId]: data }));
  }

  async function complete() {
    setSaving(true);
    await fetch("/api/sessions/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, responses }),
    });
    // Tras completar, llevar al grupo de seguimiento para dar feedback.
    if (whatsappUrl) {
      window.location.href = whatsappUrl;
      return;
    }
    router.push(`/paciente/${patientId}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {completed && (
        <div className="card bg-emerald-50 border-emerald-200 text-sm text-emerald-900">
          ✓ Sesión completada. Puedes consultar tus respuestas abajo.
        </div>
      )}

      {tasks.map((task) => (
        <div key={task.id} className="card">
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1">
              <div className="text-xs uppercase text-neutral-400 tracking-wide">{typeLabel(task.type)}</div>
              <h2 className="font-medium mt-0.5">{task.title}</h2>
            </div>
          </div>

          {task.type === "WORKOUT" && (() => {
            const ex = getTaskExercises(task);
            return (
            <div>
              {task.bodyText && (
                <pre className="whitespace-pre-wrap font-mono text-sm bg-neutral-50 p-3 rounded-lg">
                  {task.bodyText}
                </pre>
              )}
              {ex.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs text-neutral-500 mb-2">Vídeos de referencia</div>
                  <div className="space-y-2">
                    {ex.map((ex) => {
                      const embed = ex.youtubeUrl ? youtubeEmbedUrl(ex.youtubeUrl) : null;
                      const isOpen = expandedExercise === ex.id;
                      return (
                        <div key={ex.id} className="border border-neutral-200 rounded-lg overflow-hidden">
                          <button
                            onClick={() => setExpandedExercise(isOpen ? null : ex.id)}
                            className="w-full text-left p-3 hover:bg-neutral-50 flex justify-between items-center"
                          >
                            <div>
                              <div className="font-medium text-sm">{ex.name}</div>
                              <div className="text-xs text-neutral-500">{ex.category}</div>
                            </div>
                            <span className="text-neutral-300">{isOpen ? "▴" : "▾"}</span>
                          </button>
                          {isOpen && (
                            <div className="border-t border-neutral-200 p-3 bg-neutral-50">
                              {embed ? (
                                <div className="aspect-video rounded-lg overflow-hidden bg-black mb-2">
                                  <iframe src={embed} className="w-full h-full" allowFullScreen />
                                </div>
                              ) : (
                                <p className="text-xs text-neutral-500">Sin vídeo asociado.</p>
                              )}
                              {ex.description && (
                                <p className="text-xs text-neutral-600 italic">{ex.description}</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            );
          })()}

          {task.type === "VIDEO" && (
            <div>
              {task.youtubeUrl && youtubeEmbedUrl(task.youtubeUrl) && (
                <div className="aspect-video rounded-lg overflow-hidden bg-black">
                  <iframe src={youtubeEmbedUrl(task.youtubeUrl)!} className="w-full h-full" allowFullScreen />
                </div>
              )}
              {task.description && (
                <p className="text-sm text-neutral-700 mt-2">{task.description}</p>
              )}
            </div>
          )}

          {task.type === "FORM" && (
            <FormResponder
              task={task}
              completed={completed}
              response={responses[task.id] ?? {}}
              onChange={(data) => setTaskResponse(task.id, data)}
            />
          )}

          {task.type === "EVOLUTION" && (
            <EvolutionResponder
              task={task}
              completed={completed}
              response={responses[task.id] ?? {}}
              onChange={(data) => setTaskResponse(task.id, data)}
            />
          )}
        </div>
      ))}

      {!completed && (
        <button
          onClick={complete}
          disabled={saving}
          className="w-full font-semibold rounded-lg py-3 text-sm disabled:opacity-60"
          style={{ background: "var(--p-accent)", color: "var(--p-accent-ink)" }}
        >
          {saving ? "Guardando…" : whatsappUrl ? "✓ Marcar como completada y dar feedback" : "✓ Marcar como completada"}
        </button>
      )}

      {completed && whatsappUrl && (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full font-semibold rounded-lg py-3 text-sm flex items-center justify-center gap-2"
          style={{ background: "#25D366", color: "#FFFFFF" }}
        >
          Ir a mi grupo de seguimiento
        </a>
      )}
    </div>
  );
}

function typeLabel(type: string) {
  return type === "WORKOUT" ? "Workout"
    : type === "VIDEO" ? "Vídeo"
    : type === "FORM" ? "Formulario"
    : type === "EVOLUTION" ? "Registrar evolución"
    : type;
}

function FormResponder({ task, completed, response, onChange }: any) {
  const questions = task.questions ?? [];

  // Puntuación Likert agregada (suma + máx posible). Solo si hay preguntas Likert.
  const likertDefault = ["Totalmente en desacuerdo", "En desacuerdo", "Neutral", "De acuerdo", "Totalmente de acuerdo"];
  let likertSum = 0, likertMax = 0, likertCount = 0;
  for (const q of questions) {
    if (q.type !== "likert") continue;
    likertCount += 1;
    const labels: string[] = Array.isArray(q.scaleLabels) && q.scaleLabels.length > 0 ? q.scaleLabels : likertDefault;
    likertMax += labels.length;
    const v = Number(response[q.id]);
    if (Number.isFinite(v)) likertSum += v;
  }
  const showScore = likertCount > 0;

  return (
    <div className="space-y-3">
      {showScore && (
        <div className="p-2 rounded bg-blue-50 border border-blue-200 text-xs">
          <span className="font-medium text-blue-900">📊 Puntuación Likert:</span>{" "}
          <span className="font-semibold text-blue-900">{likertSum} / {likertMax}</span>
          <span className="text-blue-700"> · {likertMax > 0 ? Math.round((likertSum / likertMax) * 100) : 0}% · {likertCount} pregunta{likertCount > 1 ? "s" : ""}</span>
        </div>
      )}
      {questions.map((q: any) => {
        const val = response[q.id];
        return (
          <div key={q.id}>
            <label className="text-sm font-medium block">{q.text}</label>
            {q.description && (
              <p className="text-xs text-neutral-400 italic mb-1">{q.description}</p>
            )}
            {!q.description && <div className="mb-1" />}
            {q.type === "text" && (
              <textarea
                className="input text-sm"
                rows={2}
                disabled={completed}
                value={val ?? ""}
                onChange={(e) => onChange({ ...response, [q.id]: e.target.value })}
              />
            )}
            {q.type === "scale" && (
              <div>
                <input
                  type="range"
                  min={q.min ?? 0}
                  max={q.max ?? 10}
                  disabled={completed}
                  value={val ?? q.min ?? 0}
                  onChange={(e) => onChange({ ...response, [q.id]: Number(e.target.value) })}
                  className="w-full"
                />
                <div className="text-xs text-neutral-500 text-center">
                  {val ?? q.min ?? 0} / {q.max ?? 10}
                </div>
              </div>
            )}
            {q.type === "yesno" && (
              <div className="flex gap-2">
                {["Sí", "No"].map((opt) => (
                  <button
                    key={opt}
                    disabled={completed}
                    onClick={() => onChange({ ...response, [q.id]: opt })}
                    className={`flex-1 py-2 text-sm rounded-lg ${val === opt ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
            {q.type === "choice" && (
              <div className="space-y-1">
                {(q.options ?? []).map((opt: string) => (
                  <button
                    key={opt}
                    disabled={completed}
                    onClick={() => onChange({ ...response, [q.id]: opt })}
                    className={`w-full text-left py-2 px-3 text-sm rounded-lg ${val === opt ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
            {q.type === "likert" && (
              <div className="space-y-1">
                {((q.scaleLabels && q.scaleLabels.length > 0) ? q.scaleLabels : [
                  "Totalmente en desacuerdo", "En desacuerdo", "Neutral", "De acuerdo", "Totalmente de acuerdo",
                ]).map((label: string, idx: number) => {
                  const value = idx + 1; // guardamos 1..N
                  const selected = val === value;
                  return (
                    <button
                      key={idx}
                      disabled={completed}
                      onClick={() => onChange({ ...response, [q.id]: value })}
                      className={`w-full text-left py-2 px-3 text-sm rounded-lg flex items-center gap-2 ${selected ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}
                    >
                      <span className={`flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center text-[10px] ${selected ? "bg-white text-neutral-900 border-white" : "border-neutral-300 text-neutral-500"}`}>
                        {value}
                      </span>
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EvolutionResponder({ task, completed, response, onChange }: any) {
  return (
    <div className="space-y-3">
      {task.instructions && (
        <p className="text-xs text-neutral-600 italic bg-neutral-50 p-2 rounded">{task.instructions}</p>
      )}
      <ScaleField
        label="RPE percibido"
        value={response.rpe}
        completed={completed}
        onChange={(v) => onChange({ ...response, rpe: v })}
      />
      <ScaleField
        label="Dolor"
        value={response.pain}
        completed={completed}
        onChange={(v) => onChange({ ...response, pain: v })}
      />
      <ScaleField
        label="Rigidez"
        value={response.stiffness}
        completed={completed}
        onChange={(v) => onChange({ ...response, stiffness: v })}
      />
    </div>
  );
}

function ScaleField({ label, value, completed, onChange }: any) {
  return (
    <div>
      <label className="text-sm font-medium block mb-1">{label}: {value ?? 0}/10</label>
      <input
        type="range"
        min={0}
        max={10}
        disabled={completed}
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}
