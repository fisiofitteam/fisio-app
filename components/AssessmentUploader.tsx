"use client";
import { useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import { parseAssessment, MAX_ASSESSMENT_BYTES, ASSESSMENT_MIMES } from "@/lib/assessments";
import { youtubeEmbedUrl } from "@/lib/youtube";
export function AssessmentUploader({ sessionId, task, onBusyChange }: { sessionId: string; task: any; onBusyChange?: (busy: boolean) => void }) {
  const assessment = parseAssessment(task.assessment);
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<{ id: string; pathname: string } | null>(null);
  async function load() {
    const r = await fetch("/api/assessments?sessionId=" + encodeURIComponent(sessionId), { cache: "no-store" });
    if (!r.ok) throw new Error("No se pudieron cargar tus entregas.");
    setRows(await r.json());
  }
  useEffect(() => { load().catch(e => setError(e.message)).finally(() => setLoading(false)); }, [sessionId]);
  useEffect(() => {
    onBusyChange?.(!!busy);
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    if (busy) window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("beforeunload", warn); onBusyChange?.(false); };
  }, [busy]);
  async function confirm(p: { id: string; pathname: string }) {
    const r = await fetch("/api/assessments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...p, action: "confirm" }) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "No se pudo confirmar el vídeo.");
    setPending(null);
    await load();
  }
  async function send(testId: string, file: File) {
    setError("");
    const mimeType = file.type || (/\.mov$/i.test(file.name) ? "video/quicktime" : /\.mp4$/i.test(file.name) ? "video/mp4" : /\.webm$/i.test(file.name) ? "video/webm" : "");
    if (!ASSESSMENT_MIMES.includes(mimeType) || file.size > MAX_ASSESSMENT_BYTES || file.size === 0) { setError("Elige un vídeo MP4, MOV o WebM de hasta 1 GB."); return; }
    setBusy(testId); setProgress(0);
    try {
      const r = await fetch("/api/assessments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, taskId: task.id, testId, mimeType, size: file.size }) });
      const p = await r.json();
      if (!r.ok) throw new Error(p.error || "No se pudo preparar la subida.");
      await upload(p.pathname, file, { access: "private", contentType: mimeType, handleUploadUrl: "/api/assessments/upload", clientPayload: JSON.stringify({ id: p.id }), multipart: true, onUploadProgress: e => setProgress(Math.round(e.percentage)) });
      setPending(p);
      await confirm(p);
    } catch (e) { setError(e instanceof Error ? e.message : "La subida ha fallado. Vuelve a seleccionar el vídeo para reintentarlo."); }
    finally { setBusy(null); }
  }
  const delivered = assessment.tests.filter(t => rows.some(r => r.taskId === task.id && r.testId === t.id && r.url)).length;
  return <div className="space-y-4">
    {assessment.instructions && <p className="text-sm whitespace-pre-wrap">{assessment.instructions}</p>}
    <p className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-950">Recorta cada vídeo a <strong>un minuto como máximo</strong>. Puedes subir archivos de hasta 1 GB. Mantén esta pantalla abierta hasta que termine la subida.</p>
    <p className="text-xs" aria-live="polite">{loading ? "Cargando entregas…" : delivered + " de " + assessment.tests.length + " test entregados"}</p>
    {!assessment.tests.length && <p className="text-sm">Tu fisio está preparando los test de esta valoración.</p>}
    {assessment.tests.map((t, i) => {
      const row = rows.find(r => r.taskId === task.id && r.testId === t.id);
      const embed = t.videoUrl && youtubeEmbedUrl(t.videoUrl);
      return <section key={t.id} className="rounded-xl border border-neutral-200 p-3 space-y-3">
        <div className="flex justify-between gap-2"><h3 className="font-semibold text-sm">{i + 1}. {t.name}</h3><span className="text-xs">{row?.reviewedAt ? "✓ Revisado" : row?.url ? "✓ Recibido" : "Pendiente de subir"}</span></div>
        {t.instructions && <p className="text-sm whitespace-pre-wrap">{t.instructions}</p>}
        {t.videoUrl && <details><summary className="cursor-pointer text-sm">Ver vídeo de ejemplo</summary>{embed ? <iframe src={embed} title={"Ejemplo: " + t.name} className="w-full aspect-video rounded-lg mt-2" allowFullScreen /> : <a href={t.videoUrl} target="_blank" rel="noreferrer" className="text-sm underline">Abrir ejemplo</a>}</details>}
        {row?.url && <video src={row.url} controls playsInline preload="metadata" className="w-full max-h-72 rounded-lg bg-black" />}
        {row?.coachNotes && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900 whitespace-pre-wrap"><strong>Comentario de tu fisio: </strong>{row.coachNotes}</p>}
        {!row?.reviewedAt && <label className={"inline-flex cursor-pointer items-center rounded-lg px-4 py-2 text-sm font-semibold focus-within:ring-2 focus-within:ring-indigo-400 " + (busy || loading || pending ? "opacity-50" : "")} style={{ background: "var(--p-accent, #171717)", color: "var(--p-accent-ink, #ffffff)" }}>{row?.url ? "Sustituir mi vídeo" : "Subir vídeo de este test"}<input type="file" accept="video/mp4,video/quicktime,video/webm,.mov,.mp4,.webm" disabled={!!busy || loading || !!pending} className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) void send(t.id, f); e.target.value = ""; }} /></label>}
        {busy === t.id && <div role="status" className="text-sm"><progress max={100} value={progress} className="w-full" />{progress < 100 ? "Subiendo… " + progress + "%" : "Confirmando vídeo…"}</div>}
      </section>;
    })}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {pending && !busy && <button type="button" className="btn btn-ghost text-sm" onClick={async () => { setBusy("confirm"); setError(""); try { await confirm(pending); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo confirmar."); } finally { setBusy(null); } }}>Reintentar confirmación</button>}
  </div>;
}
