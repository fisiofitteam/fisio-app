"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FORMATS, type FormatKey, formatLabel } from "@/lib/content-formats";

// Plantillas de guion solo aplican a reel y carrusel
const SCRIPT_FORMATS = FORMATS.filter((f) => f.value === "reel" || f.value === "carousel");

type Block = { id: string; label: string; order: number };

type ScriptTemplate = {
  id: string;
  name: string;
  format: string;
  blocks: Block[];
  description: string | null;
  updatedAt: string;
};

type Props = {
  initialTemplates: ScriptTemplate[];
  canEdit: boolean;
};

export function ScriptTemplatesManager({ initialTemplates, canEdit }: Props) {
  const router = useRouter();
  const [templates, setTemplates] = useState<ScriptTemplate[]>(initialTemplates);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function refresh() {
    router.refresh();
  }

  async function handleCreate(draft: Omit<ScriptTemplate, "id" | "updatedAt">) {
    const res = await fetch("/api/script-templates", {
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

  async function handleUpdate(id: string, patch: Partial<ScriptTemplate>) {
    const res = await fetch("/api/script-templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!res.ok) {
      alert("Error al actualizar");
      return;
    }
    const data = await res.json();
    setTemplates((prev) => prev.map((t) => (t.id === id ? data.template : t)));
    setEditingId(null);
    refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Borrar esta plantilla? No se puede deshacer.")) return;
    const res = await fetch(`/api/script-templates?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("Error al borrar");
      return;
    }
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    refresh();
  }

  // Agrupar por formato
  const grouped: Record<string, ScriptTemplate[]> = {};
  for (const f of SCRIPT_FORMATS) grouped[f.value] = [];
  for (const t of templates) {
    if (!grouped[t.format]) grouped[t.format] = [];
    grouped[t.format].push(t);
  }

  return (
    <section className="mt-10 pt-8 border-t border-neutral-200">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Plantillas de guion</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Estructuras reutilizables de bloques por formato. Se pueden aplicar dentro de cada pieza desde el editor.
          </p>
        </div>
        {canEdit && !creating && (
          <button
            onClick={() => setCreating(true)}
            className="text-sm px-3 py-1.5 rounded-md bg-neutral-900 text-white hover:bg-neutral-800"
          >
            + Nueva plantilla
          </button>
        )}
      </header>

      {creating && canEdit && (
        <TemplateForm
          onCancel={() => setCreating(false)}
          onSave={(draft) => handleCreate(draft)}
        />
      )}

      <div className="space-y-6">
        {SCRIPT_FORMATS.map((f) => {
          const list = grouped[f.value] || [];
          return (
            <div key={f.value}>
              <h3 className="text-sm font-medium text-neutral-700 mb-2">
                {f.icon} {f.label}
                <span className="text-neutral-400 font-normal ml-2">({list.length})</span>
              </h3>
              {list.length === 0 ? (
                <p className="text-xs text-neutral-400 italic pl-1">Sin plantillas</p>
              ) : (
                <div className="space-y-2">
                  {list.map((t) =>
                    editingId === t.id && canEdit ? (
                      <TemplateForm
                        key={t.id}
                        initial={t}
                        onCancel={() => setEditingId(null)}
                        onSave={(draft) => handleUpdate(t.id, draft)}
                      />
                    ) : (
                      <TemplateCard
                        key={t.id}
                        template={t}
                        canEdit={canEdit}
                        onEdit={() => setEditingId(t.id)}
                        onDelete={() => handleDelete(t.id)}
                      />
                    )
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

// ─── Card de visualización ────────────────────────────────────────────

function TemplateCard({
  template,
  canEdit,
  onEdit,
  onDelete,
}: {
  template: ScriptTemplate;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="border border-neutral-200 rounded-lg p-3 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{template.name}</div>
          {template.description && (
            <div className="text-xs text-neutral-500 mt-0.5">{template.description}</div>
          )}
          <ol className="mt-2 space-y-0.5 text-xs text-neutral-700">
            {template.blocks.map((b, idx) => (
              <li key={b.id} className="flex gap-2">
                <span className="text-neutral-400 tabular-nums">{idx + 1}.</span>
                <span>{b.label || <em className="text-neutral-400">sin título</em>}</span>
              </li>
            ))}
            {template.blocks.length === 0 && (
              <li className="text-neutral-400 italic">Sin bloques</li>
            )}
          </ol>
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
    </div>
  );
}

// ─── Form crear/editar ─────────────────────────────────────────────────

function TemplateForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: ScriptTemplate;
  onSave: (draft: { name: string; format: string; blocks: Block[]; description: string | null }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [format, setFormat] = useState<FormatKey>((initial?.format as FormatKey) ?? "reel");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [blocks, setBlocks] = useState<Block[]>(
    initial?.blocks ?? [{ id: `b_${Date.now()}`, label: "", order: 0 }]
  );

  function addBlock() {
    setBlocks((prev) => [
      ...prev,
      { id: `b_${Date.now()}_${prev.length}`, label: "", order: prev.length },
    ]);
  }

  function updateBlock(idx: number, label: string) {
    setBlocks((prev) => prev.map((b, i) => (i === idx ? { ...b, label } : b)));
  }

  function removeBlock(idx: number) {
    setBlocks((prev) => prev.filter((_, i) => i !== idx).map((b, i) => ({ ...b, order: i })));
  }

  function moveBlock(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= blocks.length) return;
    setBlocks((prev) => {
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr.map((b, i) => ({ ...b, order: i }));
    });
  }

  function handleSave() {
    if (!name.trim()) {
      alert("Pon un nombre a la plantilla");
      return;
    }
    onSave({
      name: name.trim(),
      format,
      description: description.trim() || null,
      blocks: blocks
        .filter((b) => b.label.trim())
        .map((b, i) => ({ id: b.id, label: b.label.trim(), order: i })),
    });
  }

  return (
    <div className="border-2 border-neutral-900 rounded-lg p-4 bg-neutral-50 mb-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1">Nombre</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Reel educativo 3 partes"
            className="w-full px-2 py-1.5 text-sm border border-neutral-300 rounded"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1">Formato</label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as FormatKey)}
            className="px-2 py-1.5 text-sm border border-neutral-300 rounded"
          >
            {SCRIPT_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.icon} {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-xs font-medium text-neutral-700 mb-1">
          Descripción <span className="text-neutral-400 font-normal">(opcional)</span>
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Notas o contexto sobre cuándo usar esta plantilla"
          className="w-full px-2 py-1.5 text-sm border border-neutral-300 rounded"
        />
      </div>

      <div className="mb-3">
        <label className="block text-xs font-medium text-neutral-700 mb-2">Bloques</label>
        <div className="space-y-1.5">
          {blocks.map((b, idx) => (
            <div key={b.id} className="flex items-center gap-1.5">
              <span className="text-xs text-neutral-400 tabular-nums w-5">{idx + 1}.</span>
              <input
                type="text"
                value={b.label}
                onChange={(e) => updateBlock(idx, e.target.value)}
                placeholder="Título del bloque (ej: Gancho, Desarrollo, CTA)"
                className="flex-1 px-2 py-1 text-sm border border-neutral-300 rounded bg-white"
              />
              <button
                type="button"
                onClick={() => moveBlock(idx, -1)}
                disabled={idx === 0}
                className="text-xs px-1.5 py-1 rounded border border-neutral-300 bg-white disabled:opacity-30 hover:bg-neutral-100"
                title="Subir"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveBlock(idx, 1)}
                disabled={idx === blocks.length - 1}
                className="text-xs px-1.5 py-1 rounded border border-neutral-300 bg-white disabled:opacity-30 hover:bg-neutral-100"
                title="Bajar"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeBlock(idx)}
                className="text-xs px-1.5 py-1 rounded border border-red-200 text-red-600 bg-white hover:bg-red-50"
                title="Eliminar"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addBlock}
          className="mt-2 text-xs px-2 py-1 rounded border border-neutral-300 bg-white hover:bg-neutral-100"
        >
          + Añadir bloque
        </button>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm px-3 py-1.5 rounded border border-neutral-300 hover:bg-neutral-100"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="text-sm px-3 py-1.5 rounded bg-neutral-900 text-white hover:bg-neutral-800"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}
