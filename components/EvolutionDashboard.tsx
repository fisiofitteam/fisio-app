"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type Entry = { id: string; value: number; recordedAt: string; source: string };
type Metric = { id: string; key: string; name: string; unit: string; isPreset: boolean; entries: Entry[] };

export function EvolutionDashboard({ patientId, metrics }: { patientId: string; metrics: Metric[] }) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);

  async function addMetric(name: string, unit: string) {
    await fetch("/api/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, name, unit }),
    });
    setShowNew(false);
    router.refresh();
  }

  async function deleteMetric(id: string) {
    if (!confirm("¿Eliminar esta métrica y todos sus registros?")) return;
    await fetch(`/api/metrics?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function deleteEntry(metricId: string, entryId: string) {
    if (!confirm("¿Eliminar este registro?")) return;
    await fetch(`/api/metrics/entries?id=${entryId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h2 className="font-medium">Evolución</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowNew(true)} className="btn btn-ghost text-xs">
            + Nueva métrica
          </button>
          <button onClick={() => setRegisterOpen(true)} className="btn btn-primary text-xs">
            ✎ Registrar medidas
          </button>
        </div>
      </div>

      {metrics.length === 0 && (
        <p className="text-sm text-neutral-500 text-center py-12">
          Este paciente todavía no tiene métricas. Añade la primera.
        </p>
      )}

      <div className="space-y-3">
        {metrics.map((m) => (
          <MetricCard key={m.id} metric={m} onDelete={() => deleteMetric(m.id)} onDeleteEntry={(eId) => deleteEntry(m.id, eId)} />
        ))}
      </div>

      {showNew && <NewMetricModal onSave={addMetric} onClose={() => setShowNew(false)} />}
      {registerOpen && <RegisterModal patientId={patientId} metrics={metrics} onClose={() => setRegisterOpen(false)} onSaved={() => { setRegisterOpen(false); router.refresh(); }} />}
    </div>
  );
}

function MetricCard({ metric, onDelete, onDeleteEntry }: { metric: Metric; onDelete: () => void; onDeleteEntry: (id: string) => void }) {
  const [showEntries, setShowEntries] = useState(false);

  const data = metric.entries.map((e) => ({
    date: new Date(e.recordedAt).toLocaleDateString("es-ES", { day: "2-digit", month: "short" }),
    value: e.value,
    fullDate: e.recordedAt,
  }));

  const first = metric.entries[0];
  const last = metric.entries[metric.entries.length - 1];
  const delta = first && last && first.id !== last.id ? last.value - first.value : null;

  return (
    <section className="card">
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="font-medium">{metric.name}</h3>
          {metric.unit && <p className="text-xs text-neutral-500">{metric.unit}</p>}
        </div>
        <div className="flex items-center gap-3">
          {first && last && (
            <div className="text-xs text-right">
              <div className="text-neutral-500">Inicio · Actual</div>
              <div>
                <span className="font-medium">{first.value}</span>
                <span className="mx-1 text-neutral-300">→</span>
                <span className="font-medium">{last.value}</span>
                {delta !== null && delta !== 0 && (
                  <span className={`ml-1 text-xs ${delta < 0 ? "text-emerald-600" : "text-amber-700"}`}>
                    ({delta > 0 ? "+" : ""}{delta.toFixed(1)})
                  </span>
                )}
              </div>
            </div>
          )}
          {!metric.isPreset && (
            <button onClick={onDelete} className="text-xs text-red-600">✕</button>
          )}
        </div>
      </div>

      {data.length === 0 ? (
        <p className="text-xs text-neutral-400 text-center py-8 italic">
          Sin registros todavía. Pulsa "Registrar medidas" para añadir el primero.
        </p>
      ) : (
        <>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#737373" />
                <YAxis tick={{ fontSize: 10 }} stroke="#737373" />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e5e5" }}
                  labelStyle={{ fontSize: 11 }}
                />
                <Line type="monotone" dataKey="value" stroke="#171717" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <button onClick={() => setShowEntries(!showEntries)} className="text-xs text-neutral-500 mt-2 hover:text-neutral-900">
            {showEntries ? "▴ Ocultar" : "▾ Ver"} {metric.entries.length} registros
          </button>

          {showEntries && (
            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
              {[...metric.entries].reverse().map((e) => (
                <div key={e.id} className="flex justify-between items-center text-xs px-2 py-1 hover:bg-neutral-50 rounded">
                  <span className="text-neutral-500">
                    {new Date(e.recordedAt).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                  <span className="font-medium">{e.value}</span>
                  <span className="text-neutral-400">{e.source === "session" ? "auto" : "manual"}</span>
                  <button onClick={() => onDeleteEntry(e.id)} className="text-red-600 opacity-50 hover:opacity-100">✕</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function NewMetricModal({ onSave, onClose }: { onSave: (name: string, unit: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">Nueva métrica</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Nombre</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: ROM hombro derecho, Peso corporal" autoFocus />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Unidad (opcional)</label>
            <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg, cm, grados, 0-10..." />
          </div>
          <button onClick={() => onSave(name, unit)} disabled={!name.trim()} className="btn btn-primary w-full">
            Crear
          </button>
        </div>
      </div>
    </div>
  );
}

function RegisterModal({
  patientId,
  metrics,
  onClose,
  onSaved,
}: {
  patientId: string;
  metrics: Metric[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const entries = Object.entries(values)
      .filter(([_, v]) => v.trim() !== "")
      .map(([metricId, value]) => ({ metricId, value: Number(value) }));

    if (entries.length === 0) {
      onClose();
      return;
    }

    await fetch("/api/metrics/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries, recordedAt: date }),
    });
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-neutral-200 flex justify-between items-center sticky top-0 bg-white">
          <h3 className="font-medium">Registrar medidas</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Fecha</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            {metrics.map((m) => (
              <div key={m.id} className="flex gap-2 items-center">
                <label className="text-sm flex-1">{m.name} {m.unit && <span className="text-xs text-neutral-400">({m.unit})</span>}</label>
                <input
                  type="number"
                  step="0.1"
                  className="input w-24"
                  value={values[m.id] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [m.id]: e.target.value }))}
                  placeholder="—"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-400">Deja en blanco las métricas que no quieras registrar.</p>
          <button onClick={save} disabled={saving} className="btn btn-primary w-full">
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
