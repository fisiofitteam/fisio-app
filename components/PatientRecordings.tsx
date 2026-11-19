"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScreenRecorder } from "./ScreenRecorder";
type Recording = { id: string; title: string; notes: string | null; createdAt: string; durationSeconds: number | null; size: number | null; status: string; shared: boolean };
export function PatientRecordings({ patientId, patientName, professionalId, enabled, recordings }: { patientId: string; patientName: string; professionalId: string; enabled: boolean; recordings: Recording[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null), [message, setMessage] = useState("");
  const [links, setLinks] = useState<Record<string, string>>({});
  async function action(r: Recording, mode: "share" | "revoke" | "delete") {
    if (mode === "delete" && !confirm("¿Eliminar esta grabación y desactivar sus enlaces?")) return;
    if (mode === "share" && !confirm("Se creará un enlace válido durante 30 días. Quien lo reciba podrá ver este vídeo. Cualquier enlace anterior de esta grabación dejará de funcionar.")) return;
    setBusy(r.id); setMessage("");
    try {
      const response = await fetch("/api/recordings/" + r.id + (mode === "delete" ? "" : "/share"), { method: mode === "share" ? "POST" : "DELETE" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo completar.");
      if (mode === "share") {
        const url = location.origin + data.path; setLinks(old => ({ ...old, [r.id]: url }));
        try { await navigator.clipboard.writeText(url); setMessage("Enlace copiado. Caduca en 30 días."); }
        catch { setMessage("Enlace creado. Cópialo desde el campo de la grabación."); }
      } else { setLinks(old => { const next = { ...old }; delete next[r.id]; return next; }); setMessage(mode === "delete" ? "Grabación eliminada." : "Enlace desactivado."); }
      router.refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : "No se pudo completar."); }
    finally { setBusy(null); }
  }
  return <section className="space-y-5">
    <div><h2 className="text-xl font-semibold">Grabaciones</h2><p className="text-sm text-neutral-500">Archivo interno del equipo. No aparece en el panel del paciente.</p></div>
    <ScreenRecorder patientId={patientId} patientName={patientName} professionalId={professionalId} enabled={enabled} />
    <p role="status" className="text-sm">{message}</p>
    <div className="flex justify-between items-center"><h3 className="font-semibold">Historial de grabaciones</h3><span className="text-xs text-neutral-500">{recordings.length} grabaciones</span></div>
    {!recordings.length && <p className="rounded-xl border border-dashed p-6 text-sm text-neutral-500">Las explicaciones que guardes aparecerán aquí.</p>}
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{recordings.map(r => <article className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3" key={r.id}>
      <div><h3 className="font-semibold">{r.title}</h3><p className="text-xs text-neutral-500">{new Date(r.createdAt).toLocaleDateString("es-ES")} · {r.durationSeconds != null ? Math.floor(r.durationSeconds / 60) + ":" + String(r.durationSeconds % 60).padStart(2, "0") : ""}{r.size ? " · " + Math.ceil(r.size / 1024 / 1024) + " MB" : ""}</p></div>
      {r.status === "ready" && <video controls playsInline preload="none" src={"/api/recordings/" + r.id + "/video"} className="w-full aspect-video rounded-lg bg-neutral-950" />}
      {r.status === "deleting" && <p className="text-sm text-amber-700">La eliminación está pendiente. Pulsa Eliminar para reintentar.</p>}
      {r.notes && <p className="text-sm whitespace-pre-wrap break-words">{r.notes}</p>}
      <p className="text-xs text-neutral-500">{r.shared ? "Enlace compartido activo" : "Solo equipo · sin enlace compartido"}</p>
      <div className="flex gap-3 flex-wrap text-sm">
        {r.status === "ready" && <button disabled={busy === r.id} onClick={() => action(r, "share")} className="font-medium underline">{r.shared ? "Renovar y copiar enlace" : "Crear enlace para compartir"}</button>}
        {r.shared && <button disabled={busy === r.id} onClick={() => action(r, "revoke")}>Desactivar enlace</button>}
        <button disabled={busy === r.id} onClick={() => action(r, "delete")} className="text-red-700">Eliminar</button>
      </div>
      {links[r.id] && <label className="block text-xs">Enlace para compartir<input aria-label="Enlace para compartir" readOnly value={links[r.id]} onFocus={e => e.target.select()} className="mt-1 w-full border rounded p-2 text-sm" /></label>}
    </article>)}</div>
  </section>;
}
