"use client";
import { AssessmentVideoLabels } from "@/components/AssessmentVideoLabels";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function AssessmentReview({ row }: { row: any }) {
  const [labels, setLabels] = useState({ videoTitle: row.videoTitle || "", videoDescription: row.videoDescription || "" });
  const [notes, setNotes] = useState(row.coachNotes || "");
  const [reviewed, setReviewed] = useState(!!row.reviewedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  async function save(action: string) {
    setBusy(true); setError(""); setSaved(false);
    try {
      const r = await fetch("/api/assessments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, action, version: row.version, coachNotes: notes }) });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      if (action === "review") setReviewed(true);
      setSaved(true); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); } finally { setBusy(false); }
  }
  return <div className="space-y-2">
    <video controls playsInline preload="metadata" src={row.url} className="w-full max-h-80 rounded-lg bg-black" />
    {labels.videoTitle && <h3 className="font-semibold">{labels.videoTitle}</h3>}
    {labels.videoDescription && <p className="text-sm whitespace-pre-wrap">{labels.videoDescription}</p>}
    <AssessmentVideoLabels row={{ ...row, ...labels }} onSaved={setLabels} />
    <p className="text-xs text-neutral-500">{reviewed ? "✓ Revisado" : "Recibido · pendiente de revisión"}</p>
    <label className="block text-xs">Comentario del fisio (visible para el cliente)<textarea rows={3} maxLength={5000} className="input mt-1 text-sm" value={notes} onChange={e => { setNotes(e.target.value); setSaved(false); }} /></label>
    <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-ghost text-xs" disabled={busy} onClick={() => save("notes")}>Guardar comentario</button>{!reviewed && <button type="button" className="btn btn-primary text-xs" disabled={busy} onClick={() => save("review")}>Marcar revisado</button>}</div>
    {saved && <p role="status" className="text-xs text-emerald-700">Guardado</p>}
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
  </div>;
}
