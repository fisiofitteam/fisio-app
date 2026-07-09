"use client";

import { useState } from "react";
import { SlideCanvas } from "./SlideCanvas";
import type { Slide, StoryTemplate } from "@/lib/story-maker/types";

export function LeftSidebar({
  templates,
  onApplyTemplate,
  onSeedBuiltins,
  onGenerate,
  generating,
  slides,
  selectedSlideIdx,
  onSelectSlide,
  onAddSlide,
  onDupSlide,
  onDelSlide,
}: {
  templates: StoryTemplate[];
  onApplyTemplate: (t: StoryTemplate) => void;
  onSeedBuiltins: () => void;
  onGenerate: (prompt: string, templateKey?: string) => void;
  generating: boolean;
  slides: Slide[];
  selectedSlideIdx: number;
  onSelectSlide: (i: number) => void;
  onAddSlide: () => void;
  onDupSlide: () => void;
  onDelSlide: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(templates[0]?.key ?? "");
  const [preserveTexts, setPreserveTexts] = useState(true);

  const selectedTemplate = templates.find((t) => t.key === selectedTemplateKey) ?? templates[0];

  return (
    <aside className="rounded-2xl bg-white border border-neutral-200 flex flex-col overflow-y-auto">
      {/* ── Generar con IA ───────────────────────────────────────── */}
      <div className="p-3 border-b border-neutral-100">
        <div className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
          ✨ Generar con IA
        </div>
        <textarea
          className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-neutral-400"
          rows={4}
          placeholder="Ej: 4 stories sobre dolor de hombro en atletas de CrossFit. La primera con impacto, luego una cita, una lista de ejercicios y una pregunta al final."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button
          onClick={() => onGenerate(prompt.trim(), selectedTemplateKey || undefined)}
          disabled={generating || prompt.trim().length < 5}
          className="mt-2 w-full text-sm font-semibold px-3 py-2 rounded-lg bg-neutral-900 text-white disabled:opacity-50"
        >
          {generating ? "Generando…" : "✨ Generar carrusel"}
        </button>
        <p className="mt-1.5 text-[10px] text-neutral-400 leading-tight">
          Claude Opus 4.7 diseña Y escribe cada slide desde 0:
          composición, tipografías, colores y texto. Indica en el prompt
          nº de stories, tema y tono.
        </p>
      </div>

      {/* ── Plantillas (dropdown) ─────────────────────────────────── */}
      <div className="p-3 border-b border-neutral-100">
        <div className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
          🎨 Plantillas
        </div>

        {templates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-3 text-center space-y-2">
            <p className="text-[11px] text-neutral-500 italic leading-tight">
              Aún no tienes plantillas.
            </p>
            <button
              onClick={onSeedBuiltins}
              className="text-xs font-semibold px-3 py-1.5 rounded bg-neutral-900 text-white hover:bg-neutral-800"
            >
              🎨 Cargar 4 plantillas de ejemplo
            </button>
          </div>
        ) : (
          <>
            <select
              value={selectedTemplateKey}
              onChange={(e) => setSelectedTemplateKey(e.target.value)}
              className="w-full text-sm border border-neutral-200 rounded-lg px-2 py-2 mb-2"
            >
              {templates.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.emoji ? `${t.emoji} ` : ""}
                  {t.name}
                </option>
              ))}
            </select>

            {selectedTemplate && (
              <div className="rounded-lg overflow-hidden border border-neutral-200 bg-neutral-950 mb-2 flex items-center justify-center">
                <div className="aspect-[9/16] flex items-center justify-center">
                  <SlideCanvas slide={selectedTemplate.slides[0]} scale={0.14} />
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-[11px] text-neutral-600 mb-2 select-none">
              <input
                type="checkbox"
                checked={preserveTexts}
                onChange={(e) => setPreserveTexts(e.target.checked)}
                className="w-3 h-3"
              />
              Mantener los textos actuales
            </label>

            <button
              onClick={() => {
                if (!selectedTemplate) return;
                // Marca en el template para que el editor sepa si preservar
                onApplyTemplate({ ...selectedTemplate, __preserveTexts: preserveTexts } as any);
              }}
              className="w-full text-xs font-semibold px-3 py-1.5 rounded bg-neutral-900 text-white hover:bg-neutral-800"
            >
              Aplicar plantilla
            </button>

            {selectedTemplate?.description && (
              <p className="mt-1.5 text-[10px] text-neutral-400 leading-tight">
                {selectedTemplate.description}
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Slides ────────────────────────────────────────────────── */}
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            📱 Slides ({slides.length})
          </div>
        </div>
        <div className="space-y-2">
          {slides.map((s, i) => (
            <button
              key={i}
              onClick={() => onSelectSlide(i)}
              className={`w-full flex gap-2 items-center rounded-lg overflow-hidden border p-1 text-left ${
                i === selectedSlideIdx
                  ? "border-neutral-900 bg-neutral-50"
                  : "border-neutral-200 hover:border-neutral-400"
              }`}
            >
              <div className="w-8 text-center text-[10px] font-bold text-neutral-400">
                {i + 1}
              </div>
              <div className="w-14 h-24 bg-neutral-950 rounded overflow-hidden shrink-0">
                <SlideCanvas slide={s} scale={0.075} />
              </div>
              <div className="flex-1 text-[10px] text-neutral-500">
                {s.elements.length} elemento{s.elements.length === 1 ? "" : "s"}
              </div>
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-1">
          <button
            onClick={onAddSlide}
            className="flex-1 text-xs font-medium px-2 py-1.5 rounded border border-neutral-300 hover:bg-neutral-50"
          >
            + Añadir
          </button>
          <button
            onClick={onDupSlide}
            className="text-xs font-medium px-2 py-1.5 rounded border border-neutral-300 hover:bg-neutral-50"
            title="Duplicar slide"
          >
            ⎘
          </button>
          <button
            onClick={onDelSlide}
            disabled={slides.length === 1}
            className="text-xs font-medium px-2 py-1.5 rounded border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-40"
            title="Borrar slide"
          >
            🗑
          </button>
        </div>
      </div>
    </aside>
  );
}
