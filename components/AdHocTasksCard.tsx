"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange } from "lucide-react";
import type { AdHocTaskItem } from "@/lib/team-tasks-adhoc";

/**
 * Tarjeta del panel con las tareas puntuales (mensual / por rango) vigentes
 * HOY para el profesional. Al marcar como hecha, la tarea desaparece (igual
 * comportamiento que el board semanal).
 */
export function AdHocTasksCard({ tasks }: { tasks: AdHocTaskItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

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

  // Filtramos: ya solo mostramos las pendientes (las completadas desaparecen).
  const visible = tasks.filter((t) => !t.completed);

  if (tasks.length === 0) return null;

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
        <div className="space-y-1.5">
          {visible.map((task) => (
            <div key={task.id} className="flex items-start gap-2">
              <button
                onClick={() => complete(task.id)}
                disabled={busy === task.id}
                className="mt-0.5 w-4 h-4 rounded border flex-shrink-0 transition-colors"
                style={{ background: "#FFFFFF", borderColor: "#D4D4D4" }}
                aria-label={`Marcar '${task.title}' como hecha`}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-neutral-800">{task.title}</div>
                <div className="text-[10px] text-neutral-500 mt-0.5">
                  {task.kind === "monthly" ? "📅 Mensual · " : "📆 Rango · "}
                  {task.scheduleLabel}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
