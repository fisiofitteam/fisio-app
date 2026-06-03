"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, CalendarRange, Users } from "lucide-react";

type AdHocTask = {
  id: string;
  title: string;
  description: string | null;
  targetRole: string;
  kind: "monthly" | "monthly_weekday" | "range";
  dayOfMonth: number | null;
  nthWeek: number | null;
  dayOfWeek: number | null;
  startDate: string | null;
  endDate: string | null;
  assigneeIds: string[];
  active: boolean;
};

type ProfessionalLite = { id: string; fullName: string };

const NTH_LABELS: Record<number, string> = { 1: "1er", 2: "2º", 3: "3er", 4: "4º", [-1]: "último" };
const DAY_NAMES_LONG = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

function fmtSchedule(t: AdHocTask): string {
  if (t.kind === "monthly") return `día ${t.dayOfMonth} de cada mes`;
  if (t.kind === "monthly_weekday" && t.nthWeek != null && t.dayOfWeek != null) {
    return `${NTH_LABELS[t.nthWeek] ?? `${t.nthWeek}º`} ${DAY_NAMES_LONG[t.dayOfWeek] ?? ""} de cada mes`;
  }
  if (!t.startDate || !t.endDate) return "—";
  const s = new Date(t.startDate), e = new Date(t.endDate);
  return `${s.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} → ${e.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}`;
}

function fmtAssignees(t: AdHocTask, professionals: ProfessionalLite[], roleLabel: string): string {
  if (t.assigneeIds.length === 0) return `Todos los ${roleLabel}`;
  const map = new Map(professionals.map((p) => [p.id, p.fullName]));
  const names = t.assigneeIds.map((id) => map.get(id) || "?").filter(Boolean);
  return names.join(", ");
}

export function AdHocTasksManager({
  role,
  initialTasks,
  professionals,
  canCreateThisRole,
}: {
  role: "fisio" | "head_success";
  initialTasks: AdHocTask[];
  professionals: ProfessionalLite[];
  canCreateThisRole: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const roleLabel = role === "fisio" ? "fisios" : "head success";

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
          professionals={professionals}
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
                {t.description && (
                  <div className="text-[11px] text-neutral-600 mt-0.5 whitespace-pre-wrap line-clamp-3">
                    {t.description}
                  </div>
                )}
                <div className="text-[11px] text-neutral-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>
                    {t.kind === "range" ? "📆 Rango" : "📅 Mensual"} · {fmtSchedule(t)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users size={10} className="text-neutral-400" />
                    {fmtAssignees(t, professionals, roleLabel)}
                  </span>
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
  professionals,
  onCancel,
  onCreated,
}: {
  role: "fisio" | "head_success";
  professionals: ProfessionalLite[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"monthly" | "monthly_weekday" | "range">("monthly");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [nthWeek, setNthWeek] = useState("1");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [assignToAll, setAssignToAll] = useState(true);
  const [assigneeIds, setAssigneeIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setError("");
    if (!title.trim()) return setError("Título obligatorio");
    if (!assignToAll && assigneeIds.size === 0) {
      return setError("Elige al menos una persona o marca 'Todos'");
    }
    setSaving(true);
    const body: any = {
      title: title.trim(),
      description: description.trim() || null,
      targetRole: role,
      kind,
      assigneeIds: assignToAll ? [] : Array.from(assigneeIds),
    };
    if (kind === "monthly") body.dayOfMonth = Number(dayOfMonth);
    else if (kind === "monthly_weekday") {
      body.nthWeek = Number(nthWeek);
      body.dayOfWeek = Number(dayOfWeek);
    } else {
      body.startDate = startDate;
      body.endDate = endDate;
    }
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
      <div className="space-y-3">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título de la tarea"
          className="text-sm px-2 py-1.5 rounded border border-neutral-300 w-full outline-none focus:border-neutral-500"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción / notas (opcional). Útil para pegar formularios, links o instrucciones largas."
          rows={3}
          className="text-xs px-2 py-1.5 rounded border border-neutral-300 w-full outline-none focus:border-neutral-500 resize-y"
        />

        <div className="flex gap-1 flex-wrap">
          <button type="button" onClick={() => setKind("monthly")} className={pillBtn(kind === "monthly")}>📅 Día X del mes</button>
          <button type="button" onClick={() => setKind("monthly_weekday")} className={pillBtn(kind === "monthly_weekday")}>🗓 1er lunes / Nº dow del mes</button>
          <button type="button" onClick={() => setKind("range")} className={pillBtn(kind === "range")}>📆 Rango de fechas</button>
        </div>

        {kind === "monthly" && (
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
        )}

        {kind === "monthly_weekday" && (
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-neutral-500">El</span>
            <select
              value={nthWeek}
              onChange={(e) => setNthWeek(e.target.value)}
              className="input text-xs w-auto"
            >
              <option value="1">1er</option>
              <option value="2">2º</option>
              <option value="3">3er</option>
              <option value="4">4º</option>
              <option value="-1">último</option>
            </select>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(e.target.value)}
              className="input text-xs w-auto"
            >
              <option value="1">lunes</option>
              <option value="2">martes</option>
              <option value="3">miércoles</option>
              <option value="4">jueves</option>
              <option value="5">viernes</option>
              <option value="6">sábado</option>
              <option value="7">domingo</option>
            </select>
            <span className="text-neutral-500">de cada mes</span>
          </div>
        )}

        {kind === "range" && (
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

        {/* Asignados */}
        <div className="pt-2 border-t border-neutral-200">
          <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Users size={11} /> Asignar a
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer mb-1.5">
            <input
              type="checkbox"
              checked={assignToAll}
              onChange={(e) => setAssignToAll(e.target.checked)}
              className="w-3.5 h-3.5"
            />
            <span className="font-medium">Todos los {role === "fisio" ? "fisios" : "head success"}</span>
          </label>
          {!assignToAll && (
            <div className="space-y-0.5 pl-5">
              {professionals.length === 0 ? (
                <p className="text-[11px] text-neutral-400 italic">No hay {role === "fisio" ? "fisios" : "head success"} disponibles.</p>
              ) : (
                professionals.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      checked={assigneeIds.has(p.id)}
                      onChange={() => toggleAssignee(p.id)}
                      className="w-3.5 h-3.5"
                    />
                    <span>{p.fullName}</span>
                  </label>
                ))
              )}
            </div>
          )}
        </div>

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

function pillBtn(active: boolean): string {
  return `text-xs px-2.5 py-1 rounded-lg border ${active ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300 text-neutral-600"}`;
}
