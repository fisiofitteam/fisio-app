"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CarouselSlide } from "@/lib/carousel-maker/types";
import {
  autoAssignLayout,
  suggestYellowWords,
  type CarouselVisual,
  type SlideLayout,
  type SlideVisual,
} from "@/lib/carousel-maker/visual";
import { CarouselFontsLoader } from "./FontsLoader";
import { SlideCanvas } from "./SlideCanvas";
import { downloadCarouselZip, downloadSingleSlide } from "./exportCarousel";

const LAYOUT_OPTIONS: Array<{ value: SlideLayout; label: string }> = [
  { value: "hook", label: "Hook (titular gigante)" },
  { value: "hook_photo", label: "Hook + foto" },
  { value: "chips_list", label: "Titular + chips" },
  { value: "text_body", label: "Titular + cuerpo largo" },
  { value: "cta_ribbon", label: "CTA (cinta amarilla)" },
];

/**
 * Editor visual del carrusel: sidebar con miniaturas, canvas central
 * escalado, panel derecho con opciones del slide activo (layout, palabras
 * en amarillo, chips manuales, CTA keyword). Persiste el visual en el
 * backend (Carousel.visualJson) y exporta PNG / ZIP con html-to-image.
 */
export function VisualEditor({
  carouselId,
  title,
  slides,
  initialVisual,
}: {
  carouselId: string;
  title: string;
  slides: CarouselSlide[];
  initialVisual: CarouselVisual;
}) {
  // Rellenamos los slides que no tienen visual con auto-asignación.
  const [visual, setVisual] = useState<CarouselVisual>(() => {
    const out: CarouselVisual = { ...initialVisual };
    slides.forEach((s, i) => {
      if (!out[s.n]) {
        out[s.n] = {
          layout: autoAssignLayout(s, { isFirst: i === 0, isLast: i === slides.length - 1 }),
          yellowWords: s.title ? suggestYellowWords(s.title) : [],
        };
      }
    });
    return out;
  });

  const [activeN, setActiveN] = useState<number>(slides[0]?.n ?? 1);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [exporting, setExporting] = useState(false);

  const activeSlide = slides.find((s) => s.n === activeN) ?? slides[0];
  const activeVisual = visual[activeN] ?? { layout: "hook" as SlideLayout };

  // Refs para captura: uno por slide. En pantalla mostramos SOLO el activo
  // (los demás como miniatura scaled). Los ocultos para exportar viven en
  // un contenedor off-screen que renderiza los N slides a tamaño real.
  const exportRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  function setActiveVisual(patch: Partial<SlideVisual>) {
    setVisual((prev) => ({ ...prev, [activeN]: { ...prev[activeN], ...patch } }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    const res = await fetch("/api/carousel-maker/drafts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: carouselId,
        // Guardamos el visual JSON. El resto del draft no se toca desde aquí.
        visualJson: JSON.stringify(visual),
      } as any),
    });
    if (res.ok) setDirty(false);
    setSaving(false);
  }

  async function exportZip() {
    setExporting(true);
    const nodes = slides
      .map((s) => exportRefs.current.get(s.n))
      .filter((n): n is HTMLDivElement => !!n);
    const baseName = title.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 50) || "carrusel";
    try {
      await downloadCarouselZip(nodes, baseName);
    } finally {
      setExporting(false);
    }
  }

  async function exportOne() {
    const node = exportRefs.current.get(activeN);
    if (!node) return;
    const baseName = title.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 50) || "carrusel";
    setExporting(true);
    try {
      await downloadSingleSlide(node, slides.findIndex((s) => s.n === activeN), baseName);
    } finally {
      setExporting(false);
    }
  }

  // Auto-guarda con debounce.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => { save(); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visual, dirty]);

  return (
    <div className="flex gap-4">
      <CarouselFontsLoader />

      {/* Sidebar miniaturas */}
      <div className="w-40 flex-shrink-0 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium mb-1">Slides</div>
        {slides.map((s) => (
          <button
            key={s.n}
            onClick={() => setActiveN(s.n)}
            className={`w-full block relative rounded-lg overflow-hidden border-2 transition-colors ${
              s.n === activeN ? "border-neutral-900" : "border-transparent hover:border-neutral-300"
            }`}
          >
            <div style={{ width: 160, height: 200, background: "#0A0A0A" }}>
              <SlideCanvas
                slide={s}
                visual={visual[s.n] ?? { layout: "hook" as SlideLayout }}
                slideIndex={slides.findIndex((x) => x.n === s.n)}
                totalSlides={slides.length}
                displayScale={160 / 1080}
              />
            </div>
            <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
              {s.n}
            </div>
          </button>
        ))}
      </div>

      {/* Canvas central */}
      <div className="flex-1 flex flex-col items-center gap-4">
        <div className="flex items-center gap-2 flex-wrap w-full">
          <div className="text-xs text-neutral-500">
            {dirty ? "Cambios sin guardar…" : saving ? "Guardando…" : "Guardado"}
          </div>
          <div className="ml-auto flex gap-2">
            <button onClick={exportOne} disabled={exporting} className="btn btn-ghost text-xs">
              {exporting ? "Exportando…" : "⬇ Exportar slide"}
            </button>
            <button onClick={exportZip} disabled={exporting} className="btn btn-primary text-xs">
              {exporting ? "Exportando…" : "⬇ Exportar ZIP"}
            </button>
          </div>
        </div>

        <div
          className="bg-neutral-100 rounded-2xl p-4 shadow-inner"
          style={{ width: 540 + 32, height: 675 + 32 }}
        >
          <div style={{ width: 540, height: 675, overflow: "hidden", background: "#0A0A0A", borderRadius: 12 }}>
            <SlideCanvas
              slide={activeSlide}
              visual={activeVisual}
              slideIndex={slides.findIndex((s) => s.n === activeN)}
              totalSlides={slides.length}
              displayScale={540 / 1080}
            />
          </div>
        </div>
      </div>

      {/* Panel derecho */}
      <div className="w-72 flex-shrink-0 space-y-4">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium block mb-1">
            Layout del slide {activeN}
          </label>
          <select
            className="input text-sm"
            value={activeVisual.layout}
            onChange={(e) => setActiveVisual({ layout: e.target.value as SlideLayout })}
          >
            {LAYOUT_OPTIONS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>

        {activeSlide.title && (
          <div>
            <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium block mb-1">
              Palabras en amarillo
            </label>
            <input
              type="text"
              className="input text-sm"
              value={(activeVisual.yellowWords ?? []).join(" ")}
              onChange={(e) => setActiveVisual({
                yellowWords: e.target.value.split(/\s+/).map((w) => w.trim()).filter(Boolean),
              })}
              placeholder="ej: MÁS HOMBRO"
            />
            <p className="text-[10px] text-neutral-500 mt-1">
              Separadas por espacios. Case-insensitive. Sugerencias: {suggestYellowWords(activeSlide.title).join(", ") || "—"}
            </p>
          </div>
        )}

        {activeVisual.layout === "chips_list" && (
          <div>
            <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium block mb-1">
              Chips (uno por línea, "Icono | Etiqueta")
            </label>
            <textarea
              className="input text-sm font-mono"
              rows={6}
              value={(activeVisual.chips ?? []).map((c) => `${c.icon} | ${c.label}`).join("\n")}
              onChange={(e) => setActiveVisual({
                chips: e.target.value.split(/\n/).map((line) => {
                  const [icon, ...rest] = line.split("|").map((p) => p.trim());
                  const label = rest.join("|").trim();
                  if (!label) return null;
                  return { icon: icon || label[0].toUpperCase(), label };
                }).filter((x): x is { icon: string; label: string } => !!x),
              })}
              placeholder="⚡ | Colgarte&#10;💪 | Empujar"
            />
            <p className="text-[10px] text-neutral-500 mt-1">
              Si dejas vacío, se autogeneran del body del slide.
            </p>
          </div>
        )}

        {activeVisual.layout === "cta_ribbon" && (
          <div>
            <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium block mb-1">
              Palabra CTA (en la cinta)
            </label>
            <input
              type="text"
              className="input text-sm font-mono uppercase"
              value={activeVisual.ctaKeyword ?? ""}
              onChange={(e) => setActiveVisual({ ctaKeyword: e.target.value.toUpperCase() })}
              placeholder="HOMBRO"
            />
          </div>
        )}

        {(activeVisual.layout === "hook_photo") && (
          <div>
            <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium block mb-1">
              URL de foto (opcional)
            </label>
            <input
              type="url"
              className="input text-sm"
              value={activeVisual.photoUrl ?? ""}
              onChange={(e) => setActiveVisual({ photoUrl: e.target.value })}
              placeholder="https://..."
            />
            <p className="text-[10px] text-neutral-500 mt-1">
              Upload propio llega en Fase D. De momento, pega la URL de una foto ya subida.
            </p>
          </div>
        )}
      </div>

      {/* Contenedor off-screen con los N slides a 1080×1350 para capturar en export */}
      <div style={{ position: "fixed", left: -99999, top: 0, pointerEvents: "none" }} aria-hidden>
        {slides.map((s, i) => (
          <SlideCanvas
            key={s.n}
            ref={(el) => {
              if (el) exportRefs.current.set(s.n, el);
              else exportRefs.current.delete(s.n);
            }}
            slide={s}
            visual={visual[s.n] ?? { layout: "hook" as SlideLayout }}
            slideIndex={i}
            totalSlides={slides.length}
            displayScale={1}
          />
        ))}
      </div>
    </div>
  );
}

