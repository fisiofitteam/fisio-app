"use client";

import { useState } from "react";
import { Plus, Trash2, Eye, EyeOff, Pencil, Check, X } from "lucide-react";

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
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function fail(e: unknown) {
    setErr(e instanceof Error ? e.message : "Algo ha fallado");
    setTimeout(() => setErr(null), 4000);
  }
  function patchLocal(id: string, patch: Partial<Def>) {
    setDefs((a) => a.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  async function add() {
    if (!name.trim()) return;
    try {
      const created = await api("/api/metric-definitions", "POST", { name: name.trim(), unit: unit.trim() || null });
      setDefs((a) => [...a, { id: created.id, key: created.key, name: created.name, unit: created.unit, auto: created.auto, active: created.active }]);
      setName(""); setUnit("");
    } catch (e) { fail(e); }
  }

  async function patch(d: Def, data: Partial<Def>) {
    try { await api("/api/metric-definitions", "PATCH", { id: d.id, ...data }); patchLocal(d.id, data); }
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
        {defs.map((d) =>
          editing === d.id ? (
            <EditRow key={d.id} def={d} onCancel={() => setEditing(null)} onSave={async (data) => { await patch(d, data); setEditing(null); }} />
          ) : (
            <div key={d.id} className={`card flex items-center justify-between gap-3 py-3 ${!d.active ? "opacity-60" : ""}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{d.name}</span>
                  {d.unit && <span className="text-xs text-neutral-400">({d.unit})</span>}
                  {!d.active && <span className="text-[10px] uppercase bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded">Oculta</span>}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {/* Interruptor Automática */}
                <label className="flex items-center gap-1.5 text-xs text-neutral-600 cursor-pointer select-none" title="Se rellena sola con los datos de la sesión (Dolor/RPE/Rigidez)">
                  <span className="hidden sm:inline">Auto</span>
                  <button
                    onClick={() => patch(d, { auto: !d.auto })}
                    role="switch"
                    aria-checked={d.auto}
                    className="relative w-9 h-5 rounded-full transition-colors"
                    style={{ background: d.auto ? "#FCD34D" : "#D4D4D4" }}
                  >
                    <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform" style={{ transform: d.auto ? "translateX(16px)" : "translateX(0)" }} />
                  </button>
                </label>
                <button title={d.active ? "Ocultar" : "Activar"} onClick={() => patch(d, { active: !d.active })} className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100">
                  {d.active ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
                <button title="Editar" onClick={() => setEditing(d.id)} className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100"><Pencil size={15} /></button>
                <button title="Borrar" onClick={() => remove(d)} className="p-1.5 rounded-md text-neutral-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={15} /></button>
              </div>
            </div>
          )
        )}
      </div>

      <p className="text-[11px] text-neutral-400">
        <strong>Automática</strong>: se rellena sola al completar sesiones. Solo tiene origen de datos
        para Dolor, RPE y Rigidez (lo que capta la sesión); el resto se registran a mano en la evolución.
      </p>

      <div className="card">
        <h3 className="font-medium text-sm mb-2">Añadir métrica general</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input className="input text-sm flex-1" placeholder="Nombre (ej. Peso, Flexión rodilla)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input text-sm sm:w-32" placeholder="Unidad (kg, cm…)" value={unit} onChange={(e) => setUnit(e.target.value)} />
          <button onClick={add} disabled={!name.trim()} className="btn btn-primary text-sm flex items-center gap-1.5 justify-center">
            <Plus size={15} /> Añadir
          </button>
        </div>
      </div>
    </div>
  );
}

function EditRow({ def, onSave, onCancel }: { def: Def; onSave: (data: { name: string; unit: string | null }) => void; onCancel: () => void }) {
  const [name, setName] = useState(def.name);
  const [unit, setUnit] = useState(def.unit ?? "");
  return (
    <div className="card flex items-center gap-2 py-3">
      <input className="input text-sm flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" autoFocus />
      <input className="input text-sm w-28" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unidad" />
      <button title="Guardar" onClick={() => name.trim() && onSave({ name: name.trim(), unit: unit.trim() || null })} className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50"><Check size={16} /></button>
      <button title="Cancelar" onClick={onCancel} className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-100"><X size={16} /></button>
    </div>
  );
}
