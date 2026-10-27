"use client";
import { useEffect, useRef, useState } from "react";
import { AssessmentMaterial } from "@/components/AssessmentMaterial";
import type { CaseAttachment } from "@/lib/case-attachments";
type Material = { id: string; name: string; title?: string; kind: string; url: string | null; notes: string | null };
export function CaseMaterialPicker({ patientId, sectionLabel, existing, onClose, onConfirm }: {
  patientId: string; sectionLabel: string; existing: CaseAttachment[];
  onClose: () => void; onConfirm: (chosen: CaseAttachment[]) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [source, setSource] = useState<"testimonials" | "assessments">("testimonials");
  const [items, setItems] = useState<Material[]>([]);
  const [selected, setSelected] = useState<Map<string, Material>>(new Map());
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    (async () => {
      try {
        const res = await fetch("/api/testimonials?" + new URLSearchParams({ patientId, page: String(page) }));
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "No se pudo cargar el material.");
        if (!cancelled) { setItems(data.items); setTotal(data.total); }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "No se pudo cargar."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [patientId, page]);
  function toggle(item: Material) {
    setSelected(prev => { const next = new Map(prev); next.has(item.id) ? next.delete(item.id) : next.set(item.id, item); return next; });
  }
  return <dialog ref={dialog} aria-labelledby="case-material-title" onCancel={e => { e.preventDefault(); onClose(); }}
    onClick={e => e.stopPropagation()} className="w-[calc(100%-2rem)] max-w-2xl max-h-[85vh] rounded-2xl p-0 shadow-xl backdrop:bg-black/50">
    <header className="sticky top-0 z-10 bg-white border-b p-4 flex justify-between gap-3">
      <div><h3 id="case-material-title" className="font-semibold">Material del cliente</h3><p className="text-sm text-neutral-600 mt-1">{sectionLabel}</p></div>
      <button type="button" aria-label="Cerrar selector de material" onClick={onClose} className="px-2">✕</button>
    </header>
    <div className="p-4">
      <p className="text-xs text-neutral-500 mb-3">Selecciona vídeos, capturas o PDF para este apartado. Las conversaciones de WhatsApp se incorporan desde «Importar WhatsApp».</p>
      <div className="flex gap-2 mb-4" aria-label="Origen del material">
        <button type="button" aria-pressed={source === "testimonials"} onClick={() => setSource("testimonials")} className={"rounded-lg px-3 py-2 text-sm " + (source === "testimonials" ? "bg-amber-100 text-amber-900" : "bg-neutral-100")}>Testimonios</button>
        <button type="button" aria-pressed={source === "assessments"} onClick={() => setSource("assessments")} className={"rounded-lg px-3 py-2 text-sm " + (source === "assessments" ? "bg-amber-100 text-amber-900" : "bg-neutral-100")}>Vídeos de test</button>
      </div>
      {source === "assessments" ? <AssessmentMaterial patientId={patientId} existing={existing} selectedIds={Array.from(selected.keys())} onToggle={toggle} /> : <>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {loading ? <p className="text-sm text-neutral-500 py-6">Cargando material…</p> :
        !items.length ? <p className="text-sm text-neutral-500 py-6">Todavía no hay material. Puedes subirlo desde Éxitos.</p> :
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.filter(item => item.url).map(item => {
            const already = existing.some(v => v.url === item.url), checked = selected.has(item.id);
            return <button type="button" key={item.id} disabled={already} aria-pressed={checked || already}
              onClick={() => toggle(item)} className={"rounded-xl overflow-hidden border-2 text-left disabled:opacity-60 " + (checked || already ? "border-amber-500 bg-amber-50" : "border-neutral-200")}>
              {item.kind === "image" ? <img src={item.url!} alt={item.notes || "Captura del cliente"} className="h-32 w-full object-contain bg-neutral-100" loading="lazy" /> :
                item.kind === "video" ? <video src={item.url!} muted playsInline preload="metadata" className="h-32 w-full object-contain bg-neutral-900" /> :
                <div className="h-32 bg-neutral-100 flex items-center justify-center text-sm">📄 Documento PDF</div>}
              <div className="p-2">{item.title && <h4 className="font-semibold text-sm break-words mb-1">{item.title}</h4>}<p className="text-sm whitespace-pre-wrap line-clamp-3">{item.notes || (item.kind === "video" ? "Vídeo del cliente" : item.kind === "image" ? "Captura del cliente" : "Documento del cliente")}</p>
                <span className="text-xs text-amber-800">{already ? "Ya adjuntado" : checked ? "✓ Seleccionado" : "Seleccionar"}</span></div>
            </button>;
          })}
          {items.every(item => !item.url) && <p className="col-span-full text-sm text-neutral-500">En esta página solo hay conversaciones de WhatsApp.</p>}
        </div>}
      {total > 30 && <div className="flex justify-between items-center mt-4 text-sm">
        <button type="button" disabled={!page || loading} onClick={() => setPage(p => p - 1)}>← Anterior</button>
        <span>Página {page + 1} de {Math.ceil(total / 30)}</span>
        <button type="button" disabled={(page + 1) * 30 >= total || loading} onClick={() => setPage(p => p + 1)}>Siguiente →</button>
      </div>}
      </>}
    </div>
    <footer className="sticky bottom-0 bg-white border-t p-4 flex justify-end gap-3">
      <button type="button" onClick={onClose} className="text-sm text-neutral-500">Cancelar</button>
      <button type="button" disabled={!selected.size} className="btn btn-primary text-sm" onClick={() => onConfirm(Array.from(selected.values()).map(item => ({ url: item.url!, caption: [item.title, item.notes].filter(Boolean).join(" · ") || item.name, kind: item.kind })))}>
        Adjuntar {selected.size || ""} al apartado
      </button>
    </footer>
  </dialog>;
}
