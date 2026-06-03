"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, CalendarRange } from "lucide-react";

type AdHocTask = {
  id: string;
  title: string;
  targetRole: string;
  kind: "monthly" | "range";
  dayOfMonth: number | null;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
};

/**
 * Editor de tareas puntuales (mensuales o rango de fechas) por rol.
 * Usado por CEO (fisio + head_success) y head_success (solo fisio).
 */
export function AdHocTasksManager({
  role,
  initialTasks,
  canCreateThisRole,
}: {
  role: "fisio" | "head_success";
  initialTasks: AdHocTask[];
  /** Si false, solo lista en read-only (no se puede crear/borrar para este rol). */
  canCreateThisRole: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function remove(taskId: string) {
    if (!confirm("¿Borrar esta tarea? Se elimina también su historial de completaciones.")) return;
    await fetch(`/api/team-tasks-adhoc/${taskId}`, { method: "DELETE" }).catch(() => {});
    router.refresh();
  }

  async function toggleActive(task: AdHocTask) {
    await fetch(`/api/team-tasks-adhoc/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !task.active }),
    }).catch(() => {});
    router.refresh();
  }

  function fmtSchedule(t: AdHocTask): string {
    if (t.kind === "monthly") return `día ${t.dayOfMonth} de cada mes`;
    if (!t.startDate || !t.endDate) return "—";
    const s = new Date(t.startDate);
    const e = new Date(t.endDate);
    return `${s.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} → ${e.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}`;
  }

  return (
    <section className="card">
      <div className="flex items-baseline justify-between mb-3 gap-2 flex-wrap">
        <h3 className="text-sm font-medium flex items-center gap-1.5">
          <CalendarRange size={14} className="text-neutral-500" />
          Tareas puntuales · {role === "fisio" ? "Fisios" : "Head Success"}
        </h3>
        {canCreateThisRole && !creating && (
          <button
            onClick={() => setCreating(true)}
            className="text-xs font-medium px-2.5 py-1 rounded-lg flex items-center gap-1"
            style={{ background: "#0A0A0A", color: "#FAFAFA" }}
          >
            <Plus size={11} /> Nueva tarea
          </button>
        )}
      </div>

      {creating && (
        <NewTaskForm
          role={role}
          onCancel={() => setCreating(false)}
          onCreated={() => { setCreating(false); router.refresh(); }}
        />
      )}

      {initialTasks.length === 0 ? (
        <p className="text-xs text-neutral-400 italic text-center py-4">
          Aún no hay tareas puntuales para este rol.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 mt-2">
          {initialTasks.map((t) => (
            <li key={t.id} className="py-2 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className={`text-sm ${t.active ? "text-neutral-800" : "text-neutral-400 line-through"}`}>
                  {t.title}
                </div>
                <div className="text-[11px] text-neutral-500 mt-0.5">
                  {t.kind === "monthly" ? "📅 Mensual" : "📆 Rango"} · {fmtSchedule(t)}
                </div>
              </div>
              {canCreateThisRole && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => toggleActive(t)}
                    className="text-[10px] text-neutral-500 hover:text-neutral-900 px-2 py-1"
                    title={t.active ? "Desactivar" : "Activar"}
                  >
                    {t.active ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    onClick={() => remove(t.id)}
                    className="text-neutral-400 hover:text-red-600 p-1"
                    title="Borrar"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NewTaskForm({
  role,
  onCancel,
  onCreated,
}: {
  role: "fisio" | "head_success";
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"monthly" | "range">("monthly");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    if (!title.trim()) return setError("Título obligatorio");
    setSaving(true);
    const body: any = { title: title.trim(), targetRole: role, kind };
    if (kind === "monthly") body.dayOfMonth = Number(dayOfMonth);
    else { body.startDate = startDate; body.endDate = endDate; }
    const res = await fetch("/api/team-tasks-adhoc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) onCreated();
    else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "No se pudo crear");
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg p-3 mb-2" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
      <div className="space-y-2">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título de la tarea"
          className="text-sm px-2 py-1.5 rounded border border-neutral-300 w-full outline-none focus:border-neutral-500"
        />
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setKind("monthly")}
            className={`text-xs px-2.5 py-1 rounded-lg border ${kind === "monthly" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300 text-neutral-600"}`}
          >
            📅 Mensual
          </button>
          <button
            type="button"
            onClick={() => setKind("range")}
            className={`text-xs px-2.5 py-1 rounded-lg border ${kind === "range" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300 text-neutral-600"}`}
          >
            📆 Rango de fechas
          </button>
        </div>

        {kind === "monthly" ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-neutral-500">Día del mes</span>
            <input
              type="number"
              min={1}
              max={31}
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)}
              className="text-xs px-2 py-1 rounded border border-neutral-300 w-16 text-center"
            />
            <span className="text-neutral-500">de cada mes</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Inicio</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input text-xs w-full" />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Fin</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input text-xs w-full" />
            </div>
          </div>
        )}

        {error && <div className="text-xs text-red-700">{error}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCancel} className="text-xs text-neutral-500 px-2 py-1">Cancelar</button>
          <button
            onClick={save}
            disabled={saving}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
            style={{ background: "#0A0A0A", color: "#FAFAFA" }}
          >
            {saving ? "..." : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}
