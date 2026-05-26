"use client";

import { useState } from "react";
import { Plus, Trash2, Eye, EyeOff } from "lucide-react";

type Def = { id: string; key: string; name: string; unit: string | null; auto: boolean; active: boolean };

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Error");
  return res.status === 200 ? res.json() : null;
}

export function MetricDefinitionsEditor({ initial }: { initial: Def[] }) {
  const [defs, setDefs] = useState<Def[]>(initial);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function fail(e: unknown) {
    setErr(e instanceof Error ? e.message : "Algo ha fallado");
    setTimeout(() => setErr(null), 4000);
  }

  async function add() {
    if (!name.trim()) return;
    try {
      const created = await api("/api/metric-definitions", "POST", { name: name.trim(), unit: unit.trim() || null });
      setDefs((a) => [...a, { id: created.id, key: created.key, name: created.name, unit: created.unit, auto: created.auto, active: created.active }]);
      setName(""); setUnit("");
    } catch (e) { fail(e); }
  }

  async function toggleActive(d: Def) {
    try { await api("/api/metric-definitions", "PATCH", { id: d.id, active: !d.active }); setDefs((a) => a.map((x) => (x.id === d.id ? { ...x, active: !x.active } : x))); }
    catch (e) { fail(e); }
  }

  async function remove(d: Def) {
    if (!confirm(`¿Borrar la métrica "${d.name}"? Se ocultará en todos los pacientes (se conserva el histórico).`)) return;
    try { await api(`/api/metric-definitions?id=${d.id}`, "DELETE"); setDefs((a) => a.filter((x) => x.id !== d.id)); }
    catch (e) { fail(e); }
  }

  return (
    <div className="space-y-3 max-w-2xl">
      {err && <div className="text-sm rounded-lg px-3 py-2 bg-red-50 text-red-700 border border-red-200">{err}</div>}

      <div className="space-y-2">
        {defs.map((d) => (
          <div key={d.id} className={`card flex items-center justify-between gap-3 py-3 ${!d.active ? "opacity-60" : ""}`}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{d.name}</span>
                {d.unit && <span className="text-xs text-neutral-400">({d.unit})</span>}
                {d.auto && <span className="text-[10px] uppercase bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">Automática</span>}
                {!d.active && <span className="text-[10px] uppercase bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded">Oculta</span>}
              </div>
              {d.auto && <p className="text-[11px] text-neutral-400 mt-0.5">Se rellena al completar sesiones.</p>}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button title={d.active ? "Ocultar" : "Activar"} onClick={() => toggleActive(d)} className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100">
                {d.active ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
              {!d.auto && (
                <button title="Borrar" onClick={() => remove(d)} className="p-1.5 rounded-md text-neutral-400 hover:text-red-600 hover:bg-red-50">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 className="font-medium text-sm mb-2">Añadir métrica general</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input className="input text-sm flex-1" placeholder="Nombre (ej. Peso, Flexión rodilla)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input text-sm sm:w-32" placeholder="Unidad (kg, cm…)" value={unit} onChange={(e) => setUnit(e.target.value)} />
          <button onClick={add} disabled={!name.trim()} className="btn btn-primary text-sm flex items-center gap-1.5 justify-center">
            <Plus size={15} /> Añadir
          </button>
        </div>
        <p className="text-[11px] text-neutral-400 mt-2">
          Las métricas que añadas aquí se registran manualmente por el fisio en la evolución del paciente.
        </p>
      </div>
    </div>
  );
}
