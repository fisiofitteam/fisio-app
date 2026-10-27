"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function EvidenceDetailsEditor({ row, onSaved }: {
  row: { id: string; updatedAt: string; title?: string; notes?: string | null };
  onSaved?: (data: { title: string; notes: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(row.title || "");
  const [description, setDescription] = useState(row.notes || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function save() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/testimonials/" + row.id, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, version: row.updatedAt, action: "metadata", title: title, notes: description }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar.");
      onSaved?.({ title: title.trim(), notes: description.trim() });
      setEditing(false); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); }
    finally { setBusy(false); }
  }
  if (!editing) return <button type="button" className="text-xs underline" onClick={() => { setTitle(row.title || ""); setDescription(row.notes || ""); setError(""); setEditing(true); }}>Editar título y descripción</button>;
  return <div className="space-y-2 rounded-lg border p-3">
    <p className="text-xs text-neutral-500">Para organizar el material y preparar el caso de éxito. Visible para el equipo.</p>
    <label className="block text-xs">Título<input className="input mt-1" maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej.: Vuelta al entrenamiento sin dolor" /></label>
    <label className="block text-xs">Descripción<textarea className="input mt-1" rows={3} maxLength={4000} value={description} onChange={e => setDescription(e.target.value)} placeholder="Qué muestra el archivo y por qué es relevante" /></label>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    <div className="flex gap-3"><button type="button" className="btn btn-primary text-xs" disabled={busy} onClick={save}>{busy ? "Guardando…" : "Guardar"}</button><button type="button" className="text-xs" disabled={busy} onClick={() => setEditing(false)}>Cancelar</button></div>
  </div>;
}
