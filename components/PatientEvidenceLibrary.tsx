"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { upload } from "@vercel/blob/client";
type Evidence = { id: string; patientId: string; name: string; kind: string; mimeType: string; url: string | null; notes: string | null; createdAt: string; patient: { fullName: string } };
export function PatientEvidenceLibrary({ patientId, compact = false, onSelectVideo }: { patientId?: string; compact?: boolean; onSelectVideo?: (url: string, name: string) => void }) {
  const [items, setItems] = useState<Evidence[]>([]);
  const [patients, setPatients] = useState<Array<{ id: string; fullName: string }>>([]);
  const [selected, setSelected] = useState(patientId || "");
  const [notes, setNotes] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  async function load() {
    const request = ++requestId.current;
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page) });
      if (selected) q.set("patientId", selected);
      const res = await fetch("/api/testimonials?" + q);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar");
      if (request !== requestId.current) return;
      setItems(data.items); setPatients(data.patients); setTotal(data.total);
    } catch (e) { if (request === requestId.current) setError(e instanceof Error ? e.message : "Error al cargar"); }
    finally { if (request === requestId.current) setLoading(false); }
  }
  useEffect(() => { void load(); return () => { requestId.current++; }; }, [selected, page]);
  async function add(files: FileList | File[]) {
    if (busy) return;
    if (!selected) { setError("Selecciona el cliente al que pertenece el material antes de subirlo."); return; }
    setBusy(true); setError("");
    const failures: string[] = [];
    let saved = 0;
    try {
      for (const file of Array.from(files)) {
        try {
          setProgress("Subiendo " + file.name);
          const txt = file.name.toLowerCase().endsWith(".txt");
          if (txt && file.size > 1024 * 1024) throw new Error("TXT demasiado grande (máximo 1 MB y 200.000 caracteres)");
          const mimeType = file.type || (/\.mov$/i.test(file.name) ? "video/quicktime" : /\.mp4$/i.test(file.name) ? "video/mp4" : /\.heic$/i.test(file.name) ? "image/heic" : "");
          const res = await fetch("/api/testimonials", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ patientId: selected, name: file.name, notes, size: file.size, mimeType,
              ...(txt ? { kind: "whatsapp", textContent: await file.text() } : {}) }) });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "No se pudo guardar");
          if (!txt) {
            const blob = await upload(data.pathname, file, { access: "public", handleUploadUrl: "/api/testimonials/upload",
              contentType: mimeType, clientPayload: JSON.stringify({ id: data.id }), multipart: file.size > 5 * 1024 * 1024,
              onUploadProgress: ({ percentage }) => setProgress(file.name + " · " + Math.round(percentage) + "%") });
            const confirmation = await fetch("/api/testimonials/" + data.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: blob.url }) });
            if (!confirmation.ok) throw new Error((await confirmation.json()).error || "No se pudo confirmar");
          }
          saved++;
        } catch (e) { failures.push(file.name + ": " + (e instanceof Error ? e.message : "No se pudo subir")); }
      }
      setProgress(saved ? saved + " archivo(s) guardado(s)" : "");
      setError(failures.join("\n"));
      if (saved) { setNotes(""); if (page) setPage(0); else await load(); }
    } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return <div className="space-y-4">
    {!compact && <div><h2 className="text-lg font-semibold">{patientId ? "Éxitos" : "Testimonios"}</h2>
      <p className="text-sm text-neutral-500">Vídeos, capturas y conversaciones vinculados a cada cliente. Disponibles también al crear su caso de éxito.</p></div>}
    {!patientId && <label className="block text-sm">Cliente
      <select className="input mt-1" disabled={busy} value={selected} onChange={e => { setSelected(e.target.value); setPage(0); }}>
        <option value="">Todos los clientes · selecciona uno para subir</option>
        {patients.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
      </select></label>}
    <div className={"rounded-xl border-2 border-dashed p-4 " + (dragging ? "border-amber-500 bg-amber-50" : "border-neutral-200 bg-neutral-50")}
      onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); if (!busy) void add(e.dataTransfer.files); }}>
      <label className="text-xs text-neutral-600 block mb-2">Contexto del material (opcional)
        <textarea className="input mt-1 text-sm w-full" rows={2} disabled={busy} value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Qué ha conseguido, qué dice la captura o qué muestra el vídeo…" /></label>
      <input ref={input} type="file" multiple className="hidden" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,video/mp4,video/quicktime,video/webm,application/pdf,.txt"
        onChange={e => { if (e.target.files) void add(e.target.files); }} />
      <button type="button" className="btn btn-primary text-sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Subiendo…" : "Subir archivos"}</button>
      <span className="text-xs text-neutral-500 ml-3">O arrástralos aquí desde el Mac</span>
      <p className="text-xs text-neutral-400 mt-2">Imágenes, vídeos y PDF: hasta 250 MB. WhatsApp: TXT hasta 200.000 caracteres.</p>
    </div>
    {progress && <p role="status" className="text-sm text-emerald-700">{progress}</p>}
    {error && <p role="alert" className="text-sm text-red-700 whitespace-pre-wrap">{error}</p>}
    {loading ? <p className="text-sm text-neutral-400">Cargando material…</p> : !items.length ? <p className="text-sm text-neutral-500 py-4">Todavía no hay material guardado.</p> :
      <div className={"grid gap-3 " + (compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3")}>
        {items.map(item => <article key={item.id} className="rounded-xl border border-neutral-200 overflow-hidden bg-white">
          {item.kind === "image" && item.url && <a href={item.url} target="_blank" rel="noreferrer"><img src={item.url} alt={item.name} className="h-40 w-full object-contain bg-neutral-100" loading="lazy" /></a>}
          {item.kind === "video" && item.url && <video src={item.url} controls preload="metadata" className="h-40 w-full bg-neutral-900" />}
          {(item.kind === "document" || item.kind === "whatsapp") && <div className="bg-neutral-100 py-6 text-center text-sm">{item.kind === "whatsapp" ? "Conversación de WhatsApp" : "Documento PDF"}</div>}
          <div className="p-3 space-y-1"><p className="font-medium text-sm break-words">{item.name}</p>
            <Link href={"/fisio/paciente/" + item.patientId + "/info/exitos"} className="text-xs text-amber-700">{item.patient.fullName}</Link>
            <p className="text-xs text-neutral-400">{new Date(item.createdAt).toLocaleDateString("es-ES")}</p>
            {item.notes && <p className="text-xs whitespace-pre-wrap text-neutral-600">{item.notes}</p>}
            {item.url && <button type="button" className="block text-xs underline" onClick={async () => {
              try { await navigator.clipboard.writeText(item.url!); setProgress("Enlace copiado"); } catch { setError("No se pudo copiar. Abre el archivo para copiar su enlace."); }
            }}>Copiar enlace</button>}
            {onSelectVideo && item.kind === "video" && item.url && <button type="button" className="btn btn-ghost text-xs" onClick={() => onSelectVideo(item.url!, item.notes || item.name)}>Añadir al caso</button>}
            <a className="inline-block text-xs underline pt-2" href={item.kind === "whatsapp" ? "/api/testimonials/" + item.id : item.url || "#"} target="_blank" rel="noreferrer">Abrir / descargar</a>
          </div>
        </article>)}
      </div>}
    {total > 30 && <div className="flex justify-between text-sm">
      <button type="button" disabled={!page || loading || busy} onClick={() => setPage(p => p - 1)}>← Anterior</button>
      <span>{page * 30 + 1}–{Math.min((page + 1) * 30, total)} de {total}</span>
      <button type="button" disabled={(page + 1) * 30 >= total || loading || busy} onClick={() => setPage(p => p + 1)}>Siguiente →</button>
    </div>}
  </div>;
}
