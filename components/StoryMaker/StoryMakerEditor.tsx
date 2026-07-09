"use client";

import { useMemo, useRef, useState } from "react";
import { SlideCanvas } from "./SlideCanvas";
import { RightPanel } from "./RightPanel";
import { LeftSidebar } from "./LeftSidebar";
import { downloadSlide, downloadZip } from "./exportSlides";
import { BUILTIN_TEMPLATES } from "@/lib/story-maker/templates";
import { BLACK } from "@/lib/story-maker/types";
import type {
  Slide,
  SlideElement,
  StoryTemplate,
  TextElement,
} from "@/lib/story-maker/types";

let ELEMENT_COUNTER = 1;
function newId(): string {
  return `el-${Date.now().toString(36)}-${ELEMENT_COUNTER++}`;
}

function emptySlide(): Slide {
  return { bgColor: BLACK, bgOverlayOpacity: 0.4, elements: [] };
}

function defaultText(): TextElement {
  return {
    id: newId(),
    type: "text",
    x: 50, y: 50, width: 80,
    content: "Nuevo texto",
    font: "Antonio",
    size: 90,
    weight: 900,
    color: "#FAFAFA",
    bgColor: "transparent",
    align: "center",
    shadow: false,
  };
}

export function StoryMakerEditor({
  savedTemplates,
}: {
  savedTemplates: StoryTemplate[];
}) {
  const [slides, setSlides] = useState<Slide[]>([emptySlide()]);
  const [selectedSlideIdx, setSelectedSlideIdx] = useState(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [savedList, setSavedList] = useState(savedTemplates);

  const allTemplates = useMemo(
    () => [...BUILTIN_TEMPLATES, ...savedList],
    [savedList],
  );
  const currentSlide = slides[selectedSlideIdx] ?? emptySlide();
  const selectedElement =
    currentSlide.elements.find((e) => e.id === selectedElementId) ?? null;

  // ─── Ops sobre slides ────────────────────────────────────────────────
  function replaceSlide(idx: number, patch: Partial<Slide>) {
    setSlides((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function updateCurrentSlide(patch: Partial<Slide>) {
    replaceSlide(selectedSlideIdx, patch);
  }
  function addSlide() {
    setSlides((prev) => [...prev, emptySlide()]);
    setSelectedSlideIdx(slides.length);
    setSelectedElementId(null);
  }
  function dupSlide() {
    const cp = JSON.parse(JSON.stringify(currentSlide)) as Slide;
    // Reasignar IDs para no chocar
    cp.elements = cp.elements.map((el) => ({ ...el, id: newId() }));
    const next = [...slides];
    next.splice(selectedSlideIdx + 1, 0, cp);
    setSlides(next);
    setSelectedSlideIdx(selectedSlideIdx + 1);
    setSelectedElementId(null);
  }
  function delSlide() {
    if (slides.length === 1) return;
    setSlides(slides.filter((_, i) => i !== selectedSlideIdx));
    setSelectedSlideIdx(Math.max(0, selectedSlideIdx - 1));
    setSelectedElementId(null);
  }

  // ─── Ops sobre elementos ─────────────────────────────────────────────
  function updateElement(id: string, patch: Partial<SlideElement>) {
    setSlides((prev) =>
      prev.map((s, i) => {
        if (i !== selectedSlideIdx) return s;
        return {
          ...s,
          elements: s.elements.map((e) =>
            e.id === id ? ({ ...e, ...patch } as SlideElement) : e,
          ),
        };
      }),
    );
  }
  function addElement(el: SlideElement) {
    setSlides((prev) =>
      prev.map((s, i) =>
        i === selectedSlideIdx ? { ...s, elements: [...s.elements, el] } : s,
      ),
    );
    setSelectedElementId(el.id);
  }
  function deleteElement(id: string) {
    setSlides((prev) =>
      prev.map((s, i) =>
        i === selectedSlideIdx
          ? { ...s, elements: s.elements.filter((e) => e.id !== id) }
          : s,
      ),
    );
    if (selectedElementId === id) setSelectedElementId(null);
    if (editingElementId === id) setEditingElementId(null);
  }

  function duplicateElement(id: string) {
    const src = currentSlide.elements.find((e) => e.id === id);
    if (!src) return;
    const copy = {
      ...src,
      id: newId(),
      // Ligero offset para que se vea que es una copia
      x: Math.min(100, src.x + 4),
      y: Math.min(100, src.y + 4),
    };
    setSlides((prev) =>
      prev.map((s, i) =>
        i === selectedSlideIdx ? { ...s, elements: [...s.elements, copy as SlideElement] } : s,
      ),
    );
    setSelectedElementId(copy.id);
  }

  function finishEditingText(id: string, newContent: string) {
    updateElement(id, { content: newContent } as any);
    setEditingElementId(null);
  }

  // ─── Aplicar plantilla ──────────────────────────────────────────────
  function applyTemplate(t: StoryTemplate) {
    // Reasignamos IDs para no colisionar
    const fresh: Slide[] = t.slides.map((s) => ({
      ...s,
      elements: s.elements.map((el) => ({ ...el, id: newId() } as SlideElement)),
    }));
    setSlides(fresh.length ? fresh : [emptySlide()]);
    setSelectedSlideIdx(0);
    setSelectedElementId(null);
  }

  // ─── Generar con IA ─────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  function flash(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 5000);
  }

  async function generate(templateKey: string, prompt: string, count: number) {
    setGenerating(true);
    try {
      const res = await fetch("/api/story-maker/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateKey, prompt, count }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        flash("err", data.error || "No se pudo generar");
        return;
      }
      // Aplica los fills a copias del primer slide de la plantilla
      const template = allTemplates.find((t) => t.key === templateKey);
      if (!template) {
        flash("err", "Plantilla no encontrada");
        return;
      }
      const base = template.slides[0];
      const generated: Slide[] = data.slides.map((genSlide: { fills: Record<string, string> }) => {
        // Copia base con IDs nuevos
        return {
          ...base,
          elements: base.elements.map((el) => {
            const newEl = { ...el, id: newId() } as SlideElement;
            // Buscar por elementId original en aiSlots + fills
            const originalId = el.id; // ojo: aún es el id de la plantilla
            const fill = genSlide.fills[originalId];
            if (fill && newEl.type === "text") {
              return { ...newEl, content: fill } as TextElement;
            }
            return newEl;
          }),
        };
      });
      setSlides(generated);
      setSelectedSlideIdx(0);
      setSelectedElementId(null);
      flash("ok", `${generated.length} slides generados`);
    } catch (e: any) {
      flash("err", e?.message || "Error de red");
    } finally {
      setGenerating(false);
    }
  }

  // ─── Guardar como plantilla ─────────────────────────────────────────
  async function saveAsTemplate(name: string, description: string) {
    if (!name.trim()) return flash("err", "Ponle nombre");
    const res = await fetch("/api/story-maker/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim(),
        slides,
        aiSlots: [], // los slots se editan luego desde la tab Plantillas
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      flash("ok", `Plantilla "${name}" guardada`);
      // Recargar lista
      const list = await fetch("/api/story-maker/templates").then((r) => r.json()).catch(() => ({}));
      if (list?.ok) {
        setSavedList(
          list.templates.map((t: any) => ({
            id: t.id,
            key: t.id,
            name: t.name,
            description: t.description ?? "",
            slides: t.slides,
            aiSlots: t.aiSlots ?? [],
          })),
        );
      }
    } else {
      flash("err", data.error || "No se pudo guardar");
    }
  }

  // ─── Fondo con foto ─────────────────────────────────────────────────
  function handleBgUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      updateCurrentSlide({ bgImageUrl: url });
    };
    reader.readAsDataURL(file);
  }
  function clearBg() {
    updateCurrentSlide({ bgImageUrl: undefined });
  }

  // ─── Export ─────────────────────────────────────────────────────────
  const hiddenRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [exporting, setExporting] = useState<"single" | "zip" | null>(null);
  async function exportSingle() {
    const el = hiddenRefs.current[selectedSlideIdx];
    if (!el) return;
    setExporting("single");
    try {
      await downloadSlide(el, selectedSlideIdx);
      flash("ok", "PNG descargado");
    } catch (e: any) {
      flash("err", e?.message || "Error export");
    } finally { setExporting(null); }
  }
  async function exportAll() {
    const els = hiddenRefs.current.filter((el): el is HTMLDivElement => !!el);
    if (!els.length) return;
    setExporting("zip");
    try {
      await downloadZip(els);
      flash("ok", "ZIP descargado");
    } catch (e: any) {
      flash("err", e?.message || "Error export");
    } finally { setExporting(null); }
  }

  return (
    <div className="grid grid-cols-[300px_1fr_320px] gap-3 h-[calc(100vh-160px)] min-h-[600px]">
      <LeftSidebar
        templates={allTemplates}
        onApplyTemplate={applyTemplate}
        onGenerate={generate}
        generating={generating}
        slides={slides}
        selectedSlideIdx={selectedSlideIdx}
        onSelectSlide={(i) => { setSelectedSlideIdx(i); setSelectedElementId(null); }}
        onAddSlide={addSlide}
        onDupSlide={dupSlide}
        onDelSlide={delSlide}
      />

      {/* CANVAS CENTRO */}
      <div className="rounded-2xl bg-neutral-100 border border-neutral-200 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setSelectedSlideIdx(Math.max(0, selectedSlideIdx - 1)); setSelectedElementId(null); }}
              disabled={selectedSlideIdx === 0}
              className="text-xs font-medium px-2 py-1.5 rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-40"
              title="Slide anterior"
            >
              ←
            </button>
            <div className="text-xs text-neutral-500 min-w-[70px] text-center">
              Slide {selectedSlideIdx + 1} de {slides.length}
            </div>
            <button
              onClick={() => { setSelectedSlideIdx(Math.min(slides.length - 1, selectedSlideIdx + 1)); setSelectedElementId(null); }}
              disabled={selectedSlideIdx === slides.length - 1}
              className="text-xs font-medium px-2 py-1.5 rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-40"
              title="Slide siguiente"
            >
              →
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                const inp = document.createElement("input");
                inp.type = "file";
                inp.accept = "image/*";
                inp.onchange = () => { if (inp.files?.[0]) handleBgUpload(inp.files[0]); };
                inp.click();
              }}
              className="text-xs font-medium px-3 py-1.5 rounded border border-neutral-300 hover:bg-neutral-50"
            >
              🖼 Foto de fondo
            </button>
            {currentSlide.bgImageUrl && (
              <button
                onClick={clearBg}
                className="text-xs font-medium px-3 py-1.5 rounded border border-red-300 text-red-700 hover:bg-red-50"
              >
                Quitar foto
              </button>
            )}
            <select
              value={currentSlide.bgGradient ?? "none"}
              onChange={(e) => updateCurrentSlide({ bgGradient: e.target.value as any })}
              className="text-xs border border-neutral-300 rounded px-2 py-1.5 bg-white"
              title="Degradado por encima de la foto"
            >
              <option value="none">Sin degradado</option>
              <option value="top-dark">🌑 Oscuro arriba</option>
              <option value="bottom-dark">🌑 Oscuro abajo</option>
              <option value="both-dark">🌑 Oscuro arriba + abajo</option>
              <option value="top-bright">✨ Brillo arriba</option>
              <option value="bottom-bright">✨ Brillo abajo</option>
              <option value="center-bright">✨ Brillo al centro</option>
            </select>
            <span className="w-px h-6 bg-neutral-200" />
            <button
              onClick={exportSingle}
              disabled={exporting !== null}
              className="text-xs font-medium px-3 py-1.5 rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
            >
              {exporting === "single" ? "…" : "📥 PNG"}
            </button>
            <button
              onClick={exportAll}
              disabled={exporting !== null}
              className="text-xs font-semibold px-3 py-1.5 rounded bg-neutral-900 text-white disabled:opacity-50"
            >
              {exporting === "zip" ? "…" : "📦 ZIP"}
            </button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center overflow-auto p-6">
          <SlideCanvas
            slide={currentSlide}
            scale={0.32}
            selectedElementId={selectedElementId}
            onSelectElement={setSelectedElementId}
            onUpdateElement={updateElement}
            interactive
            editingElementId={editingElementId}
            onStartEditing={setEditingElementId}
            onFinishEditing={finishEditingText}
          />
        </div>

        {/* Contenedor oculto para export a scale=1 */}
        <div aria-hidden style={{ position: "fixed", top: -100000, left: -100000, pointerEvents: "none", opacity: 0 }}>
          {slides.map((s, i) => (
            <div key={i} ref={(el) => { hiddenRefs.current[i] = el; }}>
              <SlideCanvas slide={s} scale={1} />
            </div>
          ))}
        </div>

        {msg && (
          <div
            className={`mx-4 mb-3 px-3 py-2 rounded-lg text-xs ${
              msg.kind === "ok"
                ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}
          >
            {msg.kind === "ok" ? "✓ " : "✗ "}
            {msg.text}
          </div>
        )}
      </div>

      <RightPanel
        slide={currentSlide}
        selectedElement={selectedElement}
        onSelectElement={setSelectedElementId}
        onUpdateElement={updateElement}
        onDeleteElement={deleteElement}
        onDuplicateElement={duplicateElement}
        onAddElement={addElement}
        onSaveAsTemplate={saveAsTemplate}
        newId={newId}
      />
    </div>
  );
}
