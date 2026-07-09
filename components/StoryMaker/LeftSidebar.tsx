"use client";

import { useState } from "react";
import { SlideCanvas } from "./SlideCanvas";
import type { Slide, StoryTemplate } from "@/lib/story-maker/types";

export function LeftSidebar({
  templates,
  onApplyTemplate,
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
  onGenerate: (templateKey: string, prompt: string, count: number) => void;
  generating: boolean;
  slides: Slide[];
  selectedSlideIdx: number;
  onSelectSlide: (i: number) => void;
  onAddSlide: () => void;
  onDupSlide: () => void;
  onDelSlide: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [aiTemplateKey, setAiTemplateKey] = useState(templates[0]?.key ?? "");
  const [aiCount, setAiCount] = useState(3);

  return (
    <aside className="rounded-2xl bg-white border border-neutral-200 flex flex-col overflow-y-auto">
      <div className="p-3 border-b border-neutral-100">
        <div className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
          ✨ Generar con IA
        </div>
        <textarea
          className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-neutral-400"
          rows={3}
          placeholder="Ej: 4 stories sobre dolor de hombro en atletas de CrossFit"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2 mt-2">
          <select
            value={aiTemplateKey}
            onChange={(e) => setAiTemplateKey(e.target.value)}
            className="text-xs border border-neutral-200 rounded px-2 py-1.5"
          >
            {templates.map((t) => (
              <option key={t.key} value={t.key}>
                {t.emoji ? `${t.emoji} ` : ""}
                {t.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={10}
            value={aiCount}
            onChange={(e) => setAiCount(Math.max(1, Math.min(10, Number(e.target.value) || 3)))}
            className="text-xs border border-neutral-200 rounded px-2 py-1.5"
            placeholder="Nº"
          />
        </div>
        <button
          onClick={() => onGenerate(aiTemplateKey, prompt.trim(), aiCount)}
          disabled={generating || prompt.trim().length < 5}
          className="mt-2 w-full text-sm font-semibold px-3 py-2 rounded-lg bg-neutral-900 text-white disabled:opacity-50"
        >
          {generating ? "Generando…" : "✨ Generar carrusel"}
        </button>
      </div>

      <div className="p-3 border-b border-neutral-100">
        <div className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
          🎨 Plantillas
        </div>
        <div className="grid grid-cols-2 gap-2">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => onApplyTemplate(t)}
              className="rounded-lg overflow-hidden border border-neutral-200 hover:border-neutral-400 hover:shadow-sm bg-neutral-50"
              title={t.description}
            >
              <div className="aspect-[9/16] flex items-center justify-center bg-neutral-950 overflow-hidden">
                <SlideCanvas slide={t.slides[0]} scale={0.09} />
              </div>
              <div className="text-[10px] text-center py-1 truncate">
                {t.emoji} {t.name}
              </div>
            </button>
          ))}
        </div>
      </div>

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
