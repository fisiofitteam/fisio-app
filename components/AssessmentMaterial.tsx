"use client";
import { useEffect, useState } from "react";
import { AssessmentVideoLabels } from "@/components/AssessmentVideoLabels";
import type { CaseAttachment } from "@/lib/case-attachments";
type Delivery = { id: string; version: string; videoTitle: string; videoDescription: string; testTitle: string; assessmentTitle: string; assessedAt: string; url: string; coachNotes: string; reviewedAt: string | null };
type Material = { id: string; name: string; kind: string; url: string; notes: string };
export function AssessmentMaterial({ patientId, existing = [], selectedIds = [], onToggle }: {
  patientId: string; existing?: CaseAttachment[]; selectedIds?: string[]; onToggle?: (item: Material) => void;
}) {
  const [items, setItems] = useState<Delivery[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    (async () => {
      try {
        const res = await fetch("/api/assessments?" + new URLSearchParams({ patientId, material: "1", page: String(page) }));
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "No se pudieron cargar los vídeos.");
        if (!cancelled) { setItems(data.items); setTotal(data.total); }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "No se pudieron cargar los vídeos."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [patientId, page]);
  return <section className="space-y-3" aria-label="Vídeos de los test">
    {!onToggle && <div><h2 className="text-lg font-semibold">Vídeos de los test</h2><p className="text-sm text-neutral-500">Valoraciones del cliente, disponibles también al crear su caso de éxito.</p></div>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {loading ? <p className="text-sm text-neutral-500">Cargando vídeos…</p> : !items.length ? <p className="text-sm text-neutral-500">Este cliente todavía no ha subido vídeos de sus test.</p> :
      <div className={"grid gap-3 " + (onToggle ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3")}>
        {items.map(item => {
          const id = "assessment:" + item.id;
          const already = existing.some(v => v.url === item.url);
          const selected = selectedIds.includes(id);
          return <article key={id} className={"rounded-xl border overflow-hidden bg-white " + (selected || already ? "border-amber-500" : "border-neutral-200")}>
            <video src={item.url} controls playsInline preload="metadata" className="h-40 w-full bg-neutral-900" />
            <div className="p-3 space-y-2">
              <h3 className="font-semibold">{item.videoTitle || item.testTitle}</h3>
              {item.videoDescription && <p className="text-sm whitespace-pre-wrap break-words">{item.videoDescription}</p>}
              <p className="text-sm text-neutral-600">{item.testTitle} · {item.assessmentTitle} · {new Date(item.assessedAt).toLocaleDateString("es-ES")}</p>
              <span className={"inline-block rounded-full px-2 py-1 text-xs " + (item.reviewedAt ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800")}>{item.reviewedAt ? "Revisado" : "Pendiente de revisión"}</span>
              {item.coachNotes && <div className="rounded-lg bg-amber-50/60 p-3"><p className="text-xs text-neutral-500 mb-1">Comentario del fisio</p><p className="text-sm whitespace-pre-wrap">{item.coachNotes}</p></div>}
              {onToggle ? <button type="button" disabled={already} aria-pressed={selected || already} className="btn btn-ghost text-sm w-full" onClick={() => onToggle({
                id, name: item.videoTitle || item.testTitle, kind: "video", url: item.url,
                notes: [item.videoTitle || item.testTitle, item.videoDescription, item.assessmentTitle, new Date(item.assessedAt).toLocaleDateString("es-ES"), item.coachNotes].filter(Boolean).join(" · "),
              })}>{already ? "Ya adjuntado" : selected ? "✓ Seleccionado" : "Seleccionar test"}</button> :
                <a href={item.url} target="_blank" rel="noreferrer" className="inline-block text-xs underline">Abrir vídeo</a>}
              {!onToggle && <AssessmentVideoLabels row={item} onSaved={data => setItems(prev => prev.map(v => v.id === item.id ? { ...v, ...data } : v))} />}
            </div>
          </article>;
        })}
      </div>}
    {total > 30 && <div className="flex justify-between items-center text-sm">
      <button type="button" disabled={!page || loading} onClick={() => setPage(p => p - 1)}>← Anterior</button>
      <span>Página {page + 1} de {Math.ceil(total / 30)}</span>
      <button type="button" disabled={(page + 1) * 30 >= total || loading} onClick={() => setPage(p => p + 1)}>Siguiente →</button>
    </div>}
  </section>;
}
