"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CAROUSEL_CATEGORIES, categoryLabel, type CarouselSlide } from "@/lib/carousel-maker/types";

type Draft = {
  id: string;
  title: string;
  brief: string;
  category: string | null;
  slides: CarouselSlide[];
  captionText: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Editor de un draft de carrusel en modo TEXTO. La Fase C traerá el editor
 * visual 1080×1350; de momento el user puede refinar título/slides/caption,
 * copiar cada bloque al portapapeles y publicar o archivar.
 */
export function DraftEditor({ initial }: { initial: Draft }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const numSlides = draft.slides.length;
  const isDraft = draft.status === "draft";

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function setSlide(n: number, patch: Partial<CarouselSlide>) {
    setDraft((prev) => ({
      ...prev,
      slides: prev.slides.map((s) => (s.n === n ? { ...s, ...patch } : s)),
    }));
    setDirty(true);
  }

  function addSlide() {
    const nextN = numSlides === 0 ? 1 : Math.max(...draft.slides.map((s) => s.n)) + 1;
    setDraft((prev) => ({ ...prev, slides: [...prev.slides, { n: nextN, body: "" }] }));
    setDirty(true);
  }

  function removeSlide(n: number) {
    if (!confirm(`¿Eliminar slide ${n}?`)) return;
    setDraft((prev) => {
      const filtered = prev.slides.filter((s) => s.n !== n);
      // Renumeramos para mantener 1..N contiguo.
      const renumbered = filtered.map((s, i) => ({ ...s, n: i + 1 }));
      return { ...prev, slides: renumbered };
    });
    setDirty(true);
  }

  async function save() {
    setError("");
    setSaving(true);
    const res = await fetch("/api/carousel-maker/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: draft.id,
        title: draft.title,
        category: draft.category,
        slidesJson: JSON.stringify(draft.slides),
        captionText: draft.captionText ?? "",
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "No se pudo guardar.");
      setSaving(false);
      return;
    }
    setDirty(false);
    setSaving(false);
  }

  async function setStatus(next: "draft" | "published" | "archived") {
    if (dirty) await save();
    const res = await fetch("/api/carousel-maker/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: draft.id, status: next }),
    });
    if (res.ok) setDraft((prev) => ({ ...prev, status: next }));
  }

  async function remove() {
    if (!confirm("¿Eliminar el draft del todo?")) return;
    const res = await fetch(`/api/carousel-maker/drafts?id=${draft.id}`, { method: "DELETE" });
    if (res.ok) router.push("/fisio/contenido/carrusel-maker");
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    });
  }

  const fullText = useMemo(() => {
    const parts: string[] = [];
    for (const s of draft.slides) {
      const bits = [`--- Slide ${s.n} ---`];
      if (s.title) bits.push(s.title);
      if (s.subtitle) bits.push(s.subtitle);
      if (s.body) bits.push(s.body);
      parts.push(bits.join("\n"));
    }
    if (draft.captionText) {
      parts.push("--- CAPTION ---");
      parts.push(draft.captionText);
    }
    return parts.join("\n\n");
  }, [draft]);

  return (
    <div className="max-w-3xl">
      {/* Header con título editable + acciones */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={draft.title}
            onChange={(e) => setField("title", e.target.value)}
            className="text-xl font-semibold w-full bg-transparent outline-none border-b border-transparent focus:border-neutral-300 pb-1"
          />
          <div className="text-xs text-neutral-500 mt-1 flex items-center gap-2 flex-wrap">
            <StatusPill status={draft.status} />
            <span>·</span>
            <span>{categoryLabel(draft.category)}</span>
            <span>·</span>
            <span>{numSlides} slide{numSlides === 1 ? "" : "s"}</span>
            <span>·</span>
            <span>Actualizado {new Date(draft.updatedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link
            href={`/fisio/contenido/carrusel-maker/${draft.id}/visual`}
            className="btn btn-ghost text-xs"
          >
            🎨 Editor visual →
          </Link>
          <button onClick={() => copy(fullText, "all")} className="btn btn-ghost text-xs">
            {copiedKey === "all" ? "✓ Copiado" : "📋 Copiar todo"}
          </button>
          <button onClick={save} disabled={!dirty || saving} className="btn btn-primary text-xs">
            {saving ? "Guardando…" : dirty ? "💾 Guardar" : "Guardado"}
          </button>
        </div>
      </div>

      {/* Brief (readonly) */}
      <details className="mb-4 text-xs text-neutral-600">
        <summary className="cursor-pointer text-neutral-500">Brief usado al generar</summary>
        <p className="mt-2 p-3 bg-neutral-50 rounded-lg whitespace-pre-wrap">{draft.brief}</p>
      </details>

      {/* Categoría editable */}
      <div className="mb-4">
        <label className="text-xs text-neutral-500 block mb-1">Categoría</label>
        <select
          className="input text-sm max-w-xs"
          value={draft.category ?? ""}
          onChange={(e) => setField("category", e.target.value || null)}
        >
          <option value="">— Sin categoría —</option>
          {CAROUSEL_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Slides */}
      <div className="space-y-3 mb-6">
        {draft.slides.map((s) => (
          <SlideCard
            key={s.n}
            slide={s}
            onChange={(patch) => setSlide(s.n, patch)}
            onCopy={() => {
              const text = [s.title, s.subtitle, s.body].filter(Boolean).join("\n");
              copy(text, `slide-${s.n}`);
            }}
            onRemove={() => removeSlide(s.n)}
            copied={copiedKey === `slide-${s.n}`}
          />
        ))}
        <button
          onClick={addSlide}
          className="w-full py-3 border border-dashed border-neutral-300 rounded-xl text-sm text-neutral-500 hover:border-neutral-500 hover:text-neutral-700"
        >
          + Añadir slide
        </button>
      </div>

      {/* Caption */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-neutral-500">Caption del post</label>
          <button
            onClick={() => copy(draft.captionText ?? "", "caption")}
            className="text-[11px] text-neutral-500 underline"
          >
            {copiedKey === "caption" ? "✓ Copiado" : "📋 Copiar caption"}
          </button>
        </div>
        <textarea
          className="input text-sm"
          rows={8}
          value={draft.captionText ?? ""}
          onChange={(e) => setField("captionText", e.target.value)}
          placeholder="Pie del post en Instagram."
        />
      </div>

      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      {/* Acciones finales */}
      <div className="flex items-center gap-2 flex-wrap pt-4 border-t border-neutral-200">
        {isDraft && (
          <button onClick={() => setStatus("published")} className="btn btn-primary text-xs">
            ✅ Marcar como publicado
          </button>
        )}
        {draft.status === "published" && (
          <button onClick={() => setStatus("draft")} className="btn btn-ghost text-xs">
            ↩︎ Devolver a draft
          </button>
        )}
        {draft.status !== "archived" && (
          <button onClick={() => setStatus("archived")} className="btn btn-ghost text-xs">
            📥 Archivar
          </button>
        )}
        <button onClick={remove} className="btn btn-ghost text-xs text-red-600 ml-auto">
          🗑 Eliminar draft
        </button>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const label =
    status === "draft" ? "Draft"
    : status === "published" ? "Publicado"
    : status === "archived" ? "Archivado"
    : status;
  const cls =
    status === "draft" ? "bg-amber-100 text-amber-800"
    : status === "published" ? "bg-emerald-100 text-emerald-800"
    : "bg-neutral-100 text-neutral-600";
  return <span className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function SlideCard({
  slide,
  onChange,
  onCopy,
  onRemove,
  copied,
}: {
  slide: CarouselSlide;
  onChange: (patch: Partial<CarouselSlide>) => void;
  onCopy: () => void;
  onRemove: () => void;
  copied: boolean;
}) {
  return (
    <div className="card !p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wide font-medium text-neutral-500">Slide {slide.n}</div>
        <div className="flex gap-2">
          <button onClick={onCopy} className="text-[11px] text-neutral-500 underline">
            {copied ? "✓ Copiado" : "📋 Copiar"}
          </button>
          <button onClick={onRemove} className="text-[11px] text-red-600">✕</button>
        </div>
      </div>
      <div className="space-y-2">
        <input
          type="text"
          value={slide.title ?? ""}
          onChange={(e) => onChange({ title: e.target.value })}
          className="input text-base font-semibold"
          placeholder="Titular (opcional)"
        />
        <input
          type="text"
          value={slide.subtitle ?? ""}
          onChange={(e) => onChange({ subtitle: e.target.value })}
          className="input text-sm"
          placeholder="Subtítulo (opcional)"
        />
        <textarea
          value={slide.body ?? ""}
          onChange={(e) => onChange({ body: e.target.value })}
          rows={4}
          className="input text-sm"
          placeholder="Cuerpo del slide"
        />
        {slide.note && (
          <div className="text-[10px] text-neutral-500 italic">📌 Visual sugerida: {slide.note}</div>
        )}
      </div>
    </div>
  );
}
