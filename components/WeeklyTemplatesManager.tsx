"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FORMATS, GOALS, GOAL_COLOR_CLASSES, type FormatKey, type GoalKey, formatIcon, formatLabelOnly, goalColor } from "@/lib/content-formats";

type Day = {
  dayOfWeek: number;
  title: string;
  format: string;
  goals: string[];
};

type WeeklyTemplate = {
  id: string;
  name: string;
  description: string | null;
  days: Day[];
  updatedAt: string;
};

const DAY_LABELS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function emptyDays(): Day[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i + 1,
    title: "",
    format: "",
    goals: [],
  }));
}

type Props = {
  initialTemplates: WeeklyTemplate[];
  canEdit: boolean;
};

export function WeeklyTemplatesManager({ initialTemplates, canEdit }: Props) {
  const router = useRouter();
  const [templates, setTemplates] = useState<WeeklyTemplate[]>(initialTemplates);
  const [editing, setEditing] = useState<WeeklyTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  function refresh() {
    router.refresh();
  }

  async function handleCreate(draft: { name: string; description: string | null; days: Day[] }) {
    const res = await fetch("/api/weekly-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (!res.ok) {
      alert("Error al crear la plantilla");
      return;
    }
    const data = await res.json();
    setTemplates((prev) => [...prev, data.template]);
    setCreating(false);
    refresh();
  }

  async function handleUpdate(id: string, draft: { name: string; description: string | null; days: Day[] }) {
    const res = await fetch("/api/weekly-templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...draft }),
    });
    if (!res.ok) {
      alert("Error al actualizar");
      return;
    }
    const data = await res.json();
    setTemplates((prev) => prev.map((t) => (t.id === id ? data.template : t)));
    setEditing(null);
    refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Borrar esta plantilla semanal? No se puede deshacer.")) return;
    const res = await fetch(`/api/weekly-templates?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("Error al borrar");
      return;
    }
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    refresh();
  }

  return (
    <section className="mb-10">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Plantillas semanales</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Configura semanas tipo (título, formato y objetivos por día). Al crear una semana podrás elegir cuál aplicar.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setCreating(true)}
            className="text-sm px-3 py-1.5 rounded-md bg-neutral-900 text-white hover:bg-neutral-800"
          >
            + Nueva plantilla
          </button>
        )}
      </header>

      {templates.length === 0 ? (
        <p className="text-sm text-neutral-400 italic">Aún no hay plantillas semanales.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              canEdit={canEdit}
              onEdit={() => setEditing(t)}
              onDelete={() => handleDelete(t.id)}
            />
          ))}
        </div>
      )}

      {creating && canEdit && (
        <TemplateModal
          initial={null}
          onCancel={() => setCreating(false)}
          onSave={handleCreate}
        />
      )}
      {editing && canEdit && (
        <TemplateModal
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={(draft) => handleUpdate(editing.id, draft)}
        />
      )}
    </section>
  );
}

// ─── Card de visualización ────────────────────────────────────────────

function TemplateCard({
  template,
  canEdit,
  onEdit,
  onDelete,
}: {
  template: WeeklyTemplate;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="border border-neutral-200 rounded-lg p-4 bg-white">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="font-medium">{template.name}</div>
          {template.description && (
            <div className="text-xs text-neutral-500 mt-0.5">{template.description}</div>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-1 shrink-0">
            <button
              onClick={onEdit}
              className="text-xs px-2 py-1 rounded border border-neutral-300 hover:bg-neutral-50"
            >
              ✏️ Editar
            </button>
            <button
              onClick={onDelete}
              className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
            >
              🗑
            </button>
          </div>
        )}
      </div>
      <div className="space-y-1">
        {template.days.map((d) => (
          <div key={d.dayOfWeek} className="flex items-center gap-2 text-xs">
            <span className="text-neutral-500 w-16 shrink-0">{DAY_LABELS[d.dayOfWeek]}</span>
            <span className="shrink-0">
              {d.format ? `${formatIcon(d.format)} ${formatLabelOnly(d.format)}` : <span className="text-neutral-300">—</span>}
            </span>
            {d.title && <span className="text-neutral-700 truncate">· {d.title}</span>}
            {d.goals.length > 0 && (
              <div className="flex gap-1 ml-auto shrink-0">
                {d.goals.map((g) => (
                  <span key={g} className={`text-[10px] px-1.5 py-0.5 rounded-full ${GOAL_COLOR_CLASSES[goalColor(g)]}`}>
                    {g}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Modal crear/editar ────────────────────────────────────────────────

function TemplateModal({
  initial,
  onSave,
  onCancel,
}: {
  initial: WeeklyTemplate | null;
  onSave: (draft: { name: string; description: string | null; days: Day[] }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [days, setDays] = useState<Day[]>(() => {
    if (!initial) return emptyDays();
    // Asegurar 7 días en orden
    const byDow = new Map(initial.days.map((d) => [d.dayOfWeek, d]));
    return Array.from({ length: 7 }, (_, i) => byDow.get(i + 1) ?? { dayOfWeek: i + 1, title: "", format: "", goals: [] });
  });

  // Esc para cerrar
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function updateDay(idx: number, patch: Partial<Day>) {
    setDays((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }

  function toggleGoal(idx: number, g: GoalKey) {
    setDays((prev) =>
      prev.map((d, i) => {
        if (i !== idx) return d;
        const next = d.goals.includes(g) ? d.goals.filter((x) => x !== g) : [...d.goals, g];
        return { ...d, goals: next };
      })
    );
  }

  function handleSave() {
    if (!name.trim()) {
      alert("Pon un nombre a la plantilla");
      return;
    }
    onSave({
      name: name.trim(),
      description: description.trim() || null,
      days,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onCancel}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{initial ? "Editar plantilla semanal" : "Nueva plantilla semanal"}</h3>
          <button
            onClick={onCancel}
            className="text-neutral-400 hover:text-neutral-900 text-xl leading-none"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {/* Contenido */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Nombre</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Semana educativa estándar"
              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Descripción <span className="text-neutral-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notas para distinguir esta plantilla"
              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded"
            />
          </div>

          <div className="border-t border-neutral-200 pt-4">
            <h4 className="text-sm font-medium text-neutral-700 mb-3">Días de la semana</h4>
            <div className="space-y-3">
              {days.map((d, idx) => (
                <DayRow
                  key={d.dayOfWeek}
                  day={d}
                  onUpdate={(patch) => updateDay(idx, patch)}
                  onToggleGoal={(g) => toggleGoal(idx, g)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="sticky bottom-0 bg-white border-t border-neutral-200 px-6 py-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="text-sm px-4 py-2 rounded border border-neutral-300 hover:bg-neutral-100"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="text-sm px-4 py-2 rounded bg-neutral-900 text-white hover:bg-neutral-800"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function DayRow({
  day,
  onUpdate,
  onToggleGoal,
}: {
  day: Day;
  onUpdate: (patch: Partial<Day>) => void;
  onToggleGoal: (g: GoalKey) => void;
}) {
  return (
    <div className="border border-neutral-200 rounded-lg p-3 bg-neutral-50/50">
      <div className="flex items-center gap-3 mb-2">
        <span className="font-medium text-sm w-20 shrink-0">{DAY_LABELS[day.dayOfWeek]}</span>
        <select
          value={day.format}
          onChange={(e) => onUpdate({ format: e.target.value })}
          className="text-sm px-2 py-1 border border-neutral-300 rounded bg-white"
        >
          <option value="">— sin formato —</option>
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.icon} {f.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={day.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder="Título (opcional)"
          className="flex-1 text-sm px-2 py-1 border border-neutral-300 rounded bg-white"
        />
      </div>
      <div className="flex items-center gap-1.5 flex-wrap pl-20">
        <span className="text-[11px] text-neutral-500">Objetivos:</span>
        {GOALS.map((g) => {
          const active = day.goals.includes(g.value);
          return (
            <button
              key={g.value}
              type="button"
              onClick={() => onToggleGoal(g.value)}
              className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                active
                  ? GOAL_COLOR_CLASSES[g.color]
                  : "bg-white border-neutral-200 text-neutral-400 hover:border-neutral-400"
              }`}
            >
              {g.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
