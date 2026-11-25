"use client";
import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { extensionLink, extensionMetadata, extensionChunk, EXTENSION_CHUNK_SIZE, type ExtensionLink } from "@/lib/extension-recording";
import { readRecordingDraft, writeRecordingDraft, type RecordingDraft } from "@/lib/recording-draft";
type Runtime = { lastError?: { message?: string }; sendMessage(id: string, message: unknown, callback: (response: unknown) => void): void };
const LINK_KEY = "fisiofit-extension-transfer";
function extensionRequest(link: ExtensionLink, type: string, extra = {}): Promise<unknown> {
  const runtime = (window as unknown as { chrome?: { runtime?: Runtime } }).chrome?.runtime;
  if (!runtime?.sendMessage) return Promise.reject(Error("Abre esta página en el Chrome donde has instalado FisioFit Recorder."));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("La extensión no responde. Vuelve a abrir «Guardar en FisioFit» desde su icono.")), 30000);
    runtime.sendMessage(link.extension, { type, transfer: link.transfer, ...extra }, response => {
      clearTimeout(timer); const error = runtime.lastError?.message || (response as { error?: string })?.error;
      if (error) reject(Error(error)); else resolve(response);
    });
  });
}
export function ExtensionRecordingImport({ actor, patients, folders }: {
  actor: { id: string; fullName: string } | null; patients: { id: string; fullName: string }[]; folders: { id: string; name: string }[];
}) {
  const [link, setLink] = useState<ExtensionLink | null>(null), [draft, setDraft] = useState<RecordingDraft>(), [preview, setPreview] = useState("");
  const [phase, setPhase] = useState("idle"), [progress, setProgress] = useState(0), [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const key = useRef(""), locked = useRef(false), writes = useRef<Promise<void>>(Promise.resolve());
  const remember = (value?: RecordingDraft) => { const draftKey = key.current; const next = writes.current.catch(() => {}).then(() => writeRecordingDraft(draftKey, value)); writes.current = next; return next; };
  useEffect(() => {
    try {
      const hash = location.hash || sessionStorage.getItem(LINK_KEY) || "", parsed = extensionLink(hash);
      if (parsed) { sessionStorage.setItem(LINK_KEY, hash); history.replaceState(null, "", location.pathname); setLink(parsed); }
      else setMessage("Abre la extensión y pulsa «Guardar en FisioFit» en una grabación pendiente.");
    } catch { setLink(extensionLink(location.hash)); }
  }, []);
  useEffect(() => { if (!draft) return; const url = URL.createObjectURL(draft.blob); setPreview(url); return () => URL.revokeObjectURL(url); }, [draft?.blob]);
  useEffect(() => {
    if (!draft || phase !== "preview" || !key.current) return;
    const timer = setTimeout(() => { void remember(draft).catch(() => setMessage("No se ha podido guardar la copia local. La grabación sigue en la extensión.")); }, 400);
    return () => clearTimeout(timer);
  }, [draft, phase]);
  useEffect(() => {
    if (!["receiving", "saving"].includes(phase)) return;
    const leave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", leave); return () => window.removeEventListener("beforeunload", leave);
  }, [phase]);
  async function receive() {
    if (!actor || !link || locked.current) return; locked.current = true; setPhase("receiving"); setProgress(0); setMessage("");
    try {
      const meta = extensionMetadata(await extensionRequest(link, "metadata"));
      key.current = actor.id + ":extension:" + meta.id;
      let receipt = ""; try { receipt = localStorage.getItem(key.current + ":saved") || ""; } catch {}
      if (receipt) { setSaved(true); setPhase("saved"); return; }
      const existing = await readRecordingDraft(key.current).catch(() => undefined);
      if (existing) { setDraft(existing); setPhase("preview"); return; }
      const parts: BlobPart[] = [];
      for (let offset = 0; offset < meta.size; offset += EXTENSION_CHUNK_SIZE) {
        parts.push(new Blob([extensionChunk(await extensionRequest(link, "chunk", { offset }), offset, meta.size)]));
        setProgress(Math.round(Math.min(meta.size, offset + EXTENSION_CHUNK_SIZE) * 100 / meta.size));
      }
      const value: RecordingDraft = { blob: new Blob(parts, { type: meta.mime }), durationSeconds: meta.durationSeconds, title: meta.title, notes: "", updatedAt: Date.now(),
        transcript: meta.transcript || "", transcriptionStatus: meta.transcriptionStatus, transcriptionWarning: meta.transcriptionWarning, reason: meta.reason };
      await remember(value).catch(() => setMessage("No se ha podido conservar otra copia local; guarda el vídeo antes de cerrar esta pestaña."));
      setDraft(value); setPhase("preview");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo recibir la grabación."); setPhase("idle"); }
    finally { locked.current = false; }
  }
  async function save() {
    if (!draft || !draft.title.trim() || locked.current) return; locked.current = true; setPhase("saving"); setProgress(0); setMessage("");
    let id = draft.uploadedId, uploaded = !!id;
    try {
      await remember(draft).catch(() => {});
      if (!id) {
        const response = await fetch("/api/recordings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          title: draft.title, notes: draft.notes, folderId: draft.folderId || null, patientId: draft.patientId || null, transcript: draft.transcript,
          transcriptionStatus: draft.transcriptionStatus, mime: draft.blob.type, size: draft.blob.size, durationSeconds: draft.durationSeconds,
        }) });
        const reservation = await response.json(); if (!response.ok) throw Error(reservation.error || "No se pudo preparar el guardado."); id = reservation.id;
        await upload(reservation.pathname, draft.blob, { access: "private", handleUploadUrl: "/api/recordings/upload", clientPayload: JSON.stringify({ id }), multipart: true,
          contentType: draft.blob.type, onUploadProgress: event => setProgress(Math.round(event.percentage)) });
        uploaded = true; const next = { ...draft, uploadedId: id }; setDraft(next); await remember(next).catch(() => {});
      }
      const response = await fetch("/api/recordings/" + id, { method: "POST" });
      if (!response.ok) throw Error((await response.json()).error || "Falta confirmar el guardado. Puedes reintentarlo.");
      // Only acknowledge/delete the extension copy after the private upload is confirmed.
      try { localStorage.setItem(key.current + ":saved", String(id)); } catch {}
      await remember().catch(() => {});
      if (link) await extensionRequest(link, "ack").catch(() => setMessage("Vídeo guardado. Puedes descartar la copia pendiente que queda en la extensión."));
      try { sessionStorage.removeItem(LINK_KEY); } catch {}
      setSaved(true); setPhase("saved");
    } catch (error) {
      if (id && !uploaded) void fetch("/api/recordings/" + id, { method: "DELETE" }).catch(() => {});
      setMessage(error instanceof Error ? error.message : "No se pudo guardar. Conservamos el vídeo para reintentarlo."); setPhase("preview");
    } finally { locked.current = false; }
  }
  const edit = (patch: Partial<RecordingDraft>) => setDraft(d => d ? { ...d, ...patch, updatedAt: Date.now() } : d);
  const disabled = phase === "saving" || !!draft?.uploadedId;
  return <main className="mx-auto max-w-3xl p-5 sm:p-8 space-y-5">
    <header><p className="text-sm font-semibold text-amber-700">FISIOFIT RECORDER</p><h1 className="text-2xl font-bold mt-2">Revisa y guarda tu grabación</h1><p className="text-sm text-neutral-500 mt-2">{actor ? "Se guardará con la cuenta de " + actor.fullName + "." : "Inicia sesión con tu cuenta del equipo. El vídeo permanece en tu extensión."}</p></header>
    {!actor ? <a href="/login?redirect=%2Fgrabador-extension" className="btn btn-accent">Iniciar sesión en FisioFit</a> : <>
      {phase === "idle" && link && <button className="btn btn-accent" onClick={receive}>Recibir grabación de la extensión</button>}
      {phase === "receiving" && <div><p>Recibiendo el vídeo · {progress}%</p><progress className="w-full" max={100} value={progress} aria-label="Transferencia de la extensión" /></div>}
      {saved ? <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 space-y-3"><h2 className="font-semibold text-lg">Grabación guardada</h2><p className="text-sm">Ya está disponible en la biblioteca de FisioFit.</p><a href="/fisio/grabaciones" className="btn btn-accent">Ver mis grabaciones</a></section> : draft && <section className="rounded-2xl border bg-white p-4 space-y-4">
        <video src={preview} controls playsInline className="w-full max-h-96 rounded-xl bg-neutral-950" />
        {[draft.reason, draft.transcriptionWarning].filter(Boolean).map((warning, i) => <p key={i} className="text-sm text-amber-700">{warning}</p>)}
        <label className="block text-sm">Título<input className="mt-1 w-full border rounded-lg p-2" maxLength={160} value={draft.title} disabled={disabled} onChange={e => edit({ title: e.target.value })} /></label>
        <div className="grid sm:grid-cols-2 gap-4"><label className="block text-sm">Carpeta<select className="mt-1 w-full border rounded-lg p-2 bg-white" value={draft.folderId || ""} disabled={disabled} onChange={e => edit({ folderId: e.target.value })}><option value="">Sin carpeta</option>{folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label className="block text-sm">Paciente (opcional)<select className="mt-1 w-full border rounded-lg p-2 bg-white" value={draft.patientId || ""} disabled={disabled} onChange={e => edit({ patientId: e.target.value, patientName: patients.find(p => p.id === e.target.value)?.fullName })}><option value="">Sin paciente · grabación general</option>{patients.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}</select></label></div>
        <label className="block text-sm">Notas internas<textarea className="mt-1 w-full border rounded-lg p-2" maxLength={5000} value={draft.notes} disabled={disabled} onChange={e => edit({ notes: e.target.value })} /></label>
        {draft.transcriptionStatus !== "off" && <label className="block text-sm">Transcripción<textarea className="mt-1 w-full border rounded-lg p-2" rows={6} maxLength={150000} value={draft.transcript || ""} disabled={disabled} onChange={e => edit({ transcript: e.target.value, transcriptionStatus: "edited" })} /></label>}
        <div className="flex flex-wrap items-center gap-4"><button className="btn btn-accent" disabled={phase === "saving" || !draft.title.trim()} onClick={save}>{phase === "saving" ? "Guardando · " + progress + "%" : draft.uploadedId ? "Confirmar guardado" : "Guardar en FisioFit"}</button><a href={preview} download={"fisiofit-grabacion." + (draft.blob.type === "video/mp4" ? "mp4" : "webm")} className="text-sm underline">Descargar copia</a></div>
      </section>}
    </>}
    {message && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{message}</p>}
    <p className="text-xs text-neutral-500">La extensión conserva la copia hasta confirmar el guardado. Las grabaciones generales mantienen los permisos habituales de tu biblioteca.</p>
  </main>;
}
