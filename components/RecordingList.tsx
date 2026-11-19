"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
export type RecordingFolderOption = { id: string; name: string };
export type RecordingSummary = { folderId?: string | null; folderName?: string | null; patientId?: string | null; patientName?: string | null; createdByName?: string | null; id: string; title: string; notes: string | null; createdAt: string; durationSeconds: number | null; size: number | null; status: string; shared: boolean };
export function RecordingList({ recordings, onChanged, folders, total = recordings.length, emptyMessage = "Las explicaciones que guardes aparecerán aquí." }: { recordings: RecordingSummary[]; folders?: RecordingFolderOption[]; onChanged?: () => void; total?: number; emptyMessage?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null), [message, setMessage] = useState("");
  const [links, setLinks] = useState<Record<string, string>>({});
  async function action(r: RecordingSummary, mode: "share" | "revoke" | "delete" | "move", folderId?: string) {
    if (mode === "delete" && !confirm("¿Eliminar esta grabación y desactivar sus enlaces?")) return;
    if (mode === "share" && !confirm("Se creará un enlace válido durante 30 días. Quien lo reciba podrá ver este vídeo. Cualquier enlace anterior de esta grabación dejará de funcionar.")) return;
    setBusy(r.id); setMessage("");
    try {
      const response = await fetch("/api/recordings/" + r.id + (mode === "delete" ? "" : mode === "move" ? "/folder" : "/share"), { method: mode === "share" ? "POST" : mode === "move" ? "PATCH" : "DELETE", ...(mode === "move" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderId: folderId || null }) } : {}) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo completar.");
      if (mode === "share") {
        const url = location.origin + data.path; setLinks(old => ({ ...old, [r.id]: url }));
        try { await navigator.clipboard.writeText(url); setMessage("Enlace copiado. Caduca en 30 días."); }
        catch { setMessage("Enlace creado. Cópialo desde el campo de la grabación."); }
      } else if (mode === "move") { setMessage("Grabación organizada en tu carpeta."); } else { setLinks(old => { const next = { ...old }; delete next[r.id]; return next; }); setMessage(mode === "delete" ? "Grabación eliminada." : "Enlace desactivado."); }
      if (onChanged) onChanged(); else router.refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : "No se pudo completar."); }
    finally { setBusy(null); }
  }
  return <section className="space-y-5">
    <p role="status" className="text-sm">{message}</p>
    <div className="flex justify-between items-center"><h3 className="font-semibold">Historial de grabaciones</h3><span className="text-xs text-neutral-500">{total} grabaciones</span></div>
    {!recordings.length && <p className="rounded-xl border border-dashed p-6 text-sm text-neutral-500">{emptyMessage}</p>}
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{recordings.map(r => <article className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3" key={r.id}>
      <div><h3 className="font-semibold">{r.title}</h3><p className="text-xs text-neutral-500">{new Date(r.createdAt).toLocaleDateString("es-ES")} · {r.durationSeconds != null ? Math.floor(r.durationSeconds / 60) + ":" + String(r.durationSeconds % 60).padStart(2, "0") : ""}{r.size ? " · " + Math.ceil(r.size / 1024 / 1024) + " MB" : ""}</p></div>
      {r.patientId && r.patientName && <Link href={"/fisio/paciente/" + encodeURIComponent(r.patientId) + "/info/grabaciones"} className="block text-sm font-medium underline">{r.patientName}</Link>}
      {r.patientId === null && <p className="text-xs font-medium text-neutral-500">Grabación general · sin paciente</p>}
      {r.createdByName && <p className="text-xs text-neutral-500">Grabado por {r.createdByName}</p>}
      {r.status === "ready" && <video controls playsInline preload="none" src={"/api/recordings/" + r.id + "/video"} className="w-full aspect-video rounded-lg bg-neutral-950" />}
      {r.status === "deleting" && <p className="text-sm text-amber-700">La eliminación está pendiente. Pulsa Eliminar para reintentar.</p>}
      {r.notes && <p className="text-sm whitespace-pre-wrap break-words">{r.notes}</p>}
      {folders && r.status === "ready" && <label className="block text-xs text-neutral-500">Carpeta<select aria-label={"Carpeta de " + r.title} value={r.folderId || ""} disabled={busy === r.id} onChange={e => action(r, "move", e.target.value)} className="mt-1 block w-full rounded-lg border border-neutral-200 bg-white p-2 text-sm"><option value="">Sin carpeta</option>{folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
      <p className="text-xs text-neutral-500">{r.shared ? "Enlace compartido activo" : r.patientId === null ? "Autor y dirección · sin enlace compartido" : "Solo equipo · sin enlace compartido"}</p>
      <div className="flex gap-3 flex-wrap text-sm">
        {r.status === "ready" && <button disabled={busy === r.id} onClick={() => action(r, "share")} className="font-medium underline">{r.shared ? "Renovar y copiar enlace" : "Crear enlace para compartir"}</button>}
        {r.shared && <button disabled={busy === r.id} onClick={() => action(r, "revoke")}>Desactivar enlace</button>}
        <button disabled={busy === r.id} onClick={() => action(r, "delete")} className="text-red-700">Eliminar</button>
      </div>
      {links[r.id] && <label className="block text-xs">Enlace para compartir<input aria-label="Enlace para compartir" readOnly value={links[r.id]} onFocus={e => e.target.select()} className="mt-1 w-full border rounded p-2 text-sm" /></label>}
    </article>)}</div>
  </section>;
}
