"use client";

import { useEffect, useState } from "react";

/**
 * Editor de una tarea EVOLUTION.
 *
 * - Sin patientId (edición desde la biblioteca de programas): solo permite
 *   editar título e instrucciones. Las métricas se eligen al asignar la
 *   sesión a un paciente concreto.
 *
 * - Con patientId (edición desde el calendario del paciente): además muestra
 *   el selector de métricas. Puede quedarse con el "set por defecto del
 *   paciente" (todas las visibles de su ficha) o personalizar para esa
 *   tarea concreta marcando checkboxes. Desde aquí también se pueden crear
 *   nuevas métricas custom en la ficha del paciente.
 *
 * El snapshot que devolvemos al onSave añade `metricSelection`:
 *   { mode: "default" }                        → usar las del paciente
 *   { mode: "custom", metricKeys: [...] }      → usar solo las listadas
 * Tareas antiguas sin este campo siguen funcionando como "default".
 */

type PatientMetric = {
  id: string;
  key: string;
  name: string;
  unit: string | null;
  isPreset: boolean;
};

type Selection = { mode: "default" } | { mode: "custom"; metricKeys: string[] };

export function EvolutionTaskEditor({
  task,
  onClose,
  onSave,
  patientId = null,
}: {
  task: any;
  onClose: () => void;
  onSave?: (snapshot: any) => void;
  patientId?: string | null;
}) {
  const [title, setTitle] = useState(task.title);
  const [instructions, setInstructions] = useState(task.evolution?.instructions ?? task.instructions ?? "");
  const [saving, setSaving] = useState(false);

  const initialSelection: Selection = task.metricSelection?.mode === "custom"
    ? { mode: "custom", metricKeys: Array.isArray(task.metricSelection.metricKeys) ? task.metricSelection.metricKeys : [] }
    : { mode: "default" };
  const [selection, setSelection] = useState<Selection>(initialSelection);

  const [available, setAvailable] = useState<PatientMetric[] | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  async function loadMetrics() {
    if (!patientId) return;
    setLoadingMetrics(true);
    try {
      const r = await fetch(`/api/patients/${patientId}/metrics`, { cache: "no-store" });
      const data = await r.json();
      setAvailable(Array.isArray(data?.metrics) ? data.metrics : []);
    } catch {
      setAvailable([]);
    }
    setLoadingMetrics(false);
  }

  useEffect(() => {
    if (patientId) loadMetrics();
  }, [patientId]);

  function toggleKey(key: string) {
    if (selection.mode !== "custom") return;
    const has = selection.metricKeys.includes(key);
    setSelection({
      mode: "custom",
      metricKeys: has ? selection.metricKeys.filter((k) => k !== key) : [...selection.metricKeys, key],
    });
  }

  function switchMode(mode: "default" | "custom") {
    if (mode === "default") setSelection({ mode: "default" });
    else {
      const preselected = selection.mode === "custom"
        ? selection.metricKeys
        : (available ?? []).map((m) => m.key);
      setSelection({ mode: "custom", metricKeys: preselected });
    }
  }

  async function save() {
    setSaving(true);
    const snapshot: any = { ...task, title, instructions, metricSelection: selection };
    if (onSave) {
      onSave(snapshot);
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
        📊 Registrar evolución — el paciente reportará las métricas que elijas debajo.
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

      {patientId ? (
        <div className="border border-neutral-200 rounded-lg p-3 space-y-3">
          <div className="text-xs font-medium">Métricas a registrar</div>
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => switchMode("default")}
              className={`px-3 py-1.5 rounded border ${selection.mode === "default" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300"}`}
            >
              Todas las de su ficha
            </button>
            <button
              type="button"
              onClick={() => switchMode("custom")}
              className={`px-3 py-1.5 rounded border ${selection.mode === "custom" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300"}`}
            >
              Elegir para esta sesión
            </button>
          </div>

          {loadingMetrics && <p className="text-xs text-neutral-400 italic">Cargando métricas del paciente…</p>}

          {!loadingMetrics && available && available.length === 0 && (
            <p className="text-xs text-neutral-500 italic">
              Este paciente aún no tiene métricas. Añade una debajo o configura las globales en Biblioteca → Métricas.
            </p>
          )}

          {!loadingMetrics && available && available.length > 0 && selection.mode === "default" && (
            <div className="text-xs text-neutral-600 space-y-1">
              <p className="italic">Se preguntarán todas las métricas visibles del paciente:</p>
              <ul className="ml-3">
                {available.map((m) => (
                  <li key={m.key}>• {m.name}{m.unit ? ` (${m.unit})` : ""}{!m.isPreset && <span className="text-neutral-400"> · custom</span>}</li>
                ))}
              </ul>
            </div>
          )}

          {!loadingMetrics && available && available.length > 0 && selection.mode === "custom" && (
            <div className="space-y-1">
              {available.map((m) => {
                const checked = selection.metricKeys.includes(m.key);
                return (
                  <label key={m.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={checked} onChange={() => toggleKey(m.key)} />
                    <span>{m.name}{m.unit ? <span className="text-neutral-400"> ({m.unit})</span> : null}</span>
                    {!m.isPreset && <span className="text-[10px] text-neutral-400">custom</span>}
                  </label>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="text-xs text-blue-700 hover:underline"
          >
            + Añadir nueva métrica a la ficha del paciente
          </button>
        </div>
      ) : (
        <div className="bg-neutral-50 rounded-lg p-3 text-xs text-neutral-600">
          Al asignar esta sesión a un paciente podrás elegir qué métricas se le piden.
          Por defecto se usarán todas las visibles de su ficha clínica.
        </div>
      )}

      <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
        <button onClick={onClose} className="btn btn-ghost text-sm">Cancelar</button>
        <button onClick={save} disabled={saving || !title.trim()} className="btn btn-primary text-sm">
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>

      {addOpen && patientId && (
        <AddMetricModal
          patientId={patientId}
          onClose={() => setAddOpen(false)}
          onCreated={(m) => {
            setAvailable((prev) => (prev ? [...prev, m] : [m]));
            if (selection.mode === "custom") {
              setSelection({ mode: "custom", metricKeys: [...selection.metricKeys, m.key] });
            }
            setAddOpen(false);
          }}
        />
      )}
    </div>
  );
}

function AddMetricModal({
  patientId,
  onClose,
  onCreated,
}: {
  patientId: string;
  onClose: () => void;
  onCreated: (m: PatientMetric) => void;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("0-10");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/patients/${patientId}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, unit }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Error");
      onCreated(data.metric);
    } catch (e: any) {
      alert(e?.message || "No se pudo crear la métrica");
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-sm w-full p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h4 className="font-medium">Nueva métrica para este paciente</h4>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Nombre</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Movilidad hombro" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Unidad (opcional)</label>
          <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="0-10, kg, cm..." />
        </div>
        <p className="text-[11px] text-neutral-500">
          Queda guardada en la ficha clínica del paciente. Aparecerá disponible en todas sus tareas de evolución futuras.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn btn-ghost text-sm">Cancelar</button>
          <button onClick={submit} disabled={saving || !name.trim()} className="btn btn-primary text-sm">
            {saving ? "Creando..." : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}
