"use client";
import { useRef, useState, type ClipboardEvent } from "react";
import { upload } from "@vercel/blob/client";
import { FileUp, Link2, Paperclip, X } from "lucide-react";
import { SUPPORT_FILE_ACCEPT, SUPPORT_FILE_LIMIT, SUPPORT_MATERIAL_LIMIT, supportFileMime, supportWebUrl, type SupportFile, type SupportMaterialLink } from "@/lib/support/materials-contract";
import { supportFetch } from "./api";

type DraftFile = { key: string; name: string; id?: string; href?: string; status: "uploading" | "ready" | "error" | "removing"; progress: number; error?: string };
type DraftLink = SupportMaterialLink & { key: string };
export function useSupportMaterials() {
  const [files, setFiles] = useState<DraftFile[]>([]), [links, setLinks] = useState<DraftLink[]>([]), [error, setError] = useState("");
  const inFlight = useRef(false);
  const patch = (key: string, data: Partial<DraftFile>) => setFiles(old => old.map(f => f.key === key ? { ...f, ...data } : f));
  async function addFiles(chosen: File[]) {
    if (inFlight.current) return;
    if (files.length + chosen.length > SUPPORT_MATERIAL_LIMIT) { setError("Puedes adjuntar hasta 8 archivos por envío."); return; }
    for (const file of chosen) {
      if (!supportFileMime(file)) { setError("Formato no admitido: " + file.name + ". Usa una imagen, vídeo, audio, PDF, documento, hoja de cálculo, texto o ZIP."); return; }
      if (!file.size || file.size > SUPPORT_FILE_LIMIT) { setError("Cada archivo debe ocupar entre 1 byte y 100 MB."); return; }
    }
    if (!chosen.length) return;
    inFlight.current = true; setError("");
    const entries = chosen.map(file => ({ file, key: crypto.randomUUID() }));
    setFiles(old => [...old, ...entries.map(({ file, key }) => ({ key, name: file.name, status: "uploading" as const, progress: 0 }))]);
    try {
      for (const { file, key } of entries) {
        try {
          const mime = supportFileMime(file)!;
          const reserved = await supportFetch<SupportFile & { pathname: string }>("/api/support/attachments", { name: file.name, mime, size: file.size });
          patch(key, { id: reserved.id });
          await upload(reserved.pathname, file, { access: "private", handleUploadUrl: "/api/support/upload", clientPayload: JSON.stringify({ id: reserved.id }),
            contentType: mime, multipart: file.size > 5 * 1024 * 1024, onUploadProgress: e => patch(key, { progress: Math.round(e.percentage) }) });
          await supportFetch<SupportFile>("/api/support/attachments/" + reserved.id, {});
          patch(key, { status: "ready", progress: 100, href: reserved.href });
        } catch (e) { patch(key, { status: "error", error: e instanceof Error ? e.message : "No se ha podido subir. Retira el archivo y vuelve a añadirlo." }); }
      }
    } finally { inFlight.current = false; }
  }
  async function removeFile(file: DraftFile) {
    if (inFlight.current) return;
    patch(file.key, { status: "removing" });
    try {
      if (file.id) await supportFetch("/api/support/attachments/" + file.id, {}, "DELETE");
      setFiles(old => old.filter(f => f.key !== file.key));
    } catch (e) { patch(file.key, { status: "error", error: e instanceof Error ? e.message : "No se ha podido retirar. Inténtalo otra vez." }); }
  }
  function onPaste(e: ClipboardEvent) {
    const images = Array.from(e.clipboardData.files).filter(file => file.type.startsWith("image/"));
    if (images.length) { e.preventDefault(); void addFiles(images); }
  }
  return {
    files, links, error, addFiles, removeFile, onPaste,
    busy: files.some(f => f.status === "uploading" || f.status === "removing"),
    blocked: files.some(f => f.status !== "ready") || links.some(l => l.url.trim() && !supportWebUrl(l.url.trim())),
    value: { attachmentIds: files.filter(f => f.status === "ready").map(f => f.id!), links: links.filter(l => l.url.trim()).map(l => ({ title: l.title.trim(), url: l.url.trim() })) },
    addLink: () => setLinks(old => old.length < 8 ? [...old, { key: crypto.randomUUID(), title: "", url: "" }] : old),
    setLink: (key: string, data: Partial<SupportMaterialLink>) => setLinks(old => old.map(l => l.key === key ? { ...l, ...data } : l)),
    removeLink: (key: string) => setLinks(old => old.filter(l => l.key !== key)),
    clear: () => { setFiles([]); setLinks([]); setError(""); },
  };
}
export function SupportMaterialsEditor({ draft, disabled = false }: { draft: ReturnType<typeof useSupportMaterials>; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const locked = disabled || draft.busy;
  return <div className="space-y-3">
    <div><p className="text-xs font-semibold">Capturas, archivos y vídeos</p><p className="text-xs text-neutral-500 mt-1">Arrastra archivos aquí o pega una captura. Hasta 8 archivos de 100 MB por envío.</p></div>
    <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!locked) void draft.addFiles(Array.from(e.dataTransfer.files)); }} className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-3">
      <input ref={input} type="file" multiple accept={SUPPORT_FILE_ACCEPT} className="sr-only" tabIndex={-1} aria-label="Archivos para la propuesta" disabled={locked} onChange={e => { void draft.addFiles(Array.from(e.target.files || [])); e.target.value = ""; }} />
      <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-ghost text-xs" disabled={locked || draft.files.length >= 8} onClick={() => input.current?.click()}><FileUp size={14} />Añadir archivos</button><button type="button" className="btn btn-ghost text-xs" disabled={disabled || draft.links.length >= 8} onClick={draft.addLink}><Link2 size={14} />Añadir enlace</button></div>
      <p className="text-[11px] text-neutral-500 mt-2">Imágenes, vídeos, audios, PDF, documentos, hojas de cálculo y ZIP. Para Loom o el grabador de FisioFit, añade el enlace.</p>
    </div>
    {draft.error && <p role="alert" className="text-xs text-red-700">{draft.error}</p>}
    {draft.files.map(file => <div key={file.key} className="rounded-lg border border-neutral-200 p-3 flex items-start gap-2 text-xs">
      <Paperclip size={15} className="shrink-0 mt-0.5" /><div className="min-w-0 flex-1">{file.status === "ready" && file.href ? <a href={file.href} target="_blank" rel="noopener noreferrer" className="font-medium break-all underline">{file.name} ↗</a> : <p className="font-medium break-all">{file.name}</p>}<p role="status" className={file.status === "error" ? "text-red-700 mt-1" : "text-neutral-500 mt-1"}>{file.status === "uploading" ? `Subiendo… ${file.progress}%` : file.status === "ready" ? "Listo para enviar" : file.status === "removing" ? "Retirando…" : file.error}</p></div>
      <button type="button" aria-label={"Retirar " + file.name} onClick={() => draft.removeFile(file)} disabled={locked || file.status === "removing"} className="p-1"><X size={15} /></button>
    </div>)}
    {draft.links.map((link, index) => <div key={link.key} className="rounded-xl border border-neutral-200 p-3 space-y-2">
      <div className="flex items-center justify-between"><p className="text-xs font-semibold">Enlace {index + 1}</p><button type="button" aria-label={"Retirar enlace " + (index + 1)} disabled={disabled} onClick={() => draft.removeLink(link.key)} className="p-1"><X size={14} /></button></div>
      <label className="block text-xs">URL de Loom, grabación o recurso<input type="url" className="input mt-1" value={link.url} maxLength={1800} disabled={disabled} placeholder="https://www.loom.com/share/…" onChange={e => draft.setLink(link.key, { url: e.target.value })} /></label>
      <label className="block text-xs">Título del enlace (opcional)<input className="input mt-1" value={link.title} maxLength={120} disabled={disabled} placeholder="Así ocurre el problema" onChange={e => draft.setLink(link.key, { title: e.target.value })} /></label>
      {link.url.trim() && !supportWebUrl(link.url.trim()) && <p className="text-xs text-red-700">Introduce un enlace completo que empiece por https://.</p>}
    </div>)}
  </div>;
}
