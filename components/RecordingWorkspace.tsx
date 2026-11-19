"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { startBrowserRecording, type BrowserRecording, type FinishedRecording } from "@/lib/browser-recorder";
import { readLatestRecordingDraft, writeRecordingDraft, type RecordingDraft } from "@/lib/recording-draft";
import { startBrowserTranscription, speechRecognitionConstructor, type BrowserTranscription, type TranscriptSnapshot, type TranscriptStatus } from "@/lib/browser-transcription";
import { MAX_RECORDING_BYTES } from "@/lib/recording-rules";
import { RecordingCameraPreview } from "./RecordingCameraPreview";
import type { RecordingFolderOption } from "./RecordingList";

type Phase = "idle" | "preparing" | "recording" | "paused" | "stopping" | "preview" | "uploading";
type Target = { patientId?: string; patientName?: string; defaultFolderId?: string };
type Start = Target & { camera: boolean; microphone: boolean; systemAudio: boolean; transcribe: boolean };
type Workspace = { busy: boolean; recovering: boolean; supported: boolean; speechSupported: boolean; message: string; start(options: Start): void; show(): void };
const Context = createContext<Workspace | null>(null);
export function useRecordingWorkspace() { const value = useContext(Context); if (!value) throw new Error("Recording workspace missing"); return value; }
const clock = (n: number) => Math.floor(n / 60).toString().padStart(2, "0") + ":" + (n % 60).toString().padStart(2, "0");
export function RecordingWorkspace({ children, professionalId }: { children: React.ReactNode; professionalId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle"), [recovering, setRecovering] = useState(true);
  const [supported, setSupported] = useState(true), [speechSupported, setSpeechSupported] = useState(false);
  const [target, setTarget] = useState<Target>({}), [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(""), [notes, setNotes] = useState(""), [folderId, setFolderId] = useState("");
  const [folders, setFolders] = useState<RecordingFolderOption[]>([]);
  const [elapsed, setElapsed] = useState(0), [progress, setProgress] = useState(0), [message, setMessage] = useState("");
  const [draft, setDraft] = useState<FinishedRecording | null>(null), [preview, setPreview] = useState<string>();
  const [cameraStream, setCameraStream] = useState<MediaStream>(), [uploadedId, setUploadedId] = useState<string>();
  const [transcript, setTranscript] = useState(""), [interim, setInterim] = useState(""), [transcriptionStatus, setTranscriptionStatus] = useState<TranscriptStatus>("off");
  const [speechWarning, setSpeechWarning] = useState(""), [listening, setListening] = useState(false);
  const controller = useRef<BrowserRecording>(), speech = useRef<BrowserTranscription>(), mounted = useRef(true), locked = useRef(true);
  const serverUploadId = useRef<string>(), draftKey = useRef(professionalId + ":workspace");
  const draftWrites = useRef<Promise<void>>(Promise.resolve()), finished = useRef<FinishedRecording | null>(null);
  const current = useRef({ title, notes, folderId, transcript, transcriptionStatus, target, speechWarning });
  current.current = { title, notes, folderId, transcript, transcriptionStatus, target, speechWarning };
  const busy = recovering || phase !== "idle";
  const recording = phase === "recording" || phase === "paused";
  function writeDraft(value?: RecordingDraft) {
    const key = draftKey.current, next = draftWrites.current.catch(() => {}).then(() => writeRecordingDraft(key, value));
    draftWrites.current = next; return next;
  }
  async function remember(recording: FinishedRecording) {
    const c = current.current;
    try { await writeDraft({ ...recording, title: c.title, notes: c.notes, folderId: c.folderId, transcript: c.transcript,
      transcriptionStatus: c.transcriptionStatus, transcriptionWarning: c.speechWarning, ...c.target, uploadedId: serverUploadId.current, updatedAt: Date.now() }); }
    catch { if (mounted.current) setMessage("No se ha podido conservar la copia local. Descarga el vídeo antes de cerrar la pestaña."); }
  }
  function speechChanged(s: TranscriptSnapshot) {
    current.current.transcript = s.text; current.current.transcriptionStatus = s.status; current.current.speechWarning = s.warning;
    if (mounted.current) { setTranscript(s.text); setInterim(s.interim); setTranscriptionStatus(s.status); setListening(s.listening); setSpeechWarning(s.warning); }
  }
  useEffect(() => {
    mounted.current = true; let cancelled = false;
    setSupported(!!navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== "undefined");
    setSpeechSupported(!!speechRecognitionConstructor());
    readLatestRecordingDraft(professionalId).then(result => {
      if (cancelled || !result) return;
      const d = result.draft; draftKey.current = result.key; finished.current = d;
      serverUploadId.current = d.uploadedId; setUploadedId(d.uploadedId); setDraft(d);
      setTitle(d.title); setNotes(d.notes); setFolderId(d.folderId || "");
      setTarget({ patientId: d.patientId, patientName: d.patientName });
      setTranscript(d.transcript || ""); setTranscriptionStatus(d.transcriptionStatus || "off"); setSpeechWarning(d.transcriptionWarning || "");
      setPhase("preview"); setExpanded(true); setMessage("Hemos recuperado una grabación pendiente de guardar.");
    }).catch(() => {}).finally(() => { if (!cancelled) { setRecovering(false); locked.current = !!finished.current; } });
    return () => { cancelled = true; mounted.current = false; controller.current?.stop(); void speech.current?.finish(); };
  }, [professionalId]);
  useEffect(() => {
    if (!draft) { setPreview(undefined); return; }
    const url = URL.createObjectURL(draft.blob); setPreview(url); return () => URL.revokeObjectURL(url);
  }, [draft]);
  useEffect(() => {
    if (phase !== "preview") return;
    const timer = setTimeout(() => { if (finished.current) void remember(finished.current); }, 400);
    return () => clearTimeout(timer);
  }, [phase, title, notes, folderId, transcript, transcriptionStatus]);
  useEffect(() => {
    if (phase === "idle") return;
    let cancelled = false;
    const refresh = async () => { try { const r = await fetch("/api/recordings/folders", { cache: "no-store" }); if (!r.ok) return;
      const next: RecordingFolderOption[] = await r.json(); if (!cancelled) { setFolders(next); setFolderId(id => id && !next.some(f => f.id === id) ? "" : id); }
    } catch {} };
    void refresh(); window.addEventListener("recording-folders:changed", refresh);
    return () => { cancelled = true; window.removeEventListener("recording-folders:changed", refresh); };
  }, [phase === "idle"]);
  useEffect(() => {
    if (phase === "idle") return;
    const leave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const navigate = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.defaultPrevented) return;
      const a = (e.target as Element)?.closest?.("a");
      if (!a?.href || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const u = new URL(a.href, location.href);
      if (u.origin === location.origin && (u.pathname === "/fisio" || u.pathname.startsWith("/fisio/"))) {
        // Includes legacy plain anchors: keep them inside the persistent Next layout.
        if (u.pathname !== location.pathname || u.search !== location.search) { e.preventDefault(); router.push(u.pathname + u.search + u.hash); }
      } else if (u.href !== location.href && !a.href.startsWith("blob:")) {
        e.preventDefault(); e.stopPropagation(); setExpanded(true); setMessage("Puedes navegar por la app. Para salir de ella, guarda o descarta antes la grabación, o abre el enlace en otra pestaña.");
      }
    };
    window.addEventListener("beforeunload", leave); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", leave); document.removeEventListener("click", navigate, true); };
  }, [phase, router]);
  async function start(options: Start) {
    if (locked.current) { setExpanded(true); return; }
    locked.current = true; draftKey.current = professionalId + ":workspace"; finished.current = null;
    serverUploadId.current = undefined; setUploadedId(undefined);
    const nextTarget = { patientId: options.patientId, patientName: options.patientName }, nextTitle = options.patientId ? "Revisión de ejercicios" : "Nueva grabación";
    current.current = { title: nextTitle, notes: "", folderId: options.defaultFolderId || "", transcript: "", transcriptionStatus: options.transcribe ? "complete" : "off", target: nextTarget, speechWarning: "" };
    setTarget(nextTarget); setTitle(nextTitle); setNotes(""); setFolderId(options.defaultFolderId || "");
    setTranscript(""); setInterim(""); setSpeechWarning(""); setTranscriptionStatus(options.transcribe ? "complete" : "off");
    setElapsed(0); setMessage(""); setCameraStream(undefined); setPhase("preparing"); setExpanded(false);
    try {
      // Invoked directly from the launcher's click, before any unrelated await.
      controller.current = await startBrowserRecording({
        camera: options.camera, microphone: options.microphone, systemAudio: options.systemAudio,
        onTick: seconds => { if (mounted.current) setElapsed(seconds); },
        onError: error => { void speech.current?.finish(); speech.current = undefined; locked.current = false;
          if (mounted.current) { setCameraStream(undefined); setMessage(error); setPhase("idle"); } },
        onFinish: recording => {
          controller.current = undefined;
          if (mounted.current) { setPhase("stopping"); setCameraStream(undefined); }
          void (async () => {
            const service = speech.current; if (service) speechChanged(await service.finish()); service?.dispose(); speech.current = undefined;
            finished.current = recording; await remember(recording);
            if (mounted.current) { setDraft(recording); setPhase("preview"); setExpanded(true); setMessage(recording.reason || "Revisa el vídeo y la transcripción antes de guardar."); }
          })();
        },
      });
      if (!mounted.current) { controller.current.stop(); return; }
      setCameraStream(controller.current.cameraStream); setPhase("recording");
      if (options.transcribe) speech.current = startBrowserTranscription(speechChanged);
    } catch (e) {
      locked.current = false; setPhase("idle");
      setMessage(e instanceof Error ? e.message : "No se pudo iniciar la grabación.");
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
        const response = await fetch("/api/recordings", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, notes, patientId: target.patientId || null, folderId: folderId || null, transcript, transcriptionStatus, mime: draft.blob.type, size: draft.blob.size, durationSeconds: draft.durationSeconds }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || "No se pudo preparar la subida."); id = data.id;
        await upload(data.pathname, draft.blob, { access: "private", handleUploadUrl: "/api/recordings/upload", clientPayload: JSON.stringify({ id }), multipart: true, contentType: draft.blob.type, onUploadProgress: e => setProgress(Math.round(e.percentage)) });
        uploaded = true; serverUploadId.current = id; setUploadedId(id); await remember(draft);
      }
      const finish = await fetch("/api/recordings/" + id, { method: "POST" });
      if (!finish.ok) throw new Error((await finish.json()).error || "El vídeo está subido, pero falta confirmar su guardado.");
      finished.current = null; await writeDraft().catch(() => {}); serverUploadId.current = undefined; setUploadedId(undefined);
      setDraft(null); setPhase("idle"); locked.current = false; setExpanded(false);
      setMessage(target.patientId ? "Grabación guardada en el historial del paciente." : "Grabación guardada en Grabaciones.");
      window.dispatchEvent(new Event("recordings:changed")); router.refresh();
    } catch (e) {
      if (id && !uploaded) void fetch("/api/recordings/" + id, { method: "DELETE" }).catch(() => {});
      setPhase("preview"); setMessage(e instanceof Error ? e.message : "No se pudo subir. Puedes reintentarlo o descargar una copia.");
    }
  }
  async function discard() {
    if (!confirm("¿Descartar esta grabación sin guardarla?")) return;
    if (serverUploadId.current) {
      try { const r = await fetch("/api/recordings/" + serverUploadId.current, { method: "DELETE" }); if (!r.ok && r.status !== 404) throw Error("No se ha podido eliminar la subida. Vuelve a intentarlo."); }
      catch (e) { setMessage(e instanceof Error ? e.message : "No se pudo eliminar."); return; }
    }
    finished.current = null; await writeDraft().catch(() => {}); serverUploadId.current = undefined; setUploadedId(undefined);
    setDraft(null); setPhase("idle"); locked.current = false; setMessage(""); setExpanded(false);
  }
  return <Context.Provider value={{ busy, recovering, supported, speechSupported, message, start, show: () => setExpanded(true) }}>
    {children}
    {phase !== "idle" && <aside aria-label="Grabación en curso" className={"fixed z-[60] left-3 bottom-3 sm:left-6 sm:bottom-6 rounded-2xl border border-neutral-200 bg-white text-neutral-900 shadow-2xl print:hidden " + (expanded ? "w-[calc(100vw-1.5rem)] sm:w-[34rem] max-h-[80dvh] overflow-y-auto p-4 space-y-4" : "max-w-[calc(100vw-1.5rem)] p-3")}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold text-sm">{recording ? (phase === "paused" ? "En pausa" : "● Grabando") + " · " + clock(elapsed) : phase === "preview" ? "Grabación pendiente" : phase === "uploading" ? "Guardando · " + progress + "%" : phase === "stopping" ? "Preparando vídeo…" : "Preparando grabación…"}</span>
        {recording && <><button type="button" className="btn btn-ghost" onClick={() => {
          if (phase === "paused") { controller.current?.resume(); speech.current?.resume(); setPhase("recording"); }
          else { controller.current?.pause(); speech.current?.pause(); setPhase("paused"); }
        }}>{phase === "paused" ? "Reanudar" : "Pausar"}</button><button type="button" className="btn btn-accent" onClick={() => { setPhase("stopping"); void speech.current?.finish(); controller.current?.stop(); }}>Terminar</button></>}
        <button type="button" className="text-sm underline ml-auto" onClick={() => setExpanded(v => !v)}>{expanded ? "Minimizar" : phase === "preview" ? "Revisar y guardar" : "Detalles"}</button>
      </div>
      {recording && cameraStream && <RecordingCameraPreview stream={cameraStream} paused={phase === "paused"} />}
      {expanded && <>
        <p className="text-sm text-neutral-500">{target.patientId ? "Paciente: " + (target.patientName || "seleccionado al iniciar") : "Grabación general · sin paciente"}</p>
        {recording && <p className="text-sm">Puedes seguir navegando por la app. Estos controles permanecen disponibles.</p>}
        {(recording || phase === "stopping") && transcriptionStatus !== "off" && <section className="rounded-lg bg-neutral-50 p-3 space-y-2">
          <h3 className="text-sm font-semibold">Transcripción {listening ? "en directo" : phase === "paused" ? "en pausa" : ""}</h3>
          <p className="text-sm max-h-36 overflow-y-auto whitespace-pre-wrap">{transcript || (!interim ? "El texto aparecerá cuando hables…" : "")} <span className="text-neutral-400">{interim}</span></p>
        </section>}
        {draft && <>
          {preview && <video controls playsInline preload="metadata" src={preview} className="w-full max-h-60 bg-neutral-950 rounded-xl" />}
          <label className="block text-sm">Título<input value={title} maxLength={160} disabled={phase === "uploading" || !!uploadedId} onChange={e => setTitle(e.target.value)} className="mt-1 w-full border rounded-lg p-2" /></label>
          <label className="block text-sm">Carpeta<select value={folderId} disabled={phase === "uploading" || !!uploadedId} onChange={e => setFolderId(e.target.value)} className="mt-1 w-full border rounded-lg bg-white p-2"><option value="">Sin carpeta</option>{folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
          <label className="block text-sm">Notas internas<textarea value={notes} maxLength={5000} disabled={phase === "uploading" || !!uploadedId} onChange={e => setNotes(e.target.value)} className="mt-1 w-full border rounded-lg p-2" /></label>
          {transcriptionStatus !== "off" && <label className="block text-sm">Transcripción del micrófono<textarea rows={5} value={transcript} maxLength={150000} disabled={phase === "uploading" || !!uploadedId} onChange={e => { setTranscript(e.target.value); setTranscriptionStatus("edited"); }} className="mt-1 w-full border rounded-lg p-2" /><span className="text-xs text-neutral-500">Puedes corregir el texto. Se guarda para el equipo junto al vídeo.</span></label>}
          {phase === "uploading" ? <progress aria-label="Progreso de subida" value={progress} max={100} className="w-full" /> : <div className="flex gap-3 items-center flex-wrap">
            <button type="button" className="btn btn-accent" disabled={!title.trim()} onClick={save}>{uploadedId ? "Confirmar guardado" : "Guardar en Grabaciones"}</button>
            <a className="text-sm underline" href={preview} download={"grabacion." + (draft.blob.type === "video/mp4" ? "mp4" : "webm")}>Descargar copia</a>
            <button type="button" className="text-sm text-red-700" onClick={discard}>Descartar</button>
          </div>}
        </>}
        {speechWarning && <p role="status" className="text-sm text-amber-700">{speechWarning}</p>}
        {message && <p role="status" className="text-sm">{message}</p>}
      </>}
      {!expanded && speechWarning && <button type="button" className="block mt-2 text-xs text-amber-700 underline" onClick={() => setExpanded(true)}>Revisar aviso de transcripción</button>}
    </aside>}
  </Context.Provider>;
}
