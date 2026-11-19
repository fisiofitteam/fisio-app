"use client";
import { useEffect, useState } from "react";
export function RecordingTranscript({ recordingId, status }: { recordingId: string; status?: string }) {
  const [open, setOpen] = useState(false), [text, setText] = useState<string | null>(null), [error, setError] = useState(""), [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!open || text !== null) return;
    const controller = new AbortController(); setError("");
    fetch("/api/recordings/" + recordingId + "/transcript", { cache: "no-store", signal: controller.signal })
      .then(async r => { const data = await r.json(); if (!r.ok) throw Error(data.error || "No se pudo cargar la transcripción."); return data; })
      .then(data => { if (!controller.signal.aborted) setText(data.transcript || ""); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "No se pudo cargar."); });
    return () => controller.abort();
  }, [open, recordingId, text]);
  return <section className="rounded-lg border border-neutral-200 p-3">
    <button type="button" className="text-sm font-medium underline" aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? "Ocultar transcripción" : "Ver transcripción"}</button>
    {open && <div className="mt-3 space-y-2">
      <p className="text-xs text-neutral-500">Texto del micrófono · {status === "edited" ? "editado antes de guardar" : "transcripción automática en español"} · solo equipo</p>
      {status === "partial" && <p className="text-xs text-amber-700">La transcripción tuvo interrupciones y puede estar incompleta.</p>}
      {error ? <p role="alert" className="text-sm text-red-700">{error} <button type="button" className="underline" onClick={() => { setOpen(false); }}>Cerrar y reintentar</button></p> : text === null ? <p role="status" className="text-sm">Cargando transcripción…</p> : <>
        <p className="text-sm whitespace-pre-wrap break-words max-h-72 overflow-y-auto">{text || "No se obtuvo texto. Comprueba el micrófono y el permiso de reconocimiento de voz al iniciar la próxima grabación."}</p>
        {text && <div className="flex gap-3 text-sm">
          <button type="button" className="underline" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setError("No se pudo copiar. Puedes seleccionar el texto directamente."); } }}>{copied ? "Texto copiado" : "Copiar texto"}</button>
          <button type="button" className="underline" onClick={() => { const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = "transcripcion.txt"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Descargar texto</button>
        </div>}
      </>}
    </div>}
  </section>;
}
