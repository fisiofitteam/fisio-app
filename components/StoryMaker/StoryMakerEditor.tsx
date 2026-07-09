"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SlideRenderer } from "./SlideRenderer";
import { downloadPdf, downloadSlide, downloadZip } from "./exportSlides";
import { LibraryBackgroundPicker } from "./LibraryBackgroundPicker";
import {
  EMPTY_SLIDE,
  FORMAT_DIMS,
  STORY_STYLE_KEYS,
  type Slide,
  type StoryFormat,
  type StoryStyleKey,
  type StoryTemplate,
} from "./types";

const STYLE_LABEL: Record<StoryStyleKey, string> = {
  "marca-base": "Marca base",
  luxury: "Testimonio / lujo",
  bento: "Datos / bento",
  magazine: "Revista / lección",
  flashcard: "Flashcard / consejo",
};

const DEFAULT_HANDLE = "@fisiofitteam";
const HISTORY_LIMIT = 30;

export function StoryMakerEditor({
  initialTemplates,
}: {
  initialTemplates: StoryTemplate[];
}) {
  // ─── Estado principal ────────────────────────────────────────────────
  const [format, setFormat] = useState<StoryFormat>("story-9x16");
  const [slides, setSlides] = useState<Slide[]>([EMPTY_SLIDE]);
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Historial para undo/redo. Guardamos snapshots del array `slides`.
  const historyRef = useRef<Slide[][]>([[EMPTY_SLIDE]]);
  const historyIdxRef = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  function pushHistory(next: Slide[]) {
    // Corta cualquier futuro (redos posteriores al índice actual)
    historyRef.current = historyRef.current.slice(0, historyIdxRef.current + 1);
    historyRef.current.push(next);
    if (historyRef.current.length > HISTORY_LIMIT) {
      historyRef.current.shift();
    } else {
      historyIdxRef.current += 1;
    }
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(false);
  }

  function applySlides(next: Slide[], record = true) {
    setSlides(next);
    if (record) pushHistory(next);
  }

  function undo() {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    const snap = historyRef.current[historyIdxRef.current];
    setSlides(snap);
    setSelectedIdx((cur) => Math.min(cur, snap.length - 1));
    setCanUndo(historyIdxRef.current > 0);
    setCanRedo(true);
  }

  function redo() {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    const snap = historyRef.current[historyIdxRef.current];
    setSlides(snap);
    setSelectedIdx((cur) => Math.min(cur, snap.length - 1));
    setCanUndo(true);
    setCanRedo(historyIdxRef.current < historyRef.current.length - 1);
  }

  // Atajos Cmd/Ctrl+Z / Shift+Z
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "z") return;
      // Evitar interceptar cuando el foco está en un input/textarea
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ─── Sidebar ─────────────────────────────────────────────────────────
  const [script, setScript] = useState("");
  const [count, setCount] = useState(5);
  const [handle, setHandle] = useState(DEFAULT_HANDLE);
  const [generating, setGenerating] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [templates, setTemplates] = useState(initialTemplates);
  const [libraryOpen, setLibraryOpen] = useState(false);

  // ─── Feedback ────────────────────────────────────────────────────────
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  function flash(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  }

  const selected = slides[selectedIdx] ?? EMPTY_SLIDE;

  function updateSelected(patch: Partial<Slide>) {
    applySlides(slides.map((s, i) => (i === selectedIdx ? { ...s, ...patch } : s)));
  }

  function addSlide() {
    applySlides([...slides, EMPTY_SLIDE]);
    setSelectedIdx(slides.length);
  }

  function duplicateSelected() {
    const dup = { ...slides[selectedIdx] };
    const next = [...slides];
    next.splice(selectedIdx + 1, 0, dup);
    applySlides(next);
    setSelectedIdx(selectedIdx + 1);
  }

  function removeSlide(idx: number) {
    if (slides.length === 1) return;
    const next = slides.filter((_, i) => i !== idx);
    applySlides(next);
    setSelectedIdx((cur) => (cur >= idx ? Math.max(0, cur - 1) : cur));
  }

  function moveSlide(from: number, to: number) {
    if (to < 0 || to >= slides.length) return;
    const copy = [...slides];
    const [it] = copy.splice(from, 1);
    copy.splice(to, 0, it);
    applySlides(copy);
    setSelectedIdx(to);
  }

  // ─── IA ──────────────────────────────────────────────────────────────
  async function generateWithAI() {
    if (script.trim().length < 20) {
      flash("err", "Escribe al menos 20 caracteres de guion.");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/story-maker/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, count, format }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        flash("err", data.error || "No se pudo generar");
        return;
      }
      applySlides(data.slides);
      setSelectedIdx(0);
      flash("ok", `${data.slides.length} slides generados con Claude`);
    } catch (e: any) {
      flash("err", e?.message || "Error de red");
    } finally {
      setGenerating(false);
    }
  }

  // ─── Plantillas ──────────────────────────────────────────────────────
  async function saveAsTemplate() {
    if (!saveName.trim()) {
      flash("err", "Ponle nombre a la plantilla");
      return;
    }
    const res = await fetch("/api/story-maker/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: saveName.trim(), slides }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      flash("ok", "Plantilla guardada");
      setSaveOpen(false);
      setSaveName("");
      const listRes = await fetch("/api/story-maker/templates");
      const listData = await listRes.json().catch(() => ({}));
      if (listData?.ok) setTemplates(listData.templates);
    } else {
      flash("err", data.error || "No se pudo guardar");
    }
  }

  function loadTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    applySlides(t.slides);
    setSelectedIdx(0);
    flash("ok", `Plantilla "${t.name}" cargada`);
  }

  async function deleteTemplate(id: string) {
    if (!confirm("¿Borrar esta plantilla?")) return;
    const res = await fetch(`/api/story-maker/templates?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      flash("ok", "Plantilla borrada");
    }
  }

  // ─── Export ──────────────────────────────────────────────────────────
  const fullSizeRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [exporting, setExporting] = useState<"single" | "zip" | "pdf" | null>(null);

  async function handleExportSingle() {
    const el = fullSizeRefs.current[selectedIdx];
    if (!el) return;
    setExporting("single");
    try {
      await downloadSlide(el, selectedIdx, format);
      flash("ok", "PNG descargado");
    } catch (e: any) {
      flash("err", e?.message || "No se pudo exportar");
    } finally {
      setExporting(null);
    }
  }

  async function handleExportZip() {
    const els = fullSizeRefs.current.filter((el): el is HTMLDivElement => !!el);
    if (els.length === 0) return;
    setExporting("zip");
    try {
      await downloadZip(els, format);
      flash("ok", `ZIP con ${els.length} PNG descargado`);
    } catch (e: any) {
      flash("err", e?.message || "No se pudo exportar");
    } finally {
      setExporting(null);
    }
  }

  async function handleExportPdf() {
    const els = fullSizeRefs.current.filter((el): el is HTMLDivElement => !!el);
    if (els.length === 0) return;
    setExporting("pdf");
    try {
      await downloadPdf(els, format);
      flash("ok", "PDF descargado");
    } catch (e: any) {
      flash("err", e?.message || "No se pudo exportar");
    } finally {
      setExporting(null);
    }
  }

  // ─── Preview scales según formato ────────────────────────────────────
  const previewScale = format === "carousel-4x5" ? 0.38 : 0.32;
  const thumbScale = format === "carousel-4x5" ? 0.14 : 0.11;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
      {/* ═════════ SIDEBAR ═════════ */}
      <aside className="space-y-4">
        <SectionCard title="🎯 Formato">
          <div className="flex gap-1 p-1 rounded-lg bg-neutral-100">
            <button
              onClick={() => setFormat("story-9x16")}
              className={`flex-1 text-xs font-medium py-2 rounded ${
                format === "story-9x16" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500"
              }`}
            >
              📱 Story 9:16
            </button>
            <button
              onClick={() => setFormat("carousel-4x5")}
              className={`flex-1 text-xs font-medium py-2 rounded ${
                format === "carousel-4x5" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500"
              }`}
            >
              🎠 Carrusel 4:5
            </button>
          </div>
          <p className="text-[11px] text-neutral-500 mt-2">
            {format === "carousel-4x5"
              ? "Post permanente en feed. Hasta 10 slides con numeración N/M."
              : "Historia efímera 24h. 1-10 slides."}
          </p>
        </SectionCard>

        <SectionCard title="✨ Generar con IA">
          <label className="text-xs text-neutral-500 block mb-1">Guion</label>
          <textarea
            className="input text-sm w-full font-mono"
            rows={7}
            placeholder="Pega o escribe aquí el guion base…"
            value={script}
            onChange={(e) => setScript(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Nº slides</label>
              <input
                type="number"
                min={1}
                max={10}
                className="input text-sm w-full"
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value) || 5)))}
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">@ handle</label>
              <input
                type="text"
                className="input text-sm w-full"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
              />
            </div>
          </div>
          <button
            onClick={generateWithAI}
            disabled={generating}
            className="mt-3 w-full text-sm font-semibold px-4 py-3 rounded-lg"
            style={{
              background: "linear-gradient(135deg,#FCD34D 0%,#F59E0B 100%)",
              color: "#1F2937",
              opacity: generating ? 0.5 : 1,
              cursor: generating ? "wait" : "pointer",
            }}
          >
            {generating ? "Generando…" : "✨ Generar con Claude"}
          </button>
        </SectionCard>

        <SectionCard title="🧩 Plantillas guardadas">
          {templates.length === 0 ? (
            <p className="text-xs text-neutral-500 italic">
              Aún no hay plantillas. Guarda esta serie para reutilizarla.
            </p>
          ) : (
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-2 text-xs rounded border border-neutral-200 px-2 py-1.5"
                >
                  <button
                    onClick={() => loadTemplate(t.id)}
                    className="flex-1 text-left hover:underline"
                    title="Cargar"
                  >
                    <div className="font-medium truncate">{t.name}</div>
                    <div className="text-[10px] text-neutral-500">
                      {t.slides.length} slides
                    </div>
                  </button>
                  <button
                    onClick={() => deleteTemplate(t.id)}
                    className="text-neutral-400 hover:text-red-600 shrink-0"
                    title="Borrar"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => setSaveOpen((v) => !v)}
            className="mt-3 w-full text-xs font-medium px-3 py-2 rounded border border-neutral-300 hover:bg-neutral-50"
          >
            {saveOpen ? "Cancelar" : "💾 Guardar serie actual"}
          </button>
          {saveOpen && (
            <div className="mt-2 space-y-2">
              <input
                type="text"
                placeholder="Nombre de la plantilla"
                className="input text-sm w-full"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
              />
              <button
                onClick={saveAsTemplate}
                className="w-full text-xs font-semibold px-3 py-2 rounded bg-neutral-900 text-white"
              >
                Guardar
              </button>
            </div>
          )}
        </SectionCard>

        {msg && (
          <div
            className={`text-xs rounded-lg px-3 py-2 ${
              msg.kind === "ok"
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}
          >
            {msg.kind === "ok" ? "✓ " : "✗ "}
            {msg.text}
          </div>
        )}
      </aside>

      {/* ═════════ MAIN ═════════ */}
      <section>
        <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-semibold">🎨 Story Maker</h2>
            <p className="text-xs text-neutral-500">
              {FORMAT_DIMS[format].label} · {slides.length} slide{slides.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={undo}
              disabled={!canUndo}
              title="Deshacer (⌘Z)"
              className="text-xs font-medium px-2.5 py-1.5 rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-40"
            >
              ↶ Deshacer
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              title="Rehacer (⌘⇧Z)"
              className="text-xs font-medium px-2.5 py-1.5 rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-40"
            >
              ↷ Rehacer
            </button>
            <span className="w-px h-6 bg-neutral-200" />
            <button
              onClick={addSlide}
              className="text-xs font-medium px-3 py-1.5 rounded border border-neutral-300 hover:bg-neutral-50"
            >
              + Añadir
            </button>
            <button
              onClick={duplicateSelected}
              className="text-xs font-medium px-3 py-1.5 rounded border border-neutral-300 hover:bg-neutral-50"
              title="Duplicar el slide seleccionado"
            >
              ⎘ Duplicar
            </button>
            <span className="w-px h-6 bg-neutral-200" />
            <button
              onClick={handleExportSingle}
              disabled={exporting !== null}
              className="text-xs font-medium px-3 py-1.5 rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
              title="Descargar el slide seleccionado"
            >
              {exporting === "single" ? "…" : "📥 PNG"}
            </button>
            <button
              onClick={handleExportPdf}
              disabled={exporting !== null}
              className="text-xs font-medium px-3 py-1.5 rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
              title="Descargar todos como PDF"
            >
              {exporting === "pdf" ? "…" : "📄 PDF"}
            </button>
            <button
              onClick={handleExportZip}
              disabled={exporting !== null}
              className="text-xs font-semibold px-3 py-1.5 rounded"
              style={{
                background: "linear-gradient(135deg,#FCD34D 0%,#F59E0B 100%)",
                color: "#1F2937",
                opacity: exporting !== null ? 0.5 : 1,
              }}
              title="Descargar todos como ZIP de PNGs"
            >
              {exporting === "zip" ? "…" : "📦 ZIP"}
            </button>
          </div>
        </div>

        {/* Contenedor oculto con slides a tamaño real */}
        <div
          aria-hidden
          style={{
            position: "fixed",
            top: -100000,
            left: -100000,
            pointerEvents: "none",
            opacity: 0,
          }}
        >
          {slides.map((s, i) => (
            <div key={i} ref={(el) => { fullSizeRefs.current[i] = el; }}>
              <SlideRenderer
                slide={s}
                scale={1}
                handle={handle}
                format={format}
                index={i}
                total={slides.length}
              />
            </div>
          ))}
        </div>

        {/* Preview grande */}
        <div className="rounded-2xl bg-neutral-950 p-4 mb-4 flex justify-center">
          <SlideRenderer
            slide={selected}
            scale={previewScale}
            handle={handle}
            format={format}
            index={selectedIdx}
            total={slides.length}
          />
        </div>

        {/* Editor del slide seleccionado */}
        <SectionCard title={`Editando slide ${selectedIdx + 1} / ${slides.length}`}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Estilo visual</label>
              <div className="grid grid-cols-5 gap-1">
                {STORY_STYLE_KEYS.map((k) => (
                  <button
                    key={k}
                    onClick={() => updateSelected({ styleKey: k })}
                    className={`text-[11px] font-medium py-1.5 rounded border ${
                      selected.styleKey === k
                        ? "bg-neutral-900 text-white border-neutral-900"
                        : "bg-white border-neutral-200 hover:border-neutral-400"
                    }`}
                    title={STYLE_LABEL[k]}
                  >
                    {STYLE_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>

            <SlideFields
              slide={selected}
              onChange={updateSelected}
              onOpenLibrary={() => setLibraryOpen(true)}
            />

            <div className="flex items-center gap-2 pt-2 border-t border-neutral-100 mt-3 flex-wrap">
              <button
                onClick={() => moveSlide(selectedIdx, selectedIdx - 1)}
                disabled={selectedIdx === 0}
                className="text-xs px-2 py-1 rounded border border-neutral-300 disabled:opacity-40"
              >
                ← Mover izquierda
              </button>
              <button
                onClick={() => moveSlide(selectedIdx, selectedIdx + 1)}
                disabled={selectedIdx === slides.length - 1}
                className="text-xs px-2 py-1 rounded border border-neutral-300 disabled:opacity-40"
              >
                Mover derecha →
              </button>
              <div className="flex-1" />
              <button
                onClick={() => removeSlide(selectedIdx)}
                disabled={slides.length === 1}
                className="text-xs px-2 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-40"
              >
                🗑 Borrar slide
              </button>
            </div>
          </div>
        </SectionCard>

        {/* Tira de miniaturas */}
        <div className="mt-4">
          <div className="text-xs uppercase font-bold text-neutral-500 tracking-wider mb-2">
            Serie ({slides.length})
          </div>
          <div className="flex gap-3 overflow-x-auto pb-3">
            {slides.map((s, i) => (
              <button
                key={i}
                onClick={() => setSelectedIdx(i)}
                className={`shrink-0 rounded-lg overflow-hidden transition-transform ${
                  i === selectedIdx
                    ? "ring-2 ring-amber-400 scale-[1.02]"
                    : "opacity-70 hover:opacity-100"
                }`}
              >
                <SlideRenderer
                  slide={s}
                  scale={thumbScale}
                  format={format}
                  index={i}
                  total={slides.length}
                />
                <div className="text-[10px] text-center py-1 text-neutral-500 bg-neutral-100">
                  #{i + 1} · {STYLE_LABEL[s.styleKey]}
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {libraryOpen && (
        <LibraryBackgroundPicker
          onPick={(url) => {
            updateSelected({ bgUrl: url });
            setLibraryOpen(false);
          }}
          onClose={() => setLibraryOpen(false)}
        />
      )}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      {children}
    </section>
  );
}

function SlideFields({
  slide,
  onChange,
  onOpenLibrary,
}: {
  slide: Slide;
  onChange: (patch: Partial<Slide>) => void;
  onOpenLibrary: () => void;
}) {
  return (
    <>
      <Field label="Título">
        <textarea
          className="input text-sm w-full"
          rows={2}
          value={slide.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </Field>
      <Field label={slide.styleKey === "bento" ? "Grupo (uppercase, mini)" : "Subtítulo"}>
        <input
          type="text"
          className="input text-sm w-full"
          value={slide.subtitle}
          onChange={(e) => onChange({ subtitle: e.target.value })}
        />
      </Field>
      {(slide.styleKey === "magazine" || slide.styleKey === "marca-base") && (
        <Field label="Cuerpo">
          <textarea
            className="input text-sm w-full"
            rows={4}
            value={slide.body}
            onChange={(e) => onChange({ body: e.target.value })}
          />
        </Field>
      )}
      {slide.styleKey === "bento" && (
        <Field label="Datos (una línea por celda: 'NÚMERO | descripción')">
          <textarea
            className="input text-sm w-full font-mono"
            rows={4}
            placeholder="87% | menos dolor a las 4 semanas&#10;3× | menos recaídas"
            value={slide.body}
            onChange={(e) => onChange({ body: e.target.value })}
          />
        </Field>
      )}
      {slide.styleKey === "luxury" && (
        <Field label="Atribución (autor · programa · duración)">
          <input
            type="text"
            className="input text-sm w-full"
            placeholder="Marta · Recupera · 4 meses"
            value={slide.attribution}
            onChange={(e) => onChange({ attribution: e.target.value })}
          />
        </Field>
      )}
      {(slide.styleKey === "marca-base" || slide.styleKey === "flashcard") && (
        <Field label="CTA (opcional)">
          <input
            type="text"
            className="input text-sm w-full"
            placeholder="Desliza / Guarda esto / Reserva"
            value={slide.cta}
            onChange={(e) => onChange({ cta: e.target.value })}
          />
        </Field>
      )}
      <Field label="Fondo (URL de imagen — opcional)">
        <div className="flex gap-2">
          <input
            type="text"
            className="input text-sm flex-1"
            placeholder="https://…"
            value={slide.bgUrl}
            onChange={(e) => onChange({ bgUrl: e.target.value })}
          />
          <button
            type="button"
            onClick={onOpenLibrary}
            className="text-xs font-medium px-3 py-1.5 rounded border border-neutral-300 bg-white hover:bg-neutral-50 whitespace-nowrap"
            title="Elegir de la biblioteca del equipo"
          >
            📷 Biblioteca
          </button>
          {slide.bgUrl && (
            <button
              type="button"
              onClick={() => onChange({ bgUrl: "" })}
              className="text-xs font-medium px-2 py-1.5 rounded border border-neutral-300 text-neutral-500 hover:text-red-600"
              title="Quitar fondo"
            >
              ✕
            </button>
          )}
        </div>
      </Field>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-neutral-500 block mb-1">{label}</label>
      {children}
    </div>
  );
}
