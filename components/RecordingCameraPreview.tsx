"use client";
import { useEffect, useRef, useState } from "react";

/** Displays the recorder's existing video-only stream; never owns/stops its tracks. */
export function RecordingCameraPreview({ stream, paused }: { stream: MediaStream; paused: boolean }) {
  const video = useRef<HTMLVideoElement>(null), active = useRef(false);
  const [ready, setReady] = useState(false), [floating, setFloating] = useState(false);
  const [pipSupported, setPipSupported] = useState(false), [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = video.current!;
    active.current = true;
    setReady(false); setFloating(false); setError("");
    setPipSupported(!!document.pictureInPictureEnabled && typeof element.requestPictureInPicture === "function");
    const loaded = () => { if (active.current) setReady(true); };
    const entered = () => { if (active.current) setFloating(true); };
    const left = () => {
      if (!active.current) return;
      setFloating(false);
      // Some browsers pause the preview when their floating window is closed.
      void element.play().catch(() => { if (active.current) setError("Pulsa «Activar vista de cámara» para volver a verte."); });
    };
    element.addEventListener("loadeddata", loaded);
    element.addEventListener("enterpictureinpicture", entered);
    element.addEventListener("leavepictureinpicture", left);
    element.srcObject = stream;
    void element.play().catch(() => { if (active.current) setError("Pulsa «Activar vista de cámara» para verte mientras grabas."); });
    return () => {
      active.current = false;
      element.removeEventListener("loadeddata", loaded);
      element.removeEventListener("enterpictureinpicture", entered);
      element.removeEventListener("leavepictureinpicture", left);
      if (document.pictureInPictureElement === element) void document.exitPictureInPicture().catch(() => {});
      element.pause(); element.srcObject = null;
      // Capture/composition and preview share tracks; only the recorder stops them.
    };
  }, [stream]);

  async function toggleFloating() {
    const element = video.current;
    if (!element || !ready || opening) return;
    setOpening(true); setError("");
    try {
      if (document.pictureInPictureElement === element) await document.exitPictureInPicture();
      else {
        // Called directly from a click: entering PiP requires a fresh user gesture.
        await element.requestPictureInPicture();
        if (!active.current && document.pictureInPictureElement === element) await document.exitPictureInPicture();
      }
    } catch {
      if (active.current) setError("No se ha podido abrir la cámara flotante. Tu cámara sigue disponible en la burbuja de esta página.");
    } finally { if (active.current) setOpening(false); }
  }

  return <div className="space-y-2">
    <div className="flex items-center gap-3 flex-wrap text-sm">
      <span>{floating ? "Tu cámara está en la ventana flotante." : "Tu cámara está visible en la burbuja."}</span>
      {pipSupported && <button type="button" className="btn btn-ghost" disabled={!ready || opening} onClick={toggleFloating}>
        {floating ? "Volver a la burbuja" : "Cámara flotante"}
      </button>}
      {error && <button type="button" className="underline" onClick={() => {
        void video.current?.play().then(() => setError("")).catch(() => setError("No se puede mostrar la cámara. La grabación continúa."));
      }}>Activar vista de cámara</button>}
    </div>
    {!floating && pipSupported && <p className="text-xs text-neutral-500">Pulsa «Cámara flotante» para seguir viéndote sobre WhatsApp u otra ventana.</p>}
    {error && <p role="status" className="text-sm text-amber-700">{error}</p>}
    <div className={"fixed bottom-5 right-5 z-50 flex flex-col items-center gap-2 " + (floating ? "invisible pointer-events-none" : "")}>
      <video ref={video} aria-label="Tu cámara en directo" autoPlay muted playsInline
        className="h-40 w-40 sm:h-48 sm:w-48 rounded-full object-cover bg-neutral-950 border-4 border-white shadow-xl" />
      <span className="rounded-full bg-neutral-950 px-3 py-1 text-xs font-medium text-white shadow-lg">{paused ? "En pausa · cámara en directo" : "● Tu cámara en directo"}</span>
    </div>
  </div>;
}
