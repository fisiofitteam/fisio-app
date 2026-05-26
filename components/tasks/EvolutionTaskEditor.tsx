"use client";

import { useState } from "react";

export function EvolutionTaskEditor({ task, onClose, onSave }: { task: any; onClose: () => void; onSave?: (snapshot: any) => void }) {
  const [title, setTitle] = useState(task.title);
  const [instructions, setInstructions] = useState(task.evolution?.instructions ?? task.instructions ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    if (onSave) {
      onSave({ ...task, title, instructions });
      setSaving(false);
      onClose();
      return;
    }
    await fetch("/api/programs/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: task.id,
        title,
        evolution: { instructions },
      }),
    });
    setSaving(false);
    onClose();
  }

  return (
    <div className="space-y-3">
      <div className="bg-sky-50 border border-sky-200 rounded-lg p-2 text-xs text-sky-900">
        📊 Registrar evolución · el paciente reportará RPE, dolor y rigidez
      </div>

      <div>
        <label className="text-xs text-neutral-500 block mb-1">Título</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Registro post-sesión" />
      </div>

      <div>
        <label className="text-xs text-neutral-500 block mb-1">Instrucciones (opcional)</label>
        <textarea
          className="input"
          rows={3}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Ej: Importante anotar si el dolor superó 5/10 en algún momento."
        />
      </div>

      <div className="bg-neutral-50 rounded-lg p-3 text-xs text-neutral-600">
        <p className="font-medium mb-1">El paciente verá estos campos:</p>
        <ul className="space-y-0.5 ml-3">
          <li>• RPE percibido (0-10)</li>
          <li>• Nivel de dolor (0-10)</li>
          <li>• Rigidez (0-10)</li>
        </ul>
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
        <button onClick={onClose} className="btn btn-ghost text-sm">Cancelar</button>
        <button onClick={save} disabled={saving || !title.trim()} className="btn btn-primary text-sm">
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}
