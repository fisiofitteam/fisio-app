"use client";

import { useState } from "react";

type Block = { id: string; label: string; order: number };

type Day = {
  id: string;
  dayOfWeek: number;
  format: string;
  goal: string;
  ctaType: string;
  defaultDmKeyword: string;
  blocks: Block[];
  storyChecklist: string[];
  updatedAt: string;
};

const DAY_LABELS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const FORMAT_OPTIONS = [
  { value: "belief_carousel", label: "Carrusel creencia" },
  { value: "case_reel", label: "Reel caso éxito" },
  { value: "value_carousel", label: "Carrusel valor" },
  { value: "value_reel", label: "Reel valor" },
  { value: "exercises_carousel", label: "Carrusel ejercicios" },
  { value: "infographic", label: "Infografía" },
  { value: "closing_reel", label: "Reel cierre" },
];

export function ContentTemplateEditor({ days: initialDays, canEdit }: { days: Day[]; canEdit: boolean }) {
  const [days, setDays] = useState<Day[]>(initialDays);
  const [expandedDow, setExpandedDow] = useState<number | null>(null);
  const [editingDow, setEditingDow] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      {days.map((day) => {
        const isExpanded = expandedDow === day.dayOfWeek;
        const isEditing = editingDow === day.dayOfWeek;
        return (
          <DayCard
            key={day.id}
            day={day}
            canEdit={canEdit}
            isExpanded={isExpanded}
            isEditing={isEditing}
            onToggle={() => setExpandedDow(isExpanded ? null : day.dayOfWeek)}
            onEdit={() => {
              setExpandedDow(day.dayOfWeek);
              setEditingDow(day.dayOfWeek);
            }}
            onCancel={() => setEditingDow(null)}
            onSaved={(updated) => {
              setDays(days.map((d) => (d.dayOfWeek === updated.dayOfWeek ? updated : d)));
              setEditingDow(null);
            }}
          />
        );
      })}
    </div>
  );
}

