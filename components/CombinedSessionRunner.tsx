"use client";
/**
 * Renderiza varias ProgramSession del paciente como UNA sola sesión visual.
 *
 * - Las tareas WORKOUT/VIDEO/FORM de cada programa se muestran agrupadas con
 *   un separador discreto del nombre del programa.
 * - Si hay más de una tarea EVOLUTION (por ejemplo dos programas que la
 *   incluyen), se muestra una sola al final; la respuesta se replicará a las
 *   otras al guardar (lo hace el endpoint complete-combined).
 * - Un único botón "Completar sesión" marca todas las sesiones a la vez.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Task,
  Exercise,
  getTaskExercises,
  typeLabel,
  FormResponder,
  EvolutionResponder,
} from "@/components/SessionRunner";
import { youtubeEmbedUrl } from "@/lib/youtube";

export type CombinedGroup = {
  sessionId: string;
  programName: string;
  tasks: Task[];
};

export function CombinedSessionRunner({
  patientId,
  groups,
  whatsappUrl = null,
}: {
  patientId: string;
  groups: CombinedGroup[];
  whatsappUrl?: string | null;
}) {
  const router = useRouter();
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);

  function setTaskResponse(taskId: string, data: any) {
    setResponses((prev) => ({ ...prev, [taskId]: data }));
  }

  // Detectar UNA tarea EVOLUTION canónica para mostrar al final.
  // Las demás (de otros programas) quedan implícitas — al guardar, el
  // endpoint complete-combined replicará la respuesta a todas.
  const allEvolution: Task[] = [];
  const groupsWithoutEvolution: CombinedGroup[] = groups.map((g) => {
    const evo = g.tasks.filter((t) => t.type === "EVOLUTION");
    if (evo.length > 0) allEvolution.push(...evo);
    return { ...g, tasks: g.tasks.filter((t) => t.type !== "EVOLUTION") };
  });
  const canonicalEvolution = allEvolution[0] ?? null;

  async function complete() {
    setSaving(true);
    const sessionIds = groups.map((g) => g.sessionId);
    await fetch("/api/sessions/complete-combined", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionIds, responses }),
    });
    if (whatsappUrl) {
      window.location.href = whatsappUrl;
      return;
    }
    router.push(`/paciente/${patientId}`);
    router.refresh();
  }

  const showSeparators = groups.length > 1;

  return (
    <div className="space-y-4">
      {groupsWithoutEvolution.map((g, gi) => (
        <div key={g.sessionId} className="space-y-3">
          {showSeparators && g.tasks.length > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <div className="text-[10px] font-bold tracking-wider uppercase" style={{ color: "var(--p-text-faint)" }}>
                {g.programName}
              </div>
              <div className="flex-1 h-px" style={{ background: "var(--p-border)" }} />
            </div>
          )}
          {g.tasks.map((task) => (
            <TaskBlock
              key={task.id}
              task={task}
              response={responses[task.id] ?? (task.type === "FORM" || task.type === "EVOLUTION" ? {} : "")}
              onChange={(data: any) => setTaskResponse(task.id, data)}
              expandedExercise={expandedExercise}
              setExpandedExercise={setExpandedExercise}
            />
          ))}
        </div>
      ))}

      {canonicalEvolution && (
        <div className="space-y-3">
          {showSeparators && (
            <div className="flex items-center gap-2 mt-1">
              <div className="text-[10px] font-bold tracking-wider uppercase" style={{ color: "var(--p-text-faint)" }}>
                Métricas de hoy
              </div>
              <div className="flex-1 h-px" style={{ background: "var(--p-border)" }} />
            </div>
          )}
          <TaskBlock
            task={canonicalEvolution}
            response={responses[canonicalEvolution.id] ?? {}}
            onChange={(data: any) => setTaskResponse(canonicalEvolution.id, data)}
            expandedExercise={expandedExercise}
            setExpandedExercise={setExpandedExercise}
          />
        </div>
      )}

      <button
        onClick={complete}
        disabled={saving}
        className="w-full font-semibold rounded-lg py-3 text-sm disabled:opacity-60 mt-3"
        style={{ background: "var(--p-accent)", color: "var(--p-accent-ink)" }}
      >
        {saving ? "Guardando…" : whatsappUrl ? "✓ Completar sesión y dar feedback" : "✓ Completar sesión"}
      </button>
    </div>
  );
}

function TaskBlock({
  task, response, onChange, expandedExercise, setExpandedExercise,
}: {
  task: Task;
  response: any;
  onChange: (data: any) => void;
  expandedExercise: string | null;
  setExpandedExercise: (id: string | null) => void;
}) {
  return (
    <div className="card">
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
                  {ex.map((e: Exercise) => {
                    const embed = e.youtubeUrl ? youtubeEmbedUrl(e.youtubeUrl) : null;
                    const isOpen = expandedExercise === e.id;
                    return (
                      <div key={e.id} className="border border-neutral-200 rounded-lg overflow-hidden">
                        <button
                          onClick={() => setExpandedExercise(isOpen ? null : e.id)}
                          className="w-full text-left p-3 hover:bg-neutral-50 flex justify-between items-center"
                        >
                          <span className="text-sm font-medium">{e.name}</span>
                          <span className="text-xs text-neutral-400">{isOpen ? "▲" : "▼"}</span>
                        </button>
                        {isOpen && (
                          <div className="p-3 border-t border-neutral-200 bg-neutral-50 space-y-2">
                            {e.description && <p className="text-xs text-neutral-700">{e.description}</p>}
                            {embed && (
                              <div className="aspect-video bg-black rounded overflow-hidden">
                                <iframe
                                  src={embed}
                                  className="w-full h-full"
                                  frameBorder="0"
                                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                  allowFullScreen
                                />
                              </div>
                            )}
                            {e.youtubeUrl && !embed && (
                              <a href={e.youtubeUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-700 hover:underline">
                                Abrir vídeo →
                              </a>
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
          {task.bodyText && <p className="text-sm whitespace-pre-wrap">{task.bodyText}</p>}
          {task.youtubeUrl && (() => {
            const embed = youtubeEmbedUrl(task.youtubeUrl);
            return embed ? (
              <div className="aspect-video bg-black rounded overflow-hidden mt-2">
                <iframe src={embed} className="w-full h-full" frameBorder="0" allowFullScreen />
              </div>
            ) : (
              <a href={task.youtubeUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-700 hover:underline">
                Abrir vídeo →
              </a>
            );
          })()}
          {task.description && (
            <p className="text-sm text-neutral-700 mt-2">{task.description}</p>
          )}
        </div>
      )}

      {task.type === "FORM" && (
        <FormResponder task={task} completed={false} response={response} onChange={onChange} />
      )}

      {task.type === "EVOLUTION" && (
        <EvolutionResponder task={task} completed={false} response={response} onChange={onChange} />
      )}
    </div>
  );
}
