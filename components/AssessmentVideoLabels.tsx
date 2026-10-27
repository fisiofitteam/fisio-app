"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function AssessmentVideoLabels({ row, onSaved }: {
  row: { id: string; version: string; videoTitle?: string; videoDescription?: string };
  onSaved?: (data: { videoTitle: string; videoDescription: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(row.videoTitle || "");
  const [description, setDescription] = useState(row.videoDescription || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function save() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/assessments", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, version: row.version, action: "metadata", videoTitle: title, videoDescription: description }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar.");
      setTitle(data.videoTitle); setDescription(data.videoDescription);
      onSaved?.({ videoTitle: data.videoTitle, videoDescription: data.videoDescription });
      setEditing(false); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); }
    finally { setBusy(false); }
  }
  if (!editing) return <button type="button" className="text-xs underline" onClick={() => { setTitle(row.videoTitle || ""); setDescription(row.videoDescription || ""); setError(""); setEditing(true); }}>Editar título y descripción</button>;
  return <div className="space-y-2 rounded-lg border p-3">
    <p className="text-xs text-neutral-500">Para organizar el material y preparar el caso de éxito. Solo visible para el equipo.</p>
    <label className="block text-xs">Título<input className="input mt-1" maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej.: Snatch sin dolor · semana 12" /></label>
    <label className="block text-xs">Descripción<textarea className="input mt-1" rows={3} maxLength={5000} value={description} onChange={e => setDescription(e.target.value)} placeholder="Qué muestra el vídeo y por qué es relevante" /></label>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    <div className="flex gap-3"><button type="button" className="btn btn-primary text-xs" disabled={busy} onClick={save}>{busy ? "Guardando…" : "Guardar"}</button><button type="button" className="text-xs" disabled={busy} onClick={() => setEditing(false)}>Cancelar</button></div>
  </div>;
}