function DayCard({
  day,
  canEdit,
  isExpanded,
  isEditing,
  onToggle,
  onEdit,
  onCancel,
  onSaved,
}: {
  day: Day;
  canEdit: boolean;
  isExpanded: boolean;
  isEditing: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: (d: Day) => void;
}) {
  const formatLabel = FORMAT_OPTIONS.find((f) => f.value === day.format)?.label || day.format;

  return (
    <section className="card">
      {/* Header siempre visible */}
      <div className="flex justify-between items-start gap-3">
        <button onClick={onToggle} className="flex-1 text-left">
          <div className="flex items-baseline gap-2">
            <span className="font-medium">{DAY_LABELS[day.dayOfWeek]}</span>
            <span className="text-xs text-neutral-500">·</span>
            <span className="text-xs text-neutral-700">{formatLabel}</span>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">{day.goal || <span className="italic">Sin objetivo</span>}</p>
        </button>
        {canEdit && !isEditing && (
          <button onClick={onEdit} className="text-xs text-blue-700 hover:underline whitespace-nowrap">
            ✏️ Editar
          </button>
        )}
      </div>

      {/* Vista expandida (lectura) */}
      {isExpanded && !isEditing && (
        <div className="mt-4 pt-4 border-t border-neutral-100 space-y-3 text-xs">
          <ReadField label="CTA" value={day.ctaType} />
          <ReadField label="DM keyword" value={day.defaultDmKeyword || "—"} />
          <div>
            <div className="text-neutral-500 mb-1">Bloques ({day.blocks.length})</div>
            <ul className="list-disc list-inside text-neutral-800 space-y-0.5">
              {day.blocks.map((b) => (
                <li key={b.id}>{b.label}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-neutral-500 mb-1">Story checklist ({day.storyChecklist.length})</div>
            <ul className="list-disc list-inside text-neutral-800 space-y-0.5">
              {day.storyChecklist.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Vista de edición */}
      {isEditing && <EditForm day={day} onCancel={onCancel} onSaved={onSaved} />}
    </section>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2">
      <span className="text-neutral-500">{label}</span>
      <span className="text-neutral-800">{value}</span>
    </div>
  );
}

function EditForm({
  day,
  onCancel,
  onSaved,
}: {
  day: Day;
  onCancel: () => void;
  onSaved: (d: Day) => void;
}) {
  const [format, setFormat] = useState(day.format);
  const [goal, setGoal] = useState(day.goal);
  const [ctaType, setCtaType] = useState(day.ctaType);
  const [defaultDmKeyword, setDefaultDmKeyword] = useState(day.defaultDmKeyword);
  const [blocks, setBlocks] = useState<Block[]>(day.blocks);
  const [storyChecklist, setStoryChecklist] = useState<string[]>(day.storyChecklist);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ── Bloques ──
  function updateBlock(idx: number, label: string) {
    setBlocks(blocks.map((b, i) => (i === idx ? { ...b, label } : b)));
  }
  function addBlock() {
    const newIdx = blocks.length;
    setBlocks([...blocks, { id: `block_${Date.now()}`, label: "", order: newIdx }]);
  }
  function removeBlock(idx: number) {
    setBlocks(blocks.filter((_, i) => i !== idx).map((b, i) => ({ ...b, order: i })));
  }
  function moveBlock(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= blocks.length) return;
    const next = [...blocks];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setBlocks(next.map((b, i) => ({ ...b, order: i })));
  }

  // ── Story checklist ──
  function updateStory(idx: number, value: string) {
    setStoryChecklist(storyChecklist.map((s, i) => (i === idx ? value : s)));
  }
  function addStory() {
    setStoryChecklist([...storyChecklist, ""]);
  }
  function removeStory(idx: number) {
    setStoryChecklist(storyChecklist.filter((_, i) => i !== idx));
  }

  async function save() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/content/template", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayOfWeek: day.dayOfWeek,
          format,
          goal,
          ctaType,
          defaultDmKeyword,
          blocks: blocks.filter((b) => b.label.trim()),
          storyChecklist: storyChecklist.filter((s) => s.trim()),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");
      onSaved(data.day);
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-neutral-100 space-y-3 text-sm">
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Formato</label>
        <select className="input text-sm" value={format} onChange={(e) => setFormat(e.target.value)}>
          {FORMAT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-neutral-500 block mb-1">Objetivo</label>
        <input className="input text-sm" value={goal} onChange={(e) => setGoal(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-neutral-500 block mb-1">CTA</label>
          <input className="input text-sm" value={ctaType} onChange={(e) => setCtaType(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">DM keyword</label>
          <input className="input text-sm" value={defaultDmKeyword} onChange={(e) => setDefaultDmKeyword(e.target.value)} placeholder="(opcional)" />
        </div>
      </div>

      {/* Bloques */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="text-xs text-neutral-500">Bloques de guion</label>
          <button onClick={addBlock} className="text-xs text-blue-700 hover:underline">+ añadir</button>
        </div>
        <div className="space-y-1">
          {blocks.length === 0 && <p className="text-xs text-neutral-400 italic">Sin bloques. Pulsa "añadir".</p>}
          {blocks.map((b, idx) => (
            <div key={b.id} className="flex gap-1 items-center">
              <span className="text-xs text-neutral-400 w-5">{idx + 1}.</span>
              <input
                className="input text-sm flex-1"
                value={b.label}
                onChange={(e) => updateBlock(idx, e.target.value)}
                placeholder="Título del bloque"
              />
              <button onClick={() => moveBlock(idx, -1)} disabled={idx === 0} className="text-xs px-1 text-neutral-500 disabled:opacity-30">▲</button>
              <button onClick={() => moveBlock(idx, 1)} disabled={idx === blocks.length - 1} className="text-xs px-1 text-neutral-500 disabled:opacity-30">▼</button>
              <button onClick={() => removeBlock(idx)} className="text-xs px-1 text-red-600">✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Story checklist */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="text-xs text-neutral-500">Story checklist</label>
          <button onClick={addStory} className="text-xs text-blue-700 hover:underline">+ añadir</button>
        </div>
        <div className="space-y-1">
          {storyChecklist.length === 0 && <p className="text-xs text-neutral-400 italic">Sin stories.</p>}
          {storyChecklist.map((s, idx) => (
            <div key={idx} className="flex gap-1 items-center">
              <span className="text-xs text-neutral-400 w-5">{idx + 1}.</span>
              <input
                className="input text-sm flex-1"
                value={s}
                onChange={(e) => updateStory(idx, e.target.value)}
                placeholder="Descripción de la story"
              />
              <button onClick={() => removeStory(idx)} className="text-xs px-1 text-red-600">✕</button>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} disabled={saving} className="btn text-sm">Cancelar</button>
        <button onClick={save} disabled={saving} className="btn btn-primary text-sm">
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
