"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { startBrowserRecording, type BrowserRecording, type FinishedRecording } from "@/lib/browser-recorder";
import { readRecordingDraft, writeRecordingDraft, type RecordingDraft } from "@/lib/recording-draft";
import { RecordingCameraPreview } from "./RecordingCameraPreview";
import { MAX_RECORDING_BYTES } from "@/lib/recording-rules";

const clock = (time: number) => Math.floor(time / 60).toString().padStart(2, "0") + ":" + (time % 60).toString().padStart(2, "0");
export function ScreenRecorder({ patientId, patientName, professionalId, enabled }: { patientId: string; patientName: string; professionalId: string; enabled: boolean }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "preparing" | "recording" | "paused" | "stopping" | "preview" | "uploading">("idle");
  const [camera, setCamera] = useState(true), [microphone, setMicrophone] = useState(true), [systemAudio, setSystemAudio] = useState(false);
  const [title, setTitle] = useState("Revisión de ejercicios"), [notes, setNotes] = useState("");
  const [elapsed, setElapsed] = useState(0), [progress, setProgress] = useState(0), [message, setMessage] = useState("");
  const [draft, setDraft] = useState<FinishedRecording | null>(null), [preview, setPreview] = useState<string>(), [supported, setSupported] = useState(true);
  const [cameraStream, setCameraStream] = useState<MediaStream>();
  const controller = useRef<BrowserRecording>(), mounted = useRef(true);
  const [recovering, setRecovering] = useState(true), [uploadedId, setUploadedId] = useState<string>();
  const serverUploadId = useRef<string>(), draftWrites = useRef<Promise<void>>(Promise.resolve());
  const currentText = useRef({ title, notes }); currentText.current = { title, notes };
  const key = professionalId + ":" + patientId;
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    setRecovering(true);
    setSupported(!!navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== "undefined");
    readRecordingDraft(key).then(d => {
      if (cancelled || !d) return;
      serverUploadId.current = d.uploadedId; setUploadedId(d.uploadedId);
      setDraft(d); setTitle(d.title); setNotes(d.notes); setPhase("preview"); setMessage("Hemos recuperado una grabación pendiente de guardar.");
    }).catch(() => {}).finally(() => { if (!cancelled) setRecovering(false); });
    return () => { cancelled = true; mounted.current = false; controller.current?.stop(); };
  }, [key]);
  useEffect(() => {
    if (!draft) { setPreview(undefined); return; }
    const url = URL.createObjectURL(draft.blob); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [draft]);
  useEffect(() => {
    if (phase === "idle") return;
    const leave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const navigate = (e: MouseEvent) => {
      const a = (e.target as Element)?.closest?.("a");
      if (a?.href && a.target !== "_blank" && !a.hasAttribute("download") && new URL(a.href).pathname !== location.pathname) {
        e.preventDefault(); e.stopPropagation(); setMessage("Guarda o descarta la grabación antes de salir de esta página.");
      }
    };
    window.addEventListener("beforeunload", leave); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", leave); document.removeEventListener("click", navigate, true); };
  }, [phase]);
  function writeDraft(value?: RecordingDraft) {
    // Serialize writes so an immediate discard cannot be followed by a late save.
    const next = draftWrites.current.catch(() => {}).then(() => writeRecordingDraft(key, value));
    draftWrites.current = next;
    return next;
  }
  async function remember(recording: FinishedRecording) {
    const d: RecordingDraft = { ...recording, ...currentText.current, uploadedId: serverUploadId.current, updatedAt: Date.now() };
    try { await writeDraft(d); }
    catch { if (mounted.current) setMessage("La copia local no se ha podido guardar. Descarga el vídeo antes de cerrar esta pestaña."); }
  }
  async function start() {
    setMessage(""); setElapsed(0); setCameraStream(undefined); setPhase("preparing");
    try {
      controller.current = await startBrowserRecording({
        camera, microphone, systemAudio,
        onTick: seconds => { if (mounted.current) setElapsed(seconds); },
        onError: error => { if (mounted.current) { setCameraStream(undefined); setMessage(error); setPhase("idle"); } },
        onFinish: recording => {
          controller.current = undefined;
          void remember(recording);
          if (mounted.current) { setCameraStream(undefined); setDraft(recording); setPhase("preview"); setMessage(recording.reason || "Revisa el vídeo y guárdalo en el historial."); }
        },
      });
      if (!mounted.current) { controller.current.stop(); return; }
      setCameraStream(controller.current.cameraStream);
      setPhase("recording");
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "PermissionDeniedError");
      setMessage(denied ? "No se inició la grabación. Permite compartir pantalla y los dispositivos seleccionados para volver a intentarlo." : e instanceof Error ? e.message : "No se pudo iniciar.");
      setPhase("idle");
    }
  }
  async function save() {
    if (!draft || !title.trim()) return;
    if (draft.blob.size > MAX_RECORDING_BYTES) { setMessage("El vídeo supera 500 MB. Descarga la copia local."); return; }
    setPhase("uploading"); setProgress(0); setMessage("");
    let id = serverUploadId.current, uploaded = !!id;
    try {
      await remember(draft);
      if (!id) {
      const response = await fetch("/api/patients/" + encodeURIComponent(patientId) + "/recordings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, notes, mime: draft.blob.type, size: draft.blob.size, durationSeconds: draft.durationSeconds }),
      });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo preparar la subida.");
      id = data.id;
      await upload(data.pathname, draft.blob, { access: "private", handleUploadUrl: "/api/recordings/upload", clientPayload: JSON.stringify({ id }),
        multipart: true, contentType: draft.blob.type, onUploadProgress: event => setProgress(Math.round(event.percentage)) });
      uploaded = true; serverUploadId.current = id; setUploadedId(id);
      await remember(draft);
      }
      const finish = await fetch("/api/recordings/" + id, { method: "POST" });
      if (!finish.ok) throw new Error((await finish.json()).error || "El vídeo se ha subido, pero falta confirmar su guardado.");
      await writeDraft().catch(() => {});
      serverUploadId.current = undefined; setUploadedId(undefined);
      setDraft(null); setPhase("idle"); setMessage("Grabación guardada en el historial."); router.refresh();
    } catch (e) {
      // Keep a completed upload if a transient finalization failure occurred.
      if (id && !uploaded) void fetch("/api/recordings/" + id, { method: "DELETE" }).catch(() => {});
      setPhase("preview"); setMessage(e instanceof Error ? e.message : "No se pudo subir. Puedes reintentarlo o descargar una copia.");
    }
  }
  async function discard() {
    if (!confirm("¿Descartar esta grabación sin guardarla?")) return;
    if (serverUploadId.current) {
      try {
        const response = await fetch("/api/recordings/" + serverUploadId.current, { method: "DELETE" });
        if (!response.ok && response.status !== 404) throw new Error("No se ha podido eliminar la subida. Vuelve a intentarlo.");
      } catch (e) { setMessage(e instanceof Error ? e.message : "No se ha podido eliminar."); return; }
    }
    await writeDraft().catch(() => {}); serverUploadId.current = undefined; setUploadedId(undefined);
    setDraft(null); setPhase("idle"); setMessage("");
  }
  const recording = phase === "recording" || phase === "paused";
  return <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 space-y-4">
    <div><h3 className="font-semibold text-lg">Grabar explicación</h3><p className="text-sm text-neutral-500">Para {patientName}. Pantalla o ventana, con tu voz y cámara opcionales.</p></div>
    {!enabled && <p className="text-sm text-amber-700">El almacenamiento privado todavía no está conectado.</p>}
    {!supported && <p className="text-sm text-amber-700">Para grabar, abre esta página en Chrome o Edge desde un ordenador.</p>}
    {phase === "idle" && <>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex gap-2 items-center"><input type="checkbox" checked={camera} onChange={e => setCamera(e.target.checked)} /> Cámara</label>
        <label className="flex gap-2 items-center"><input type="checkbox" checked={microphone} onChange={e => setMicrophone(e.target.checked)} /> Micrófono</label>
        <label className="flex gap-2 items-center"><input type="checkbox" checked={systemAudio} onChange={e => setSystemAudio(e.target.checked)} /> Audio de la pestaña o pantalla</label>
      </div>
      <p className="text-xs text-neutral-500">Puedes elegir WhatsApp, otra pestaña o toda la pantalla. Mantén esta pestaña abierta. El audio compartido depende del navegador y de la ventana seleccionada. Máximo 30 minutos o 500 MB.</p>
      <button className="btn btn-accent" disabled={!enabled || !supported || recovering} onClick={start}>{recovering ? "Comprobando grabaciones pendientes…" : "● Empezar a grabar"}</button>
    </>}
    {phase === "preparing" && <p role="status" className="text-sm">Selecciona la pantalla o ventana y permite los dispositivos…</p>}
    {recording && <div className="flex gap-3 items-center flex-wrap rounded-xl bg-red-50 p-4">
      <span className="font-mono font-semibold text-red-700">{phase === "paused" ? "En pausa" : "● Grabando"} · {clock(elapsed)}</span>
      <button className="btn btn-ghost" onClick={() => { if (phase === "paused") { controller.current?.resume(); setPhase("recording"); } else { controller.current?.pause(); setPhase("paused"); } }}>{phase === "paused" ? "Reanudar" : "Pausar"}</button>
      <button className="btn btn-accent" onClick={() => { setPhase("stopping"); controller.current?.stop(); }}>Terminar</button>
    </div>}
    {recording && cameraStream && <RecordingCameraPreview stream={cameraStream} paused={phase === "paused"} />}
    {phase === "stopping" && <p role="status">Preparando la vista previa…</p>}
    {draft && <div className="space-y-3">
      {preview && <video controls playsInline preload="metadata" src={preview} className="w-full max-h-96 bg-neutral-950 rounded-xl" />}
      <label className="block text-sm">Título<input value={title} maxLength={160} disabled={phase === "uploading" || !!uploadedId} onChange={e => setTitle(e.target.value)} className="mt-1 w-full border rounded-lg p-2" /></label>
      <label className="block text-sm">Notas internas<textarea value={notes} maxLength={5000} disabled={phase === "uploading" || !!uploadedId} onChange={e => setNotes(e.target.value)} className="mt-1 w-full border rounded-lg p-2" /></label>
      {phase === "uploading" ? <div role="status"><p className="text-sm">Guardando vídeo… {progress}%</p><progress aria-label="Progreso de subida" value={progress} max={100} className="w-full" /></div> : <div className="flex gap-3 items-center flex-wrap">
        <button className="btn btn-accent" disabled={!title.trim()} onClick={save}>{uploadedId ? "Confirmar guardado" : "Guardar en Grabaciones"}</button>
        <a className="text-sm underline" href={preview} download={"grabacion." + (draft.blob.type === "video/mp4" ? "mp4" : "webm")}>Descargar copia</a>
        <button className="text-sm text-red-700" onClick={discard}>Descartar</button>
      </div>}
    </div>}
    <p role="status" className="text-sm text-neutral-700">{message}</p>
  </div>;
}
