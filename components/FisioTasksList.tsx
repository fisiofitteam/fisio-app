"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Task = {
  id: string;
  title: string;
  description: string;
  patientId: string | null;
  patientName: string;
  dueDate: string | null;
  completedAt: string | null;
  source: string;
  assignedBy: string;
  assignedTo: string;
  priority: string;
  recurrenceType: string;
  recurrenceDay: number | null;
};

const DAY_NAMES = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Profesionales disponibles del equipo (TODO: cuando integremos roles, vendrá de BD via props)
const TEAM_MEMBERS = ["Ales Faus", "Miguel Castro", "Alberto Melis", "Sofía Cáliz", "Blanca Garrido"];

const PRIORITY_ORDER = ["high", "medium", "low"];
const PRIORITY_LABELS: Record<string, string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
};
const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-neutral-100 text-neutral-600",
};

function recurrenceLabel(type: string, day: number | null): string {
  if (type === "none") return "";
  if (type === "daily") return "cada día";
  if (type === "weekly" && day) return `cada ${DAY_NAMES[day]?.toLowerCase()}`;
  if (type === "monthly" && day) return `día ${day} de cada mes`;
  return "";
}

export function FisioTasksList({
  tasks,
  patients,
}: {
  tasks: Task[];
  patients: { id: string; fullName: string }[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Task | null>(null);
  const [showNew, setShowNew] = useState<{ source: "own" | "team" } | null>(null);

  const ownTasks = tasks.filter((t) => t.source === "own");
  const teamTasks = tasks.filter((t) => t.source === "team");

  async function toggle(id: string, completed: boolean) {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, completedAt: completed ? new Date().toISOString() : null }),
    });
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar esta tarea?")) return;
    await fetch(`/api/tasks?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TaskColumn
          title="Propias"
          subtitle="Las que te pones tú o vienen de automatizaciones"
          tasks={ownTasks}
          onAdd={() => setShowNew({ source: "own" })}
          onEdit={setEditing}
          onToggle={toggle}
          onDelete={remove}
        />
        <TaskColumn
          title="Equipo"
          subtitle="Las que te asigna CEO o head coach"
          tasks={teamTasks}
          onAdd={() => setShowNew({ source: "team" })}
          onEdit={setEditing}
          onToggle={toggle}
          onDelete={remove}
        />
      </div>

      {(showNew || editing) && (
        <TaskModal
          task={editing}
          defaultSource={showNew?.source ?? "own"}
          patients={patients}
          onClose={() => { setShowNew(null); setEditing(null); }}
          onSaved={() => { setShowNew(null); setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function TaskColumn({
  title,
  subtitle,
  tasks,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
}: {
  title: string;
  subtitle: string;
  tasks: Task[];
  onAdd: () => void;
  onEdit: (t: Task) => void;
  onToggle: (id: string, c: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const pending = tasks.filter((t) => !t.completedAt);
  const done = tasks.filter((t) => t.completedAt);

  // Agrupar pendientes por prioridad
  const byPriority: Record<string, Task[]> = { high: [], medium: [], low: [] };
  for (const t of pending) {
    byPriority[t.priority ?? "medium"]?.push(t);
  }

  return (
    <section>
      <div className="flex justify-between items-start mb-3">
        <div>
          <h2 className="font-medium">{title}</h2>
          <p className="text-xs text-neutral-500">{subtitle}</p>
        </div>
        <button onClick={onAdd} className="btn btn-primary text-xs">+ Nueva</button>
      </div>

      {tasks.length === 0 && (
        <p className="text-xs text-neutral-400 text-center py-8 italic">
          No hay tareas en esta columna.
        </p>
      )}

      {PRIORITY_ORDER.map((prio) => {
        const list = byPriority[prio];
        if (!list || list.length === 0) return null;
        return (
          <div key={prio} className="mb-3">
            <div className={`text-xs font-medium uppercase mb-1 px-2 py-0.5 rounded inline-block ${PRIORITY_STYLES[prio]}`}>
              Prioridad {PRIORITY_LABELS[prio]}
            </div>
            <div className="space-y-2">
              {list.map((t) => (
                <TaskRow key={t.id} task={t} onEdit={() => onEdit(t)} onToggle={(c) => onToggle(t.id, c)} onDelete={() => onDelete(t.id)} />
              ))}
            </div>
          </div>
        );
      })}

      {done.length > 0 && (
        <div>
          <div className="text-xs text-neutral-400 uppercase font-medium mb-2 mt-3">Completadas</div>
          <div className="space-y-2 opacity-60">
            {done.slice(0, 5).map((t) => (
              <TaskRow key={t.id} task={t} onEdit={() => onEdit(t)} onToggle={(c) => onToggle(t.id, c)} onDelete={() => onDelete(t.id)} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function TaskRow({ task, onEdit, onToggle, onDelete }: { task: Task; onEdit: () => void; onToggle: (c: boolean) => void; onDelete: () => void }) {
  const completed = !!task.completedAt;
  const dueDays = task.dueDate ? Math.round((new Date(task.dueDate).getTime() - Date.now()) / 86400000) : null;
  const recurrence = recurrenceLabel(task.recurrenceType, task.recurrenceDay);
  const assignedList = task.assignedTo ? task.assignedTo.split(",").map((s) => s.trim()).filter(Boolean) : [];

  return (
    <div className="card !p-3 flex items-start gap-3">
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(!completed); }}
        className="mt-0.5 flex-shrink-0"
      >
        {completed ? "☑" : "☐"}
      </button>
      <button onClick={onEdit} className="flex-1 min-w-0 text-left">
        <div className={`text-sm font-medium ${completed ? "line-through text-neutral-400" : ""}`}>{task.title}</div>
        {task.description && <div className="text-xs text-neutral-500 mt-0.5 line-clamp-2">{task.description}</div>}
        <div className="text-xs text-neutral-500 mt-1 flex gap-3 flex-wrap">
          {task.patientName && <span>· {task.patientName}</span>}
          {task.assignedBy && <span className="text-amber-700">de {task.assignedBy}</span>}
          {assignedList.length > 0 && (
            <span className="text-blue-700">→ {assignedList.join(", ")}</span>
          )}
          {recurrence && <span className="text-blue-700">🔁 {recurrence}</span>}
          {task.dueDate && (
            <span className={dueDays !== null && dueDays < 0 ? "text-red-600" : dueDays !== null && dueDays <= 1 ? "text-amber-700" : ""}>
              {dueDays === null ? "" : dueDays < 0 ? `vencida hace ${-dueDays}d` : dueDays === 0 ? "hoy" : dueDays === 1 ? "mañana" : `en ${dueDays}d`}
            </span>
          )}
        </div>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="text-xs text-red-600 flex-shrink-0"
      >✕</button>
    </div>
  );
}

function TaskModal({
  task,
  defaultSource,
  patients,
  onClose,
  onSaved,
}: {
  task: Task | null;
  defaultSource: "own" | "team";
  patients: { id: string; fullName: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!task;
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [patientId, setPatientId] = useState(task?.patientId ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ? task.dueDate.split("T")[0] : "");
  const [source, setSource] = useState<"own" | "team">((task?.source as any) ?? defaultSource);
  const [assignedBy, setAssignedBy] = useState(task?.assignedBy ?? "");
  const [priority, setPriority] = useState(task?.priority ?? "medium");
  const [assignedTo, setAssignedTo] = useState<string[]>(
    task?.assignedTo ? task.assignedTo.split(",").map((s) => s.trim()).filter(Boolean) : []
  );
  const [recurrenceType, setRecurrenceType] = useState(task?.recurrenceType ?? "none");
  const [recurrenceDay, setRecurrenceDay] = useState<number | "">(task?.recurrenceDay ?? "");
  const [saving, setSaving] = useState(false);

  function toggleAssignee(name: string) {
    setAssignedTo((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    const payload = {
      ...(isEdit && { id: task!.id }),
      title,
      description,
      patientId: patientId || null,
      dueDate: dueDate || null,
      source,
      assignedBy: source === "team" ? assignedBy : null,
      assignedTo: source === "team" && assignedTo.length > 0 ? assignedTo.join(",") : null,
      priority,
      recurrenceType,
      recurrenceDay: (recurrenceType === "weekly" || recurrenceType === "monthly") && recurrenceDay !== "" ? Number(recurrenceDay) : null,
    };
    await fetch("/api/tasks", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-neutral-200 flex justify-between items-center sticky top-0 bg-white">
          <h3 className="font-medium">{isEdit ? "Editar tarea" : "Nueva tarea"}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Título</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Descripción (opcional)</label>
            <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Origen</label>
              <select className="input" value={source} onChange={(e) => setSource(e.target.value as any)}>
                <option value="own">Propia</option>
                <option value="team">Equipo</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Prioridad</label>
              <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="high">Alta</option>
                <option value="medium">Media</option>
                <option value="low">Baja</option>
              </select>
            </div>
          </div>

          {source === "team" && (
            <>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Asignada por</label>
                <input className="input" value={assignedBy} onChange={(e) => setAssignedBy(e.target.value)} placeholder="CEO, Head Coach..." />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Asignar a (múltiple)</label>
                <div className="flex gap-1 flex-wrap">
                  {TEAM_MEMBERS.map((m) => {
                    const active = assignedTo.includes(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => toggleAssignee(m)}
                        className={`text-xs px-2 py-1 rounded-full border ${
                          active ? "bg-blue-100 border-blue-300 text-blue-800" : "bg-white border-neutral-300 text-neutral-600"
                        }`}
                      >
                        {active && "✓ "}{m}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-neutral-400 mt-1 italic">
                  Cuando metamos roles reales esto vendrá del equipo de FisioFit.
                </p>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Paciente (opcional)</label>
              <select className="input" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                <option value="">— Sin paciente —</option>
                {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Fecha objetivo</label>
              <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div className="border-t border-neutral-100 pt-3">
            <label className="text-xs text-neutral-500 block mb-1">🔁 Recurrencia</label>
            <select className="input" value={recurrenceType} onChange={(e) => setRecurrenceType(e.target.value)}>
              <option value="none">Sin recurrencia</option>
              <option value="daily">Cada día</option>
              <option value="weekly">Cada semana</option>
              <option value="monthly">Cada mes</option>
            </select>
            {recurrenceType === "weekly" && (
              <div className="mt-2">
                <label className="text-xs text-neutral-500 block mb-1">Día de la semana</label>
                <div className="flex gap-1">
                  {DAY_NAMES.slice(1).map((label, i) => {
                    const dayNum = i + 1;
                    const active = recurrenceDay === dayNum;
                    return (
                      <button
                        key={i}
                        onClick={() => setRecurrenceDay(dayNum)}
                        className={`flex-1 py-2 text-xs rounded ${active ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {recurrenceType === "monthly" && (
              <div className="mt-2">
                <label className="text-xs text-neutral-500 block mb-1">Día del mes (1-31)</label>
                <input
                  type="number"
                  className="input"
                  min={1}
                  max={31}
                  value={recurrenceDay}
                  onChange={(e) => setRecurrenceDay(e.target.value ? Number(e.target.value) : "")}
                />
              </div>
            )}
            {recurrenceType !== "none" && (
              <p className="text-xs text-neutral-400 mt-2 italic">
                Al completar esta tarea, se creará una nueva copia con la siguiente fecha. Mantendrás el historial.
              </p>
            )}
          </div>

          <button onClick={save} disabled={!title.trim() || saving} className="btn btn-primary w-full">
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear tarea"}
          </button>
        </div>
      </div>
    </div>
  );
}
