"use client";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Play } from "lucide-react";

export type AssessmentPlayback = { seek: (seconds: number) => void };
type Props = { src: string; label: string; className: string; playerRef?: Ref<AssessmentPlayback> };
type Phase = "idle" | "loading" | "ready" | "failed";

type Availability = "available" | "access" | "missing" | "changed" | "temporary";
const advice = {
  access: "Este vídeo no está disponible para tu sesión. Comprueba que has iniciado sesión con una cuenta que tiene acceso a la ficha.",
  missing: "Este vídeo ya no está disponible. Abre de nuevo la ficha para ver las entregas actuales.",
  changed: "El vídeo se ha sustituido desde que abriste esta página. Abre la versión actual en otra pestaña para conservar tus cambios aquí.",
  temporary: "No se ha podido conectar con el vídeo. Vuelve a intentarlo en unos segundos.",
};
function availability(r: Response): Availability {
  if (r.type === "opaqueredirect" || (r.status >= 300 && r.status < 400) || r.status === 401 || r.status === 403) return "access";
  if (r.status === 404 || r.status === 410) return "missing";
  if (r.status === 409) return "changed";
  return r.ok ? "available" : "temporary";
}

function failureReason(code?: number) {
  if (code === 2) return "Se ha interrumpido la carga del vídeo.";
  if (code === 3 || code === 4) return "Este navegador no ha podido reproducir el vídeo. Si el formato no es compatible, puedes abrir el original en tu dispositivo.";
  return "No se ha podido reproducir el vídeo.";
}

// A review can contain several closed batteries. No media URL is attached to a video
// element until that particular clip is played or a timestamp is explicitly requested.
export function AssessmentVideoPlayer(props: Props) {
  return <Clip key={props.src} {...props} />;
}
function Clip({ src, label, className, playerRef }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const pendingSeek = useRef<number | null>(null);
  const attempt = useRef(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [slow, setSlow] = useState(false);
  const [diagnosis, setDiagnosis] = useState<Availability | null>(null);
  const [requestId, setRequestId] = useState(0);
  const downloadUrl = src + (src.includes("?") ? "&" : "?") + "download=1";

  useEffect(() => {
    const element = video.current;
    return () => {
      attempt.current++;
      if (element?.hasAttribute("src")) {
        element.removeAttribute("src");
        element.load();
      }
    };
  }, []);
  useEffect(() => {
    setSlow(false);
    if (phase !== "loading") return;
    const timer = window.setTimeout(() => setSlow(true), 9000);
    return () => window.clearTimeout(timer);
  }, [phase, requestId]);

  // MediaError hides the HTTP status. Probe only an actual failure, never idle cards
  // or a buffering video. A redirect here means the app requires a new login.
  useEffect(() => {
    if (phase !== "failed") return;
    const ctrl = new AbortController();
    let live = true;
    const timer = window.setTimeout(() => ctrl.abort(), 5000);
    fetch(src, { method: "HEAD", credentials: "same-origin", redirect: "manual", cache: "no-store", signal: ctrl.signal })
      .then(r => { if (live) setDiagnosis(availability(r)); })
      .catch(() => { if (live) setDiagnosis("temporary"); })
      .finally(() => window.clearTimeout(timer));
    return () => { live = false; ctrl.abort(); window.clearTimeout(timer); };
  }, [phase, src, requestId]);

  function play() {
    const el = video.current;
    if (!el) return;
    const token = ++attempt.current; setRequestId(token);
    pendingSeek.current = null;
    setDiagnosis(null); setError(""); setSlow(false); setPhase("loading");
    if (!el.hasAttribute("src")) el.src = src;
    else if (el.error || slow || phase === "failed") el.load();
    // On mobile browsers play() must run during this actual tap, not in an effect.
    el.play().catch((reason: unknown) => {
      if (attempt.current !== token || (reason instanceof DOMException && reason.name === "AbortError")) return;
      setError(failureReason(el.error?.code)); setPhase("failed");
    });
  }
  function moveTo(el: HTMLVideoElement, seconds: number) {
    el.currentTime = Math.min(Math.max(0, seconds), Number.isFinite(el.duration) ? el.duration : seconds);
    el.pause();
  }
  useImperativeHandle(playerRef, () => ({
    seek(seconds) {
      if (!Number.isFinite(seconds)) return;
      const el = video.current;
      if (!el) return;
      setRequestId(++attempt.current);
      el.pause(); setError(""); setDiagnosis(null);
      if (el.readyState >= 1 && !el.error) {
        pendingSeek.current = null;
        moveTo(el, seconds); setPhase("ready");
      } else {
        pendingSeek.current = seconds; setPhase("loading");
        el.preload = "auto";
        if (!el.hasAttribute("src")) el.src = src;
        el.load();
      }
    },
  }), [src]);
  const reopen = diagnosis === "missing" || diagnosis === "changed" || diagnosis === "access";
  const showFallback = (phase === "failed" && !!diagnosis) || (phase === "loading" && slow);
  return <div data-assessment-player className="space-y-1">
    <div className="relative">
      <video ref={video} controls={phase !== "idle"} playsInline preload="none" aria-label={label} className={"block " + className}
        onPlay={() => setPhase("loading")}
        onWaiting={() => setPhase(p => p === "idle" || p === "failed" ? p : "loading")}
        onPlaying={() => { setError(""); setPhase("ready"); }}
        onPause={e => { if (e.currentTarget.readyState >= 2 && !e.currentTarget.error && pendingSeek.current == null) setPhase("ready"); }}
        onLoadedMetadata={e => { const t = pendingSeek.current; if (t !== null) { pendingSeek.current = null; moveTo(e.currentTarget, t); } }}
        onLoadedData={e => { if (e.currentTarget.paused && !e.currentTarget.error) setPhase("ready"); }}
        onSeeked={e => { if (!e.currentTarget.error && e.currentTarget.readyState >= 2) setPhase("ready"); }}
        onError={e => { if (!e.currentTarget.error) return; setError(failureReason(e.currentTarget.error.code)); setPhase("failed"); }} />
      {phase === "idle" && <button type="button" aria-label={"Reproducir vídeo: " + label} onClick={play}
        className="absolute inset-0 flex w-full items-center justify-center rounded-lg text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500">
        <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow"><Play aria-hidden="true" size={16} fill="currentColor" />Reproducir vídeo</span>
      </button>}
    </div>
    {phase === "loading" && <p role="status" className="text-xs">{slow ? "El vídeo está tardando en cargar." : "Cargando vídeo…"}</p>}
    {phase === "failed" && <p role="alert" className="text-sm">{diagnosis === "available" ? error : diagnosis ? advice[diagnosis] : "No se ha podido reproducir el vídeo."}</p>}
    {showFallback && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      {phase === "failed" && reopen
        ? <a href={window.location.href} target="_blank" rel="noopener noreferrer" className="underline">Abrir esta página en otra pestaña</a>
        : <><button type="button" className="underline" onClick={play}>Reintentar</button>
          {diagnosis !== "temporary" && <a href={downloadUrl} download className="underline">Descargar original</a>}</>}
    </div>}
  </div>;
}
