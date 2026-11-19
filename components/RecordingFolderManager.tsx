"use client";
import { useState } from "react";
import type { RecordingFolderOption } from "./RecordingList";
export function RecordingFolderManager({ folders, selected, onSelect, onChanged }: {
  folders: RecordingFolderOption[]; selected: string; onSelect: (id: string) => void; onChanged: (folders: RecordingFolderOption[]) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null), [name, setName] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  function edit(folder?: RecordingFolderOption) { setEditing(folder?.id || "new"); setName(folder?.name || ""); setError(""); }
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!editing || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/recordings/folders" + (editing === "new" ? "" : "/" + editing), {
        method: editing === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
      });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se ha podido guardar la carpeta.");
      onChanged([...folders.filter(f => f.id !== data.id), data].sort((a, b) => a.name.localeCompare(b.name, "es")));
      window.dispatchEvent(new Event("recording-folders:changed"));
      setEditing(null); setName("");
    } catch (e) { setError(e instanceof Error ? e.message : "No se ha podido guardar."); }
    finally { setBusy(false); }
  }
  async function remove(folder: RecordingFolderOption) {
    if (busy || !confirm("¿Eliminar la carpeta «" + folder.name + "»? Las grabaciones se conservarán, sin esta carpeta en tu organización.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/recordings/folders/" + folder.id, { method: "DELETE" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se ha podido eliminar.");
      onChanged(folders.filter(f => f.id !== folder.id));
      window.dispatchEvent(new Event("recording-folders:changed"));
      if (selected === folder.id) onSelect("");
      if (editing === folder.id) setEditing(null);
    } catch (e) { setError(e instanceof Error ? e.message : "No se ha podido eliminar."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Carpetas de grabaciones" className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 space-y-3">
    <div className="flex justify-between items-center gap-3"><div><h2 className="font-semibold">Mis carpetas</h2><p className="text-xs text-neutral-500">Tu organización personal. Mover un vídeo no cambia sus permisos ni la organización de otros profesionales.</p></div>
      <button type="button" className="btn btn-ghost shrink-0" disabled={busy} onClick={() => edit()}>Crear carpeta</button></div>
    {editing && <form onSubmit={save} className="flex items-end gap-2 flex-wrap">
      <label className="text-sm flex-1 min-w-40">{editing === "new" ? "Nombre de la carpeta" : "Nuevo nombre"}<input autoFocus value={name} maxLength={80} disabled={busy} onChange={e => setName(e.target.value)} className="mt-1 w-full border rounded-lg p-2" /></label>
      <button type="submit" className="btn btn-accent" disabled={busy || !name.trim()}>Guardar carpeta</button>
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button>
    </form>}
    <div className="flex flex-wrap gap-2">
      <button type="button" aria-pressed={selected === ""} className={"rounded-lg border px-3 py-2 text-sm " + (selected === "" ? "bg-neutral-900 text-white" : "bg-white")} onClick={() => onSelect("")}>Todas</button>
      <button type="button" aria-pressed={selected === "none"} className={"rounded-lg border px-3 py-2 text-sm " + (selected === "none" ? "bg-neutral-900 text-white" : "bg-white")} onClick={() => onSelect("none")}>Sin carpeta</button>
      {folders.map(folder => <div key={folder.id} className={"flex items-center rounded-lg border " + (selected === folder.id ? "bg-amber-50 border-amber-400" : "bg-white")}>
        <button type="button" aria-pressed={selected === folder.id} className="px-3 py-2 text-sm font-medium" onClick={() => onSelect(folder.id)}>📁 {folder.name}</button>
        <button type="button" title="Renombrar carpeta" aria-label={"Renombrar " + folder.name} className="px-2 py-2 text-xs text-neutral-500" disabled={busy} onClick={() => edit(folder)}>✎</button>
        <button type="button" title="Eliminar carpeta" aria-label={"Eliminar carpeta " + folder.name} className="px-2 py-2 text-xs text-neutral-500" disabled={busy} onClick={() => remove(folder)}>×</button>
      </div>)}
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
