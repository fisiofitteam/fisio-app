"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EvidenceDetailsEditor } from "@/components/EvidenceDetailsEditor";
import { AssignEvidenceClient } from "@/components/AssignEvidenceClient";
import { EVIDENCE_ZONES } from "@/lib/evidence-zones";
import { Folder, Trash2 } from "lucide-react";
import { uploadWhatsApp } from "@/lib/upload-whatsapp";
import { upload } from "@vercel/blob/client";
type Evidence = { id: string; title: string; updatedAt: string; patientId: string | null; name: string; bodyZone: string | null; kind: string; mimeType: string; url: string | null; notes: string | null; createdAt: string; patient: { fullName: string } | null };
export function PatientEvidenceLibrary({ patientId, compact = false, onSelectVideo }: { patientId?: string; compact?: boolean; onSelectVideo?: (url: string, name: string) => void }) {
  const [items, setItems] = useState<Evidence[]>([]);
  const [patients, setPatients] = useState<Array<{ id: string; fullName: string }>>([]);
  const [unassigned, setUnassigned] = useState(false);
  const [uploadPatient, setUploadPatient] = useState<{ id: string; fullName: string } | null>(null);
  const [choosingPatient, setChoosingPatient] = useState(false);
  const [assigning, setAssigning] = useState<Evidence | null>(null);
  const [zone, setZone] = useState("");
  const [uploadZone, setUploadZone] = useState("");
  const [folders, setFolders] = useState<Array<{ bodyZone: string | null; count: number }>>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Evidence | null>(null);
  const [title, setTitle] = useState("");
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
      if (zone) q.set("bodyZone", zone);
      if (patientId) q.set("patientId", patientId);
      else if (unassigned) q.set("unassigned", "1");
      const res = await fetch("/api/testimonials?" + q);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar");
      if (request !== requestId.current) return;
      setItems(data.items); setPatients(data.patients); setTotal(data.total); setFolders(data.folders || []);
      if (page && page * 30 >= data.total) setPage(Math.max(0, Math.ceil(data.total / 30) - 1));
    } catch (e) { if (request === requestId.current) setError(e instanceof Error ? e.message : "Error al cargar"); }
    finally { if (request === requestId.current) setLoading(false); }
  }
  useEffect(() => { void load(); return () => { requestId.current++; }; }, [patientId, unassigned, page, zone]);
  async function add(files: FileList | File[]) {
    if (busy) return;
    setBusy(true); setError("");
    const failures: string[] = [];
    let saved = 0;
    try {
      for (const file of Array.from(files)) {
        try {
          setProgress("Subiendo " + file.name);
          const txt = file.name.toLowerCase().endsWith(".txt");
          if (txt) {
            await uploadWhatsApp(file, { patientId: patientId || uploadPatient?.id || null, source: patientId ? "patient" : "general", title, notes, bodyZone: uploadZone || null }, setProgress);
            saved++; continue;
          }
          if (file.size > 1024 * 1024 * 1024) throw new Error("Archivo demasiado grande (máximo 1 GB).");
          const mimeType = file.type || (/\.mov$/i.test(file.name) ? "video/quicktime" : /\.mp4$/i.test(file.name) ? "video/mp4" : /\.heic$/i.test(file.name) ? "image/heic" : "");
          const res = await fetch("/api/testimonials", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ patientId: patientId || uploadPatient?.id || null, name: file.name, source: patientId ? "patient" : "general", title, notes, bodyZone: uploadZone || null, size: file.size, mimeType,
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
      if (saved) { setTitle(""); setNotes(""); if (page) setPage(0); else await load(); }
    } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  async function changeItem(item: Evidence, bodyZone?: string) {
    setEditing(item.id); setError("");
    try {
      const res = await fetch("/api/testimonials/" + item.id, { method: bodyZone === undefined ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" }, ...(bodyZone === undefined ? {} : { body: JSON.stringify({ bodyZone: bodyZone || null }) }) });
      if (!res.ok) throw new Error((await res.json()).error || "No se pudo guardar");
      setDeleting(null); setProgress(bodyZone === undefined ? "Testimonio eliminado." : "Zona actualizada."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); }
    finally { setEditing(null); }
  }
  return <div className="space-y-4">
    {deleting && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-evidence-title">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4">
        <h3 id="delete-evidence-title" className="font-semibold text-lg">¿Borrar este testimonio?</h3>
        <p className="text-sm break-words">{deleting.name}</p>
        <p className="text-sm text-neutral-600">Dejará de aparecer en Testimonios y en los éxitos del cliente. Los casos de éxito ya creados se conservarán.</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" className="btn btn-ghost" disabled={!!editing} onClick={() => setDeleting(null)}>Cancelar</button>
          <button type="button" className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm" disabled={!!editing} onClick={() => void changeItem(deleting)}>{editing ? "Borrando…" : "Borrar testimonio"}</button>
        </div>
      </div>
    </div>}
    {choosingPatient && <AssignEvidenceClient item={{ id: "", name: "Los archivos que subas quedarán vinculados a este paciente.", patientId: uploadPatient?.id || null }}
      patients={patients} onClose={() => setChoosingPatient(false)} onSelect={patient => { setUploadPatient(patient); setChoosingPatient(false); }} />}
    {assigning && <AssignEvidenceClient item={assigning} patients={patients} onClose={() => setAssigning(null)} onAssigned={async () => {
      setAssigning(null); setProgress("Cliente asignado. El material ya está disponible en su ficha."); await load();
    }} />}
    {!compact && <div><h2 className="text-lg font-semibold">{patientId ? "Éxitos" : "Testimonios"}</h2>
      <p className="text-sm text-neutral-500">{patientId ? "Material de este cliente, disponible para su caso de éxito. Lo que subas aquí no aparecerá en Testimonios general." : "Material subido desde esta página. Puedes vincularlo a un cliente para usarlo también en su caso de éxito."}</p></div>}
    <div className={"rounded-xl border-2 border-dashed p-4 " + (dragging ? "border-amber-500 bg-amber-50" : "border-neutral-200 bg-neutral-50")}
      onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); if (!busy) void add(e.dataTransfer.files); }}>
      {!patientId && <div className="mb-4 flex flex-wrap items-center gap-2">
        {uploadPatient && <span className="text-base font-semibold">{uploadPatient.fullName}</span>}
        <button type="button" disabled={busy || loading} onClick={() => setChoosingPatient(true)} className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-medium hover:bg-amber-500 disabled:opacity-50">{uploadPatient ? "Cambiar paciente" : "Asignar a paciente"}</button>
        {uploadPatient && <button type="button" disabled={busy} onClick={() => setUploadPatient(null)} className="text-xs text-neutral-500 underline">Quitar</button>}
      </div>}
      <label className="text-sm text-neutral-700 block mb-2">Título (opcional)
        <input className="input mt-1 text-sm w-full" maxLength={200} disabled={busy} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej.: Vuelta al entrenamiento sin dolor" />
      </label>
      <label className="text-sm text-neutral-700 block mb-2">Descripción / comentario del fisio (opcional)
        <textarea className="input mt-1 text-sm w-full" rows={2} maxLength={4000} disabled={busy} value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Qué ha conseguido, qué dice la captura o qué muestra el vídeo…" /></label>
      <label className="text-xs text-neutral-600 block mb-3">Zona corporal de los archivos
        <select className="input block mt-1 text-sm" value={uploadZone} disabled={busy} onChange={e => setUploadZone(e.target.value)}>
          <option value="">Sin etiquetar</option>
          {EVIDENCE_ZONES.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
        </select>
      </label>
      <input ref={input} type="file" multiple className="hidden" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,video/mp4,video/quicktime,video/webm,application/pdf,.txt"
        onChange={e => { if (e.target.files) void add(e.target.files); }} />
      <button type="button" className="btn btn-primary text-sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Subiendo…" : "Subir archivos"}</button>
      <span className="text-xs text-neutral-500 ml-3">O arrástralos aquí desde el Mac</span>
      <p className="text-xs text-neutral-400 mt-2">Imágenes, vídeos y PDF: hasta 1 GB. WhatsApp: TXT hasta 50 MB.</p>
    </div>
    {progress && <p role="status" className="text-sm text-emerald-700">{progress}</p>}
    {error && <p role="alert" className="text-sm text-red-700 whitespace-pre-wrap">{error}</p>}
    {!patientId && <div className="flex gap-2" aria-label="Filtrar testimonios">
      <button type="button" aria-pressed={!unassigned} disabled={busy} onClick={() => { setUnassigned(false); setPage(0); }} className={"rounded-full px-4 py-2 text-sm " + (!unassigned ? "bg-neutral-900 text-white" : "bg-neutral-100")}>Todos</button>
      <button type="button" aria-pressed={unassigned} disabled={busy} onClick={() => { setUnassigned(true); setPage(0); }} className={"rounded-full px-4 py-2 text-sm " + (unassigned ? "bg-neutral-900 text-white" : "bg-neutral-100")}>Pendientes de asignar</button>
    </div>}
    <section aria-label="Carpetas por zona corporal" className="space-y-2">
      <h3 className="text-sm font-semibold">Carpetas por zona corporal</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
        {[{ value: "", label: "Todos" }, ...EVIDENCE_ZONES].map(z => {
          const count = folders.filter(f => !z.value || (f.bodyZone || "unlabelled") === z.value).reduce((sum, f) => sum + f.count, 0);
          return <button type="button" key={z.value} aria-pressed={zone === z.value} disabled={busy || !!editing}
            onClick={() => { setZone(z.value); setPage(0); }}
            className={"rounded-xl border p-3 text-left flex items-center gap-2 " + (zone === z.value ? "border-amber-400 bg-amber-50" : "border-neutral-200 bg-white hover:bg-neutral-50")}>
            <Folder size={20} className="text-amber-600 shrink-0" /><span className="text-sm">{z.label}<span className="block text-xs text-neutral-500">{count} archivos</span></span>
          </button>;
        })}
      </div>
    </section>
    {loading ? <p className="text-sm text-neutral-400">Cargando material…</p> : !items.length ? <p className="text-sm text-neutral-500 py-4">No hay material en esta carpeta.</p> :
      <div className={"grid gap-3 " + (compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3")}>
        {items.map(item => <article key={item.id} className="rounded-xl border border-neutral-200 overflow-hidden bg-white">
          {item.kind === "image" && item.url && <a href={item.url} target="_blank" rel="noreferrer"><img src={item.url} alt={item.name} className="h-40 w-full object-contain bg-neutral-100" loading="lazy" /></a>}
          {item.kind === "video" && item.url && <video src={item.url} controls preload="metadata" className="h-40 w-full bg-neutral-900" />}
          {(item.kind === "document" || item.kind === "whatsapp") && <div className="bg-neutral-100 py-6 text-center text-sm">{item.kind === "whatsapp" ? "Conversación de WhatsApp" : "Documento PDF"}</div>}
          <div className="p-4 space-y-3">
            {item.patient && item.patientId
              ? <Link href={"/fisio/paciente/" + item.patientId + "/info/exitos"} className="block text-lg font-semibold text-neutral-900 hover:text-amber-700 hover:underline">{item.patient.fullName}</Link>
              : <span className="inline-block rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800">Sin asignar</span>}
            {item.title && <h3 className="font-semibold text-base break-words">{item.title}</h3>}
            {item.notes && <div className="rounded-lg bg-amber-50/60 p-3"><p className="text-xs text-neutral-500 mb-1">Descripción / comentario del fisio</p><p className="text-base leading-relaxed whitespace-pre-wrap text-neutral-800">{item.notes}</p></div>}
            <EvidenceDetailsEditor row={item} onSaved={() => { setProgress("Título y descripción guardados."); void load(); }} />
            {!patientId && <button type="button" className={"block rounded-lg px-3 py-2 text-sm font-medium " + (item.patientId ? "bg-neutral-100 text-neutral-700" : "bg-amber-400 text-neutral-900 hover:bg-amber-500")} onClick={() => setAssigning(item)}>
              {item.patientId ? "Cambiar cliente" : "Asignar a cliente"}
            </button>}
            <label className="block text-xs text-neutral-500 pt-2">Zona corporal
              <select aria-label={"Zona corporal de " + item.name} className="input block w-full mt-1 text-sm" value={item.bodyZone || ""} disabled={!!editing}
                onChange={e => void changeItem(item, e.target.value)}>
                <option value="">Sin etiquetar</option>
                {EVIDENCE_ZONES.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
              </select>
            </label>
            <p className="text-xs text-neutral-400">{new Date(item.createdAt).toLocaleDateString("es-ES")}</p>

            {item.url && <button type="button" className="block text-xs underline" onClick={async () => {
              try { await navigator.clipboard.writeText(item.url!); setProgress("Enlace copiado"); } catch { setError("No se pudo copiar. Abre el archivo para copiar su enlace."); }
            }}>Copiar enlace</button>}
            {onSelectVideo && item.kind === "video" && item.url && <button type="button" className="btn btn-ghost text-xs" onClick={() => onSelectVideo(item.url!, [item.title, item.notes].filter(Boolean).join(" · ") || item.name)}>Añadir al caso</button>}
            <a className="inline-block text-xs underline pt-2" href={item.kind === "whatsapp" ? "/api/testimonials/" + item.id : item.url || "#"} target="_blank" rel="noreferrer">Abrir / descargar</a>
            <button type="button" aria-label={"Borrar " + item.name} disabled={!!editing} onClick={() => setDeleting(item)} className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 pt-3"><Trash2 size={14} /> Borrar testimonio</button>
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
