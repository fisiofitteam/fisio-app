"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CarouselSlide } from "@/lib/carousel-maker/types";
import {
  applyTemplateToSlide,
  buildInitialDoc,
  CANVAS_H,
  CANVAS_W,
  defaultChipElement,
  defaultImageElement,
  defaultLineElement,
  defaultLogoElement,
  defaultTextElement,
  emptySlideDoc,
  presetChips,
  presetCta,
  presetHook,
  presetTextBody,
  type CarouselDoc,
  type SlideDoc,
  type SlideElement,
} from "@/lib/carousel-maker/canvas";
import { CarouselFontsLoader } from "./FontsLoader";
import { SlideCanvas } from "./SlideCanvas";
import { PropertyPanel } from "./PropertyPanel";
import { downloadCarouselZip, downloadSingleSlide } from "./exportCarousel";
import { uploadCarouselImage } from "./uploadImage";

/**
 * Editor visual "estilo Canva" del carrusel:
 *   - Sidebar izquierda: miniaturas de slides.
 *   - Canvas central: slide activo escalado, con drag de elementos y
 *     selección por click.
 *   - Panel derecho: propiedades del elemento seleccionado (o del slide
 *     si no hay ninguno). Fuente, tamaño, color, alineación, posición,
 *     todo se toca a mano.
 *   - Toolbar superior: añadir elementos, aplicar preset, exportar,
 *     estado guardado.
 *
 * Auto-guarda cambios con debounce a Carousel.visualJson.
 */
