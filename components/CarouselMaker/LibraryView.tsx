"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CAROUSEL_CATEGORIES, categoryLabel, parseSlides, type CarouselSlide } from "@/lib/carousel-maker/types";

type Entry = {
  id: string;
  topic: string;
  category: string | null;
  slidesJson: string;
  captionText: string | null;
  createdAt: string;
};

/**
 * Vista de la biblioteca del Carrusel Maker: listado + editor de un
 * carrusel a la vez. Diseñada para que el user vaya pegando referencias
 * pasadas mientras la genera y las revise. Cuanto más rica sea, mejor
 * suena la IA — el generador elige los N más parecidos como few-shot.
 */
export function LibraryView({ initialEntries }: { initialEntries: Entry[] }) {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<string>("todas");

  const filtered = useMemo(() => {
    if (filter === "todas") return entries;
    return entries.filter((e) => e.category === filter);
  }, [entries, filter]);

  async function refresh() {
    const res = await fetch("/api/carousel-maker/library");
    if (res.ok) setEntries(await res.json());
  }

  async function remove(id: string) {
    if (!confirm("¿Quitar este carrusel de la biblioteca?")) return;
    const res = await fetch(`/api/carousel-maker/library?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      router.refresh();
    }
  }

  const editing = editingId ? entries.find((e) => e.id === editingId) ?? null : null;

  return (
    <div>
      <header className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Biblioteca de carruseles</h1>
          <p className="text-xs text-neutral-500 mt-0.5 max-w-2xl">
            Aquí van los carruseles que ya has publicado y que quieres usar como referencia
            para la IA. Cuantos más pegues, mejor sonarán los que genere — usa los que mejor
            hayan funcionado en engagement o los que representen tu tono.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="btn btn-primary text-sm"
        >
          + Añadir carrusel
        </button>
      </header>

      <div className="flex gap-1 flex-wrap mb-3">
        <FilterChip label="Todas" active={filter === "todas"} onClick={() => setFilter("todas")} />
        {CAROUSEL_CATEGORIES.map((c) => (
          <FilterChip
            key={c.value}
            label={c.label}
            active={filter === c.value}
            onClick={() => setFilter(c.value)}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-16">
          {entries.length === 0
            ? "Aún no has añadido ningún carrusel. Pega el primero con el botón de arriba."
            : "No hay carruseles con esa categoría."}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((e) => (
            <EntryCard
              key={e.id}
              entry={e}
              onEdit={() => setEditingId(e.id)}
              onDelete={() => remove(e.id)}
            />
          ))}
        </div>
      )}

      {(creating || editing) && (
        <EntryModal
          entry={editing}
          onClose={() => { setCreating(false); setEditingId(null); }}
          onSaved={async () => { setCreating(false); setEditingId(null); await refresh(); }}
        />
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
        active
          ? "bg-neutral-900 border-neutral-900 text-white"
          : "bg-white border-neutral-200 text-neutral-600 hover:border-neutral-400"
      }`}
    >
      {label}
    </button>
  );
}

function EntryCard({
  entry,
  onEdit,
  onDelete,
}: {
  entry: Entry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const slides = useMemo(() => parseSlides(entry.slidesJson), [entry.slidesJson]);
  const first = slides[0];
  const preview = first?.title ?? first?.body?.slice(0, 90) ?? "(sin contenido)";

  return (
    <div className="card !p-3 flex flex-col gap-2 hover:border-neutral-300 cursor-pointer" onClick={onEdit}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{entry.topic}</div>
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 mt-0.5">
            {categoryLabel(entry.category)} · {slides.length} slide{slides.length === 1 ? "" : "s"}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-xs text-red-600 flex-shrink-0"
          title="Eliminar de la biblioteca"
        >
          ✕
        </button>
      </div>
      <p className="text-xs text-neutral-700 line-clamp-3">{preview}</p>
      {entry.captionText && (
        <p className="text-[10px] text-neutral-500 italic line-clamp-2">
          📝 {entry.captionText.slice(0, 140)}{entry.captionText.length > 140 ? "…" : ""}
        </p>
      )}
    </div>
  );
}

const HELP_TEMPLATE = `Slide 1
Titular: [titular grande]
Subtítulo: [texto secundario, opcional]
Cuerpo: [desarrollo del slide]

Slide 2
Titular: ...
Cuerpo: ...

Slide N
...

CAPTION:
[pie del post en Instagram]`;

function EntryModal({
  entry,
  onClose,
  onSaved,
}: {
  entry: Entry | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!entry;
  const initialRaw = useMemo(() => {
    if (!entry) return "";
    const slides = parseSlides(entry.slidesJson);
    const lines: string[] = [];
    for (const s of slides) {
      lines.push(`Slide ${s.n}`);
      if (s.title) lines.push(`Titular: ${s.title}`);
      if (s.subtitle) lines.push(`Subtítulo: ${s.subtitle}`);
      if (s.body) lines.push(`Cuerpo: ${s.body}`);
      if (s.note) lines.push(`Visual sugerida: ${s.note}`);
      lines.push("");
    }
    if (entry.captionText) {
      lines.push("CAPTION:");
      lines.push(entry.captionText);
    }
    return lines.join("\n").trim();
  }, [entry]);

  const [topic, setTopic] = useState(entry?.topic ?? "");
  const [category, setCategory] = useState(entry?.category ?? "");
  const [rawText, setRawText] = useState(initialRaw);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    if (!topic.trim()) { setError("Necesito un tema breve (ej. 'dolor hombro atletas crossfit')."); return; }
    if (!rawText.trim()) { setError("Pega el texto del carrusel."); return; }
    setSaving(true);
    const res = await fetch("/api/carousel-maker/library", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(isEdit && { id: entry!.id }),
        topic,
        category: category || null,
        rawText,
      }),
    });
    if (res.ok) {
      onSaved();
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data?.error ?? "No se pudo guardar.");
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full p-5 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold">{isEdit ? "Editar carrusel" : "Añadir carrusel a la biblioteca"}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Tema *</label>
            <input
              type="text"
              className="input"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="ej. errores atletas con dolor hombro"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Categoría</label>
            <select className="input text-sm" value={category ?? ""} onChange={(e) => setCategory(e.target.value)}>
              <option value="">— Sin categoría —</option>
              {CAROUSEL_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-neutral-500">Texto del carrusel *</label>
              <button
                type="button"
                onClick={() => setRawText(HELP_TEMPLATE)}
                className="text-[10px] text-neutral-500 underline"
              >
                Usar plantilla
              </button>
            </div>
            <textarea
              className="input font-mono text-[13px] leading-relaxed"
              rows={18}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Encabeza cada slide con 'Slide N'. Puedes usar 'Titular:', 'Subtítulo:', 'Cuerpo:' y 'Visual sugerida:' — o simplemente pegar el texto tal cual y ordenarlo luego."
            />
            <p className="text-[10px] text-neutral-500 mt-1">
              El parser es flexible: acepta variantes como "🟪 Slide 3 – Gancho" o "👉 Slide 4". Termina con "CAPTION:" seguido del pie del post si tienes.
            </p>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            onClick={save}
            disabled={saving}
            className="btn btn-primary w-full"
          >
            {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Añadir a biblioteca"}
          </button>
        </div>
      </div>
    </div>
  );
}
