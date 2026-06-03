"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Plus, X, ListTodo } from "lucide-react";
import type { WeeklyBoard } from "@/lib/weekly-team-tasks";

const DAY_LABELS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

/**
 * Vista de tareas semanales del equipo, estilo "5 columnas L-V con checkboxes".
 *
 * Dos modos:
 *  - mode="self": el fisio/head_success ve y marca SUS tareas. Las completadas
 *    desaparecen (se filtran del render). Contador "pendientes" por columna.
 *  - mode="ceo": el CEO ve TODAS las tareas (completadas tachadas, pendientes
 *    visibles) y puede añadir/borrar por columna. No marca como completadas
 *    (los toggles están deshabilitados desde su vista para no confundir el
 *    estado real de los fisios).
 */
export function WeeklyTeamTasksBoard({
  board,
  role,
  mode,
  title = "Tareas de la semana",
  subtitle = "Se reinician cada lunes a las 00:00",
}: {
  board: WeeklyBoard;
  /** Rol que se está viendo: "fisio" | "head_success". Solo lo usa modo ceo. */
  role: "fisio" | "head_success";
  mode: "self" | "ceo";
  title?: string;
  subtitle?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState<number | null>(null);

  async function complete(taskId: string) {
    setBusy(taskId);
    await fetch("/api/team-tasks/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId }),
    }).catch(() => {});
    setBusy(null);
    router.refresh();
  }

  async function addTask(dayOfWeek: number, title: string) {
    const t = title.trim();
    if (!t) return;
    await fetch("/api/team-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t, dayOfWeek, targetRole: role }),
    }).catch(() => {});
    setAdding(null);
    router.refresh();
  }

  async function removeTask(taskId: string) {
    if (!confirm("¿Borrar esta tarea? Se elimina de todos los lunes futuros.")) return;
    await fetch(`/api/team-tasks/${taskId}`, { method: "DELETE" }).catch(() => {});
    router.refresh();
  }

  return (
    <section className="card">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h2 className="font-medium text-sm flex items-center gap-2">
          <ListTodo size={16} className="text-neutral-500" />
          {title}
        </h2>
        <span className="text-[11px] text-neutral-400">{subtitle}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {board.days.map((day) => {
          const visible = mode === "self" ? day.tasks.filter((t) => !t.completed) : day.tasks;
          return (
            <div
              key={day.dayOfWeek}
              className="rounded-lg p-2.5 min-h-[100px]"
              style={{ background: "#FAFAFA", border: "1px solid #F0F0F0" }}
            >
              <div className="flex items-baseline justify-between mb-2">
                <div className="text-xs font-semibold text-neutral-700">{DAY_LABELS[day.dayOfWeek]}</div>
                <div className="text-[10px] font-medium text-neutral-400 tabular-nums">
                  {mode === "self"
                    ? `${day.totalCount - day.pendingCount}/${day.totalCount}`
                    : `${day.totalCount}`}
                </div>
              </div>

              {visible.length === 0 && mode === "self" && day.totalCount > 0 && (
                <p className="text-[11px] text-emerald-700 italic">Todo completado ✓</p>
              )}
              {day.totalCount === 0 && (
                <p className="text-[11px] text-neutral-400 italic">Sin tareas</p>
              )}

              <div className="space-y-1">
                {visible.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-1.5 group"
                  >
                    {mode === "self" ? (
                      <button
                        onClick={() => complete(task.id)}
                        disabled={busy === task.id || task.completed}
                        className="mt-0.5 w-3.5 h-3.5 rounded border flex-shrink-0 transition-colors"
                        style={{
                          background: task.completed ? "#10B981" : "#FFFFFF",
                          borderColor: task.completed ? "#10B981" : "#D4D4D4",
                        }}
                        aria-label={`Marcar '${task.title}' como hecha`}
                      >
                        {task.completed && <CheckSquare size={12} className="text-white" />}
                      </button>
                    ) : (
                      <span
                        className="mt-0.5 w-3.5 h-3.5 rounded border flex-shrink-0 inline-flex items-center justify-center"
                        style={{
                          background: task.completed ? "#10B981" : "#FFFFFF",
                          borderColor: task.completed ? "#10B981" : "#D4D4D4",
                        }}
                        title={task.completed ? "Marcada por el profesional" : "Pendiente"}
                      >
                        {task.completed && <span className="text-white text-[10px] leading-none">✓</span>}
                      </span>
                    )}
                    <span
                      className={`text-xs flex-1 leading-tight ${task.completed ? "text-neutral-400 line-through" : "text-neutral-800"}`}
                    >
                      {task.title}
                    </span>
                    {mode === "ceo" && (
                      <button
                        onClick={() => removeTask(task.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400 hover:text-red-600 flex-shrink-0"
                        title="Borrar tarea"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {mode === "ceo" && (
                <div className="mt-2 pt-2 border-t border-neutral-200">
                  {adding === day.dayOfWeek ? (
                    <AddInput
                      onSubmit={(t) => addTask(day.dayOfWeek, t)}
                      onCancel={() => setAdding(null)}
                    />
                  ) : (
                    <button
                      onClick={() => setAdding(day.dayOfWeek)}
                      className="text-[11px] text-neutral-500 hover:text-neutral-900 flex items-center gap-1"
                    >
                      <Plus size={11} /> Añadir
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AddInput({ onSubmit, onCancel }: { onSubmit: (t: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(value); setValue(""); }}
      className="flex flex-col gap-1"
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        placeholder="Título de la tarea"
        className="text-xs px-1.5 py-1 rounded border border-neutral-300 focus:border-neutral-500 outline-none"
      />
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-[10px] text-neutral-500 px-1.5 py-0.5"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="text-[10px] font-medium px-2 py-0.5 rounded"
          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
        >
          Añadir
        </button>
      </div>
    </form>
  );
}