export function VisualEditor({
  carouselId,
  title,
  slides,
  initialDoc,
}: {
  carouselId: string;
  title: string;
  slides: CarouselSlide[];
  initialDoc: CarouselDoc | null;
}) {
  // Si el draft ya tenía visualJson v2 lo usamos; si tenía v1 antigua o
  // nada, buildInitialDoc lo migra/crea desde los slides de texto.
  const [doc, setDoc] = useState<CarouselDoc>(() => {
    if (initialDoc?.slides?.length) {
      // Rellenar slides que falten (si el user regeneró texto con más slides).
      if (initialDoc.slides.length < slides.length) {
        const migrated = buildInitialDoc(slides, {});
        return {
          version: 2,
          slides: slides.map((_, i) => initialDoc.slides[i] ?? migrated.slides[i]),
        };
      }
      return initialDoc;
    }
    return buildInitialDoc(slides, {});
  });

  const [activeIdx, setActiveIdx] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Guías de alineación: se activan durante el drag/resize cuando el
  // elemento queda cerca del centro del canvas. Igual que en el editor
  // de historias de Instagram.
  const [guides, setGuides] = useState<{ vCenter: boolean; hCenter: boolean }>({ vCenter: false, hCenter: false });
  // Historial para undo/redo. Guardamos snapshots del doc antes de cada
  // cambio "significativo" (drag, resize, add/remove elemento, apply
  // preset/plantilla, cambio de propiedad, etc). Cambios de texto en el
  // panel se debouncean para no llenar el historial con cada tecla.
  const historyRef = useRef<{ past: CarouselDoc[]; future: CarouselDoc[] }>({ past: [], future: [] });

  const activeSlide = doc.slides[activeIdx] ?? emptySlideDoc();
  const selectedEl = activeSlide.elements.find((e) => e.id === selectedId) ?? null;

  // Plantillas visuales guardadas por el equipo.
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; description: string | null; slideJson: string }>>([]);
  useEffect(() => {
    fetch("/api/carousel-maker/templates").then((r) => r.ok ? r.json() : []).then((data) => {
      if (Array.isArray(data)) setTemplates(data);
    }).catch(() => {});
  }, []);

  // Refs para exportar
  const exportRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // ─── Historial (undo / redo) ───────────────────────────────────────
  const HISTORY_MAX = 50;
  const commitHistory = useCallback(() => {
    const past = historyRef.current.past;
    past.push(JSON.parse(JSON.stringify(doc)) as CarouselDoc);
    if (past.length > HISTORY_MAX) past.shift();
    historyRef.current.future = [];
  }, [doc]);

  const undo = useCallback(() => {
    const { past, future } = historyRef.current;
    if (past.length === 0) return;
    const prev = past.pop()!;
    future.push(JSON.parse(JSON.stringify(doc)) as CarouselDoc);
    setDoc(prev);
    setSelectedId(null);
    setDirty(true);
  }, [doc]);

  const redo = useCallback(() => {
    const { past, future } = historyRef.current;
    if (future.length === 0) return;
    const next = future.pop()!;
    past.push(JSON.parse(JSON.stringify(doc)) as CarouselDoc);
    setDoc(next);
    setSelectedId(null);
    setDirty(true);
  }, [doc]);

  // ─── Mutations ─────────────────────────────────────────────────────
  const setSlideAt = useCallback((idx: number, patch: Partial<SlideDoc> | ((prev: SlideDoc) => SlideDoc)) => {
    setDoc((prev) => ({
      ...prev,
      slides: prev.slides.map((s, i) => {
        if (i !== idx) return s;
        return typeof patch === "function" ? patch(s) : { ...s, ...patch };
      }),
    }));
    setDirty(true);
  }, []);

  const updateActiveSlide = useCallback((patch: Partial<SlideDoc>) => {
    setSlideAt(activeIdx, patch);
  }, [activeIdx, setSlideAt]);

  const updateElement = useCallback((id: string, patch: Partial<SlideElement>) => {
    setSlideAt(activeIdx, (s) => ({
      ...s,
      elements: s.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as SlideElement) : e)),
    }));
  }, [activeIdx, setSlideAt]);

  const addElement = useCallback((el: SlideElement) => {
    commitHistory();
    setSlideAt(activeIdx, (s) => ({ ...s, elements: [...s.elements, el] }));
    setSelectedId(el.id);
  }, [activeIdx, setSlideAt, commitHistory]);

  const deleteElement = useCallback((id: string) => {
    setSlideAt(activeIdx, (s) => ({ ...s, elements: s.elements.filter((e) => e.id !== id) }));
    setSelectedId(null);
  }, [activeIdx, setSlideAt]);

  const reorderElement = useCallback((id: string, dir: "up" | "down") => {
    setSlideAt(activeIdx, (s) => {
      const idx = s.elements.findIndex((e) => e.id === id);
      if (idx < 0) return s;
      const swap = dir === "up" ? idx + 1 : idx - 1;
      if (swap < 0 || swap >= s.elements.length) return s;
      const arr = [...s.elements];
      [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
      return { ...s, elements: arr };
    });
  }, [activeIdx, setSlideAt]);

  const applyPreset = useCallback((preset: "hook" | "chips" | "text_body" | "cta") => {
    if (!confirm("Esto reemplaza los elementos del slide actual por la plantilla. ¿Continuar?")) return;
    const source = slides[activeIdx];
    if (!source) return;
    commitHistory();
    const newSlide =
      preset === "hook" ? presetHook(source)
      : preset === "chips" ? presetChips(source)
      : preset === "text_body" ? presetTextBody(source)
      : presetCta(source);
    setSlideAt(activeIdx, (prev) => ({ ...newSlide, bgColor: prev.bgColor, showHeader: prev.showHeader, showNumber: prev.showNumber, showGrain: prev.showGrain }));
    setSelectedId(null);
  }, [activeIdx, slides, setSlideAt, commitHistory]);

  const saveAsTemplate = useCallback(async () => {
    const name = prompt("Nombre para la plantilla (ej. 'Slide de errores', 'Portada gancho'):");
    if (!name?.trim()) return;
    const res = await fetch("/api/carousel-maker/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), slideJson: JSON.stringify(activeSlide) }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error ?? "No se pudo guardar la plantilla.");
      return;
    }
    const created = await res.json();
    setTemplates((prev) => [created, ...prev]);
    alert(`Plantilla "${name}" guardada. Ya puedes aplicarla a otros slides.`);
  }, [activeSlide]);

  const applyTemplate = useCallback((templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    let parsed: SlideDoc;
    try { parsed = JSON.parse(tpl.slideJson); }
    catch { alert("La plantilla está corrupta."); return; }
    if (!confirm(`Aplicar plantilla "${tpl.name}" al slide ${activeIdx + 1}? Se copian estilo y posiciones de la plantilla — el texto ACTUAL del slide se mantiene.`)) return;
    const current = doc.slides[activeIdx];
    if (!current) return;
    commitHistory();
    const applied = applyTemplateToSlide(parsed, current);
    setSlideAt(activeIdx, () => applied);
    setSelectedId(null);
  }, [templates, activeIdx, doc.slides, setSlideAt, commitHistory]);

  const deleteTemplate = useCallback(async (id: string) => {
    if (!confirm("¿Eliminar esta plantilla del equipo?")) return;
    await fetch(`/api/carousel-maker/templates?id=${id}`, { method: "DELETE" });
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /**
   * Rehace el layout de TODOS los slides desde 0 con las heurísticas
   * actuales de canvas.ts. Útil cuando cambiamos los presets y queremos
   * que un draft antiguo se vea con la mejor versión sin regenerar texto.
   */
  const relayoutAll = useCallback(() => {
    if (!confirm("Esto va a reescribir la posición y tamaño de los elementos en TODOS los slides (mantiene el texto y el caption). ¿Continuar?")) return;
    commitHistory();
    const fresh = buildInitialDoc(slides, {});
    setDoc(fresh);
    setDirty(true);
    setSelectedId(null);
  }, [slides, commitHistory]);

  // ─── Drag ──────────────────────────────────────────────────────────
  const dragStateRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number; canvasEl: HTMLDivElement | null; committed: boolean } | null>(null);
  const SNAP_THRESHOLD = 1.2; // %

  const handleStartDrag = useCallback((id: string, e: React.PointerEvent<HTMLDivElement>) => {
    const canvasEl = (e.currentTarget.closest("[data-carousel-canvas]") as HTMLDivElement) ?? null;
    if (!canvasEl) return;
    const el = doc.slides[activeIdx]?.elements.find((x) => x.id === id);
    if (!el) return;
    dragStateRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: el.x,
      origY: el.y,
      canvasEl,
      committed: false,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [doc.slides, activeIdx]);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const st = dragStateRef.current;
      if (!st?.canvasEl) return;
      // Antes del primer move real, commit al historial. Así "arrastrar"
      // cuenta como una operación undoable y no fragmentamos por pixel.
      if (!st.committed) {
        commitHistory();
        st.committed = true;
      }
      const rect = st.canvasEl.getBoundingClientRect();
      const dxPct = ((e.clientX - st.startX) / rect.width) * 100;
      const dyPct = ((e.clientY - st.startY) / rect.height) * 100;
      let nx = Math.max(0, Math.min(100, st.origX + dxPct));
      let ny = Math.max(0, Math.min(100, st.origY + dyPct));
      // Snap al centro del canvas si estamos a menos de 1.2%.
      const snappedX = Math.abs(nx - 50) < SNAP_THRESHOLD;
      const snappedY = Math.abs(ny - 50) < SNAP_THRESHOLD;
      if (snappedX) nx = 50;
      if (snappedY) ny = 50;
      setGuides({ vCenter: snappedX, hCenter: snappedY });
      updateElement(st.id, { x: nx, y: ny });
    }
    function onUp() {
      dragStateRef.current = null;
      setGuides({ vCenter: false, hCenter: false });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateElement]);

  // ─── Resize ────────────────────────────────────────────────────────
  const resizeStateRef = useRef<{ id: string; corner: string; startX: number; startY: number; origWidth: number; origHeight?: number; origSize?: number; canvasEl: HTMLDivElement | null; committed: boolean } | null>(null);

  const handleStartResize = useCallback((id: string, corner: "nw" | "ne" | "sw" | "se", e: React.PointerEvent<HTMLDivElement>) => {
    const canvasEl = (e.currentTarget.closest("[data-carousel-canvas]") as HTMLDivElement) ?? null;
    if (!canvasEl) return;
    const el = doc.slides[activeIdx]?.elements.find((x) => x.id === id);
    if (!el) return;
    const origWidth = "width" in el && typeof (el as any).width === "number" ? (el as any).width as number : 40;
    const origHeight = "height" in el && typeof (el as any).height === "number" ? (el as any).height as number : undefined;
    const origSize = el.type === "text" ? el.size : el.type === "logo" ? (el.textSize ?? 46) : undefined;
    resizeStateRef.current = {
      id, corner,
      startX: e.clientX, startY: e.clientY,
      origWidth, origHeight, origSize,
      canvasEl,
      committed: false,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [doc.slides, activeIdx]);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const st = resizeStateRef.current;
      if (!st?.canvasEl) return;
      if (!st.committed) {
        commitHistory();
        st.committed = true;
      }
      const rect = st.canvasEl.getBoundingClientRect();
      // Diferencia proporcional al canvas (aumentar hacia fuera de la
      // esquina agranda). Simplificación: sumamos el "delta absoluto" a
      // width y también escalamos el size para textos/logos para no perder
      // ratio visual.
      const dxPct = ((e.clientX - st.startX) / rect.width) * 100;
      const dyPct = ((e.clientY - st.startY) / rect.height) * 100;
      // El signo depende de la esquina: nw/sw crecen si arrastramos hacia
      // la izquierda (dx negativo); ne/se crecen hacia la derecha.
      const wSign = (st.corner === "ne" || st.corner === "se") ? 1 : -1;
      const hSign = (st.corner === "sw" || st.corner === "se") ? 1 : -1;
      const deltaW = wSign * dxPct * 2; // multiplicamos por 2 porque el elemento se ancla en el centro
      const deltaH = hSign * dyPct * 2;
      const nextWidth = Math.max(3, Math.min(100, st.origWidth + deltaW));
      const factor = nextWidth / st.origWidth;

      const patch: any = { width: nextWidth };
      if (st.origHeight !== undefined) {
        // Para imagen y logo con height, mantenemos ratio si es esquina diagonal.
        patch.height = Math.max(2, Math.min(100, st.origHeight + deltaH));
      }
      if (st.origSize !== undefined) {
        // Textos/logos: escalamos también el tamaño de fuente por factor.
        const key = doc.slides[activeIdx]?.elements.find((x) => x.id === st.id)?.type === "logo" ? "textSize" : "size";
        patch[key] = Math.max(8, Math.min(400, st.origSize * factor));
      }
      updateElement(st.id, patch as Partial<SlideElement>);
    }
    function onUp() {
      resizeStateRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateElement, activeIdx, doc.slides]);

  // ─── Atajos de teclado ─────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const tag = target?.tagName?.toLowerCase();
      const isTyping = tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;

      // Undo/Redo — funcionan aunque haya un input enfocado NO editable de texto.
      if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) {
        // No pisamos undo del navegador si el user está escribiendo en un input real.
        if (isTyping) return;
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || e.key === "Y")) {
        if (isTyping) return;
        e.preventDefault();
        redo();
        return;
      }

      // Delete/Backspace — eliminar elemento seleccionado.
      if (e.key === "Delete" || e.key === "Backspace") {
        if (isTyping) return;
        if (editingId) return;
        if (selectedId) {
          e.preventDefault();
          commitHistory();
          deleteElement(selectedId);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, editingId, deleteElement, undo, redo, commitHistory]);

  // ─── Autosave ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(async () => {
      setSaving(true);
      const res = await fetch("/api/carousel-maker/drafts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: carouselId, visualJson: JSON.stringify(doc) }),
      });
      if (res.ok) setDirty(false);
      setSaving(false);
    }, 1500);
    return () => clearTimeout(t);
  }, [dirty, doc, carouselId]);

  // ─── Export ────────────────────────────────────────────────────────
  const baseName = useMemo(
    () => title.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 50) || "carrusel",
    [title],
  );

  async function exportOne() {
    const node = exportRefs.current.get(activeIdx);
    if (!node) return;
    setExporting(true);
    try {
      await downloadSingleSlide(node, activeIdx, baseName);
    } finally {
      setExporting(false);
    }
  }

  async function exportZip() {
    setExporting(true);
    try {
      const nodes: HTMLDivElement[] = [];
      for (let i = 0; i < doc.slides.length; i++) {
        const n = exportRefs.current.get(i);
        if (n) nodes.push(n);
      }
      await downloadCarouselZip(nodes, baseName);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex gap-4">
      <CarouselFontsLoader />

      {/* Sidebar miniaturas — compacto para dejar sitio al canvas y al panel */}
      <div className="w-32 flex-shrink-0 space-y-2 max-h-[85vh] overflow-y-auto">
        <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium mb-1">Slides</div>
        {doc.slides.map((s, i) => (
          <button
            key={i}
            onClick={() => { setActiveIdx(i); setSelectedId(null); }}
            className={`w-full block relative rounded-lg overflow-hidden border-2 transition-colors ${
              i === activeIdx ? "border-neutral-900" : "border-transparent hover:border-neutral-300"
            }`}
          >
            <div style={{ width: 120, height: 150, background: s.bgColor, overflow: "hidden" }}>
              <SlideCanvas
                doc={s}
                slideIndex={i}
                totalSlides={doc.slides.length}
                displayScale={120 / CANVAS_W}
              />
            </div>
            <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
              {i + 1}
            </div>
          </button>
        ))}
      </div>

      {/* Canvas central + toolbar en 2 filas para no chocar con el panel derecho */}
      <div className="flex-1 min-w-0 flex flex-col items-center gap-3">
        <div className="w-full space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-xs text-neutral-500 mr-auto">
              {dirty ? "Cambios sin guardar…" : saving ? "Guardando…" : "Guardado"}
            </div>
            <button onClick={undo} className="btn btn-ghost text-xs" title="Deshacer (Cmd+Z)">↶ Deshacer</button>
            <button onClick={redo} className="btn btn-ghost text-xs" title="Rehacer (Cmd+Shift+Z)">↷ Rehacer</button>
            <button onClick={exportOne} disabled={exporting} className="btn btn-ghost text-xs">
              ⬇ Slide
            </button>
            <button onClick={exportZip} disabled={exporting} className="btn btn-primary text-xs">
              {exporting ? "Exportando…" : "⬇ ZIP"}
            </button>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <ToolbarButton onClick={() => addElement(defaultTextElement())}>+ Texto</ToolbarButton>
            <ToolbarButton onClick={() => addElement(defaultLineElement())}>+ Línea</ToolbarButton>
            <ToolbarButton onClick={() => addElement(defaultChipElement())}>+ Chip</ToolbarButton>
            <ToolbarButton onClick={() => addElement(defaultLogoElement())} title="Añade el logo FISIOF/T CROSS (editable o reemplazable por PNG)">
              + Logo
            </ToolbarButton>
            <ToolbarButton onClick={async () => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/*";
              input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                try {
                  const url = await uploadCarouselImage(file);
                  addElement(defaultImageElement(url));
                } catch (e: any) {
                  alert(e?.message ?? "No se pudo subir la imagen.");
                }
              };
              input.click();
            }}>+ Imagen</ToolbarButton>
            <div className="mx-1 h-6 border-l border-neutral-200" />
            <PresetMenu onApply={applyPreset} />
            <TemplatesMenu
              templates={templates}
              onSave={saveAsTemplate}
              onApply={applyTemplate}
              onDelete={deleteTemplate}
            />
            <ToolbarButton onClick={relayoutAll} title="Rehace la posición de TODOS los slides con la heurística actual (mantiene texto)">
              ♻ Recolocar todo
            </ToolbarButton>
          </div>
        </div>

<CanvasStage
  doc={activeSlide}
  slideIndex={activeIdx}
  totalSlides={doc.slides.length}
  selectedId={selectedId}
  setSelectedId={(id) => { setSelectedId(id); if (editingId && editingId !== id) setEditingId(null); }}
  editingId={editingId}
  onStartDrag={handleStartDrag}
  onStartResize={handleStartResize}
  onStartEditing={(id) => { setSelectedId(id); setEditingId(id); }}
  onFinishEditing={(id, content) => {
    commitHistory();
    updateElement(id, { content } as Partial<SlideElement>);
    setEditingId(null);
  }}
  guides={guides}
/>

        <p className="text-[10px] text-neutral-500 text-center">
          Click = seleccionar · arrastrar = mover · <strong>doble-click en un texto = editar in situ</strong> · esquinas amarillas = redimensionar · Supr = eliminar · <kbd>Cmd+Z</kbd> deshacer · guía amarilla = centrado
        </p>
      </div>

      {/* Panel derecho */}
      <div className="w-72 flex-shrink-0 max-h-[85vh] overflow-y-auto">
        <PropertyPanel
          selected={selectedEl}
          slide={activeSlide}
          onChangeElement={(patch) => selectedId && updateElement(selectedId, patch)}
          onChangeSlide={updateActiveSlide}
          onDeleteElement={() => selectedId && deleteElement(selectedId)}
          onBringForward={() => selectedId && reorderElement(selectedId, "up")}
          onSendBackward={() => selectedId && reorderElement(selectedId, "down")}
        />
      </div>

      {/* Contenedor off-screen para captura de export a 1080×1350 */}
      <div style={{ position: "fixed", left: -99999, top: 0, pointerEvents: "none" }} aria-hidden>
        {doc.slides.map((s, i) => (
          <SlideCanvas
            key={i}
            ref={(el) => {
              if (el) exportRefs.current.set(i, el);
              else exportRefs.current.delete(i);
            }}
            doc={s}
            slideIndex={i}
            totalSlides={doc.slides.length}
            displayScale={1}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Escenario del canvas: mide su ancho contenedor con ResizeObserver y
 * escala el slide para ocupar el sitio disponible sin desbordar el flex-1
 * (que era lo que hacía que la esquina derecha del canvas invadiera el
 * panel derecho). Mantiene el ratio 1080×1350 (4:5) intacto y cap a 640px
 * de ancho para no crecer infinito en pantallas muy anchas.
 */
function CanvasStage({
  doc,
  slideIndex,
  totalSlides,
  selectedId,
  setSelectedId,
  editingId,
  onStartDrag,
  onStartEditing,
  onFinishEditing,
  onStartResize,
  guides,
}: {
  doc: SlideDoc;
  slideIndex: number;
  totalSlides: number;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  editingId: string | null;
  onStartDrag: (id: string, e: React.PointerEvent<HTMLDivElement>) => void;
  onStartEditing: (id: string) => void;
  onFinishEditing: (id: string, content: string) => void;
  onStartResize: (id: string, corner: "nw" | "ne" | "sw" | "se", e: React.PointerEvent<HTMLDivElement>) => void;
  guides: { vCenter: boolean; hCenter: boolean };
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayW, setDisplayW] = useState(560);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect?.width ?? el.clientWidth;
      // 32px de padding interno + 32px de margen; cap 640.
      const target = Math.min(640, Math.max(240, cw - 32));
      setDisplayW(target);
    });
    ro.observe(el);
    setDisplayW(Math.min(640, Math.max(240, el.clientWidth - 32)));
    return () => ro.disconnect();
  }, []);

  const displayH = displayW * (CANVAS_H / CANVAS_W);

  return (
    <div ref={containerRef} className="w-full">
      <div
        className="bg-neutral-200 rounded-2xl p-4 shadow-inner mx-auto"
        style={{ width: displayW + 32, height: displayH + 32 }}
      >
        <div
          data-carousel-canvas
          style={{ width: displayW, height: displayH, overflow: "hidden", background: doc.bgColor, borderRadius: 12, position: "relative" }}
        >
          <SlideCanvas
            doc={doc}
            slideIndex={slideIndex}
            totalSlides={totalSlides}
            displayScale={displayW / CANVAS_W}
            selectedElementId={selectedId}
            editingElementId={editingId}
            onSelectElement={setSelectedId}
            onStartDrag={onStartDrag}
            onStartEditing={onStartEditing}
            onFinishEditing={onFinishEditing}
            onStartResize={onStartResize}
            guides={guides}
          />
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title} className="text-xs px-2.5 py-1.5 rounded border border-neutral-200 bg-white hover:border-neutral-400 whitespace-nowrap">
      {children}
    </button>
  );
}

