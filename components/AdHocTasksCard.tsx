"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, ChevronDown, ChevronUp } from "lucide-react";
import type { AdHocTaskItem } from "@/lib/team-tasks-adhoc";

/**
 * Tarjeta del panel con las tareas puntuales (mensual / 1er dow del mes /
 * rango) vigentes HOY para el profesional. Al marcar como hecha, desaparece.
 * Si la tarea tiene descripción, hay un toggle "ver más" para expandirla.
 */
export function AdHocTasksCard({ tasks }: { tasks: AdHocTaskItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function complete(taskId: string) {
    setBusy(taskId);
    await fetch("/api/team-tasks-adhoc/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId }),
    }).catch(() => {});
    setBusy(null);
    router.refresh();
  }

  function toggleExpand(taskId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  const visible = tasks.filter((t) => !t.completed);
  if (tasks.length === 0) return null;

  function kindEmoji(kind: AdHocTaskItem["kind"]): string {
    if (kind === "monthly") return "📅 Mensual";
    if (kind === "monthly_weekday") return "🗓 Mensual";
    return "📆 Rango";
  }

  return (
    <section className="card">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h2 className="font-medium text-sm flex items-center gap-2">
          <CalendarRange size={16} className="text-neutral-500" />
          Tareas puntuales
        </h2>
        <span className="text-[11px] text-neutral-400">
          {visible.length} pendiente{visible.length === 1 ? "" : "s"} · {tasks.length} total
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="text-xs text-emerald-700 italic">Todo completado por ahora ✓</p>
      ) : (
        <div className="space-y-2">
          {visible.map((task) => {
            const isOpen = expanded.has(task.id);
            const hasDesc = !!task.description && task.description.trim().length > 0;
            return (
              <div key={task.id} className="flex items-start gap-2">
                <button
                  onClick={() => complete(task.id)}
                  disabled={busy === task.id}
                  className="mt-0.5 w-4 h-4 rounded border flex-shrink-0 transition-colors"
                  style={{ background: "#FFFFFF", borderColor: "#D4D4D4" }}
                  aria-label={`Marcar '${task.title}' como hecha`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm text-neutral-800">{task.title}</span>
                    {hasDesc && (
                      <button
                        onClick={() => toggleExpand(task.id)}
                        className="text-[10px] text-neutral-500 hover:text-neutral-900 flex items-center gap-0.5"
                      >
                        {isOpen ? <><ChevronUp size={10} /> ocultar</> : <><ChevronDown size={10} /> ver detalle</>}
                      </button>
                    )}
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">
                    {kindEmoji(task.kind)} · {task.scheduleLabel}
                  </div>
                  {hasDesc && isOpen && (
                    <div className="mt-2 text-xs text-neutral-700 whitespace-pre-wrap bg-neutral-50 rounded p-2 border border-neutral-200">
                      {task.description}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
