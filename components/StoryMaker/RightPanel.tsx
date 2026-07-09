"use client";

import { useState } from "react";
import type {
  LineElement,
  LogoElement,
  Slide,
  SlideElement,
  TextElement,
} from "@/lib/story-maker/types";
import { BRAND_YELLOW, WHITE } from "@/lib/story-maker/types";

const FONT_OPTIONS: TextElement["font"][] = [
  "Antonio", "Futura", "Manrope", "Playfair Display",
  "Cormorant Garamond", "Archivo Black", "Bebas Neue", "Inter",
];

const WEIGHT_OPTIONS: TextElement["weight"][] = [400, 500, 600, 700, 800, 900];

export function RightPanel({
  slide,
  selectedElement,
  onSelectElement,
  onUpdateElement,
  onDeleteElement,
  onDuplicateElement,
  onAddElement,
  onSaveAsTemplate,
  newId,
}: {
  slide: Slide;
  selectedElement: SlideElement | null;
  onSelectElement: (id: string | null) => void;
  onUpdateElement: (id: string, patch: Partial<SlideElement>) => void;
  onDeleteElement: (id: string) => void;
  onDuplicateElement: (id: string) => void;
  onAddElement: (el: SlideElement) => void;
  onSaveAsTemplate: (name: string, description: string) => void;
  newId: () => string;
}) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState("");

  function addText() {
    onAddElement({
      id: newId(),
      type: "text",
      x: 50, y: 50, width: 80,
      content: "Nuevo texto",
      font: "Antonio",
      size: 80,
      weight: 900,
      color: WHITE,
      bgColor: "transparent",
      align: "center",
      shadow: false,
    });
  }
  function addLine() {
    onAddElement({
      id: newId(),
      type: "line",
      x: 50, y: 50, width: 30,
      height: 6,
      color: BRAND_YELLOW,
    });
  }
  function addLogo() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.onchange = () => {
      const f = inp.files?.[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = (e) => {
        const url = e.target?.result as string;
        onAddElement({
          id: newId(),
          type: "logo",
          x: 50, y: 50,
          size: 200,
          url,
        });
      };
      r.readAsDataURL(f);
    };
    inp.click();
  }

  return (
    <aside className="rounded-2xl bg-white border border-neutral-200 flex flex-col overflow-hidden">
      {/* Añadir elementos */}
      <div className="p-3 border-b border-neutral-100">
        <div className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
          🎁 Elementos
        </div>
        <div className="space-y-1.5">
          <button
            onClick={addText}
            className="w-full text-xs font-medium px-3 py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 flex items-center gap-2"
          >
            <span className="text-lg">Aa</span>
            <span>Añadir texto</span>
          </button>
          <button
            onClick={addLogo}
            className="w-full text-xs font-medium px-3 py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 flex items-center gap-2"
          >
            <span className="text-lg">🖼</span>
            <span>Añadir logo</span>
          </button>
          <button
            onClick={addLine}
            className="w-full text-xs font-medium px-3 py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 flex items-center gap-2"
          >
            <span className="text-lg">—</span>
            <span>Añadir línea</span>
          </button>
        </div>
      </div>

      {/* Lista de elementos del slide */}
      <div className="p-3 border-b border-neutral-100">
        <div className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
          📋 En este slide
        </div>
        {slide.elements.length === 0 ? (
          <p className="text-[11px] text-neutral-400 italic">Sin elementos.</p>
        ) : (
          <div className="space-y-1">
            {slide.elements.map((el) => {
              const label =
                el.type === "text"
                  ? (el as TextElement).content.slice(0, 30)
                  : el.type === "logo"
                    ? "Logo"
                    : "Línea";
              return (
                <div
                  key={el.id}
                  className={`flex items-center gap-1 rounded px-2 py-1.5 text-xs cursor-pointer ${
                    selectedElement?.id === el.id
                      ? "bg-blue-50 border border-blue-300"
                      : "hover:bg-neutral-50"
                  }`}
                  onClick={() => onSelectElement(el.id)}
                >
                  <span className="text-neutral-400 text-[10px] font-mono w-5">
                    {el.type === "text" ? "Aa" : el.type === "logo" ? "🖼" : "—"}
                  </span>
                  <span className="flex-1 truncate">{label}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicateElement(el.id);
                    }}
                    className="text-neutral-400 hover:text-neutral-900"
                    title="Duplicar"
                  >
                    ⎘
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteElement(el.id);
                    }}
                    className="text-neutral-400 hover:text-red-600"
                    title="Borrar"
                  >
                    🗑
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Editor del elemento seleccionado */}
      {selectedElement && (
        <div className="p-3 border-b border-neutral-100 space-y-2 overflow-auto">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              ✏ Editar {selectedElement.type === "text" ? "texto" : selectedElement.type === "logo" ? "logo" : "línea"}
            </div>
            <button
              onClick={() => onDuplicateElement(selectedElement.id)}
              className="text-[10px] font-medium px-2 py-1 rounded border border-neutral-200 hover:bg-neutral-50"
              title="Duplicar elemento (con misma configuración)"
            >
              ⎘ Duplicar
            </button>
          </div>
          {selectedElement.type === "text" && (
            <TextEditor el={selectedElement} onChange={(p) => onUpdateElement(selectedElement.id, p)} />
          )}
          {selectedElement.type === "logo" && (
            <LogoEditor el={selectedElement} onChange={(p) => onUpdateElement(selectedElement.id, p)} />
          )}
          {selectedElement.type === "line" && (
            <LineEditor el={selectedElement} onChange={(p) => onUpdateElement(selectedElement.id, p)} />
          )}
        </div>
      )}

      {/* Guardar como plantilla */}
      <div className="mt-auto p-3 border-t border-neutral-100">
        {!saveOpen ? (
          <button
            onClick={() => setSaveOpen(true)}
            className="w-full text-xs font-semibold px-3 py-2 rounded-lg bg-neutral-900 text-white"
          >
            💾 Guardar como plantilla
          </button>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Nombre de la plantilla"
              className="w-full text-sm border border-neutral-200 rounded px-2 py-1.5"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
            />
            <input
              type="text"
              placeholder="Descripción breve"
              className="w-full text-xs border border-neutral-200 rounded px-2 py-1.5"
              value={saveDesc}
              onChange={(e) => setSaveDesc(e.target.value)}
            />
            <div className="flex gap-1">
              <button
                onClick={() => { onSaveAsTemplate(saveName, saveDesc); setSaveOpen(false); setSaveName(""); setSaveDesc(""); }}
                className="flex-1 text-xs font-semibold px-3 py-2 rounded bg-neutral-900 text-white"
              >
                Guardar
              </button>
              <button
                onClick={() => setSaveOpen(false)}
                className="text-xs px-3 py-2 rounded border border-neutral-300"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Editor por tipo de elemento ───────────────────────────────────────

function TextEditor({ el, onChange }: { el: TextElement; onChange: (p: Partial<TextElement>) => void }) {
  return (
    <>
      <label className="block">
        <span className="text-[10px] font-medium text-neutral-500 uppercase">Contenido</span>
        <textarea
          className="w-full text-sm border border-neutral-200 rounded px-2 py-1.5 mt-1 resize-none"
          rows={2}
          value={el.content}
          onChange={(e) => onChange({ content: e.target.value })}
        />
      </label>
      <Row label="Fuente">
        <select
          value={el.font}
          onChange={(e) => onChange({ font: e.target.value as any })}
          className="w-full text-xs border border-neutral-200 rounded px-2 py-1"
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </Row>
      <Row label={`Tamaño ${el.size}`}>
        <input
          type="range"
          min={20}
          max={400}
          value={el.size}
          onChange={(e) => onChange({ size: Number(e.target.value) })}
          className="w-full"
        />
      </Row>
      <Row label="Peso">
        <select
          value={el.weight}
          onChange={(e) => onChange({ weight: Number(e.target.value) as any })}
          className="w-full text-xs border border-neutral-200 rounded px-2 py-1"
        >
          {WEIGHT_OPTIONS.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
      </Row>
      <Row label="Color texto">
        <input
          type="color"
          value={el.color}
          onChange={(e) => onChange({ color: e.target.value })}
          className="w-full h-8 border border-neutral-200 rounded cursor-pointer"
        />
      </Row>
      <Row label="Fondo texto">
        <div className="flex gap-1 items-center">
          <input
            type="color"
            value={el.bgColor !== "transparent" ? el.bgColor : "#000000"}
            onChange={(e) => onChange({ bgColor: e.target.value })}
            className="flex-1 h-8 border border-neutral-200 rounded cursor-pointer"
          />
          <button
            onClick={() => onChange({ bgColor: "transparent" })}
            className={`text-[10px] px-2 py-1 rounded border ${el.bgColor === "transparent" ? "bg-neutral-900 text-white" : "border-neutral-300"}`}
          >
            Sin
          </button>
        </div>
      </Row>
      <Row label="Alineación">
        <div className="flex gap-1">
          {(["left", "center", "right"] as const).map((a) => (
            <button
              key={a}
              onClick={() => onChange({ align: a })}
              className={`flex-1 text-xs px-2 py-1 rounded border ${el.align === a ? "bg-neutral-900 text-white border-neutral-900" : "border-neutral-200"}`}
            >
              {a === "left" ? "⇤" : a === "center" ? "≡" : "⇥"}
            </button>
          ))}
        </div>
      </Row>
      <Row label={`Ancho ${el.width}%`}>
        <input
          type="range"
          min={20}
          max={100}
          value={el.width}
          onChange={(e) => onChange({ width: Number(e.target.value) })}
          className="w-full"
        />
      </Row>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={el.shadow}
          onChange={(e) => onChange({ shadow: e.target.checked })}
        />
        Sombra
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={!!el.italic}
          onChange={(e) => onChange({ italic: e.target.checked })}
        />
        Cursiva
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={!!el.uppercase}
          onChange={(e) => onChange({ uppercase: e.target.checked })}
        />
        MAYÚSCULAS
      </label>
    </>
  );
}

function LogoEditor({ el, onChange }: { el: LogoElement; onChange: (p: Partial<LogoElement>) => void }) {
  return (
    <>
      <Row label={`Tamaño ${el.size}px`}>
        <input
          type="range"
          min={50}
          max={600}
          value={el.size}
          onChange={(e) => onChange({ size: Number(e.target.value) })}
          className="w-full"
        />
      </Row>
      <Row label="URL / archivo">
        <input
          type="text"
          value={el.url}
          onChange={(e) => onChange({ url: e.target.value })}
          className="w-full text-xs border border-neutral-200 rounded px-2 py-1"
          placeholder="https://…"
        />
      </Row>
    </>
  );
}

function LineEditor({ el, onChange }: { el: LineElement; onChange: (p: Partial<LineElement>) => void }) {
  return (
    <>
      <Row label={`Ancho ${el.width}%`}>
        <input
          type="range"
          min={5}
          max={100}
          value={el.width}
          onChange={(e) => onChange({ width: Number(e.target.value) })}
          className="w-full"
        />
      </Row>
      <Row label={`Grosor ${el.height}px`}>
        <input
          type="range"
          min={2}
          max={40}
          value={el.height}
          onChange={(e) => onChange({ height: Number(e.target.value) })}
          className="w-full"
        />
      </Row>
      <Row label="Color">
        <input
          type="color"
          value={el.color}
          onChange={(e) => onChange({ color: e.target.value })}
          className="w-full h-8 border border-neutral-200 rounded cursor-pointer"
        />
      </Row>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-medium text-neutral-500 uppercase">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
