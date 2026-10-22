"use client";
import { useEffect, useRef, useState } from "react";
type Client = { id: string; fullName: string };
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
export function AssignEvidenceClient({ item, patients, onClose, onAssigned }: {
  item: { id: string; name: string; patientId: string | null };
  patients: Client[]; onClose: () => void; onAssigned: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const matches = patients.filter(p => words.every(w => normalize(p.fullName).includes(w)));
  async function assign(patient: Client) {
    if (saving) return;
    setSaving(patient.id); setError("");
    try {
      const res = await fetch("/api/testimonials/" + item.id, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: patient.id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo asignar");
      onAssigned();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo asignar"); setSaving(null); }
  }
  return <dialog ref={dialog} aria-labelledby="assign-client-title" onCancel={e => { e.preventDefault(); if (!saving) onClose(); }}
    className="w-[calc(100%-2rem)] max-w-md rounded-2xl p-0 shadow-xl backdrop:bg-black/40">
    <div className="p-5">
      <div className="flex justify-between items-start gap-3">
        <div><h3 id="assign-client-title" className="font-semibold text-lg">Asignar a cliente</h3>
          <p className="text-xs text-neutral-500 mt-1 break-words">{item.name}</p></div>
        <button type="button" aria-label="Cerrar" disabled={!!saving} onClick={onClose} className="rounded-lg px-2 py-1 text-neutral-500 hover:bg-neutral-100">✕</button>
      </div>
      <label className="block mt-4 text-sm font-medium">Buscar cliente por nombre
        <input autoFocus type="search" value={query} onChange={e => setQuery(e.target.value)} disabled={!!saving}
          placeholder="Escribe su nombre o apellidos…" className="input mt-2 w-full" />
      </label>
      <p className="text-xs text-neutral-400 my-2">{words.length ? matches.length + " coincidencias" : "Escribe para encontrar al cliente"}</p>
      <div className="max-h-72 overflow-y-auto space-y-1" aria-label="Resultados de clientes">
        {matches.slice(0, 50).map(p => <button type="button" key={p.id} disabled={!!saving || p.id === item.patientId} onClick={() => void assign(p)}
          className="w-full rounded-xl px-3 py-3 text-left text-sm hover:bg-amber-50 disabled:opacity-50 flex items-center justify-between gap-2">
          <span>{p.fullName}</span><span className="text-xs text-neutral-400">{saving === p.id ? "Asignando…" : p.id === item.patientId ? "Asignado" : "Asignar →"}</span>
        </button>)}
        {!matches.length && <p className="text-sm text-neutral-500 p-3">No se ha encontrado ningún cliente con ese nombre.</p>}
        {matches.length > 50 && <p className="text-xs text-neutral-400 p-3">Escribe un nombre para acotar los resultados.</p>}
      </div>
      {error && <p role="alert" className="text-sm text-red-700 mt-3">{error}</p>}
    </div>
  </dialog>;
}