function PresetMenu({ onApply }: { onApply: (p: "hook" | "chips" | "text_body" | "cta") => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="text-xs px-2.5 py-1.5 rounded border border-neutral-200 bg-white hover:border-neutral-400 whitespace-nowrap">
        🎨 Preset ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg z-50 min-w-[220px]">
            <MenuItem onClick={() => { onApply("hook"); setOpen(false); }}>Hook (titular gigante)</MenuItem>
            <MenuItem onClick={() => { onApply("chips"); setOpen(false); }}>Titular + chips</MenuItem>
            <MenuItem onClick={() => { onApply("text_body"); setOpen(false); }}>Titular + cuerpo largo</MenuItem>
            <MenuItem onClick={() => { onApply("cta"); setOpen(false); }}>CTA (cinta amarilla)</MenuItem>
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="block w-full text-left text-xs px-3 py-2 hover:bg-neutral-50">{children}</button>;
}

function TemplatesMenu({
  templates,
  onSave,
  onApply,
  onDelete,
}: {
  templates: Array<{ id: string; name: string; description: string | null }>;
  onSave: () => void;
  onApply: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="text-xs px-2.5 py-1.5 rounded border border-neutral-200 bg-white hover:border-neutral-400 whitespace-nowrap">
        📥 Plantillas ({templates.length}) ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg z-50 min-w-[260px] max-h-[60vh] overflow-y-auto">
            <div className="border-b border-neutral-100">
              <MenuItem onClick={() => { onSave(); setOpen(false); }}>
                💾 <strong>Guardar este slide como plantilla</strong>
              </MenuItem>
            </div>
            {templates.length === 0 ? (
              <p className="text-[11px] text-neutral-500 px-3 py-3 text-center">
                Aún no tienes plantillas.<br />Guarda un slide para reutilizar su estilo.
              </p>
            ) : (
              <>
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium px-3 pt-2">
                  Aplicar al slide actual
                </div>
                {templates.map((t) => (
                  <div key={t.id} className="flex items-center gap-1 px-2 py-1 hover:bg-neutral-50">
                    <button
                      onClick={() => { onApply(t.id); setOpen(false); }}
                      className="flex-1 text-left text-xs px-2 py-1"
                    >
                      {t.name}
                      {t.description && <span className="block text-[10px] text-neutral-500">{t.description}</span>}
                    </button>
                    <button
                      onClick={() => onDelete(t.id)}
                      className="text-xs text-red-600 px-1"
                      title="Eliminar plantilla"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
