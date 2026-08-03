"use client";

import type {
  ChipElement,
  FontKey,
  ImageElement,
  LineElement,
  SlideDoc,
  SlideElement,
  TextElement,
} from "@/lib/carousel-maker/canvas";
import { FONT_STACK, PALETTE } from "@/lib/carousel-maker/canvas";

/**
 * Panel derecho del editor visual: si hay un elemento seleccionado, muestra
 * sus propiedades editables (posición, tamaño, estilo). Si no, muestra
 * ajustes globales del slide (fondo, toggles de header/numeración/grano).
 */
type Props = {
  selected: SlideElement | null;
  slide: SlideDoc;
  onChangeElement: (patch: Partial<SlideElement>) => void;
  onChangeSlide: (patch: Partial<SlideDoc>) => void;
  onDeleteElement: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
};

export function PropertyPanel(props: Props) {
  const { selected, slide, onChangeSlide } = props;
  if (!selected) return <SlidePanel slide={slide} onChange={onChangeSlide} />;
  if (selected.type === "text") return <TextPanel {...props} el={selected} />;
  if (selected.type === "line") return <LinePanel {...props} el={selected} />;
  if (selected.type === "chip") return <ChipPanel {...props} el={selected} />;
  if (selected.type === "image") return <ImagePanel {...props} el={selected} />;
  return null;
}

// ─── Slide panel ────────────────────────────────────────────────────────

function SlidePanel({ slide, onChange }: { slide: SlideDoc; onChange: (patch: Partial<SlideDoc>) => void }) {
  return (
    <div className="space-y-4">
      <SectionLabel>Ajustes del slide</SectionLabel>
      <Row label="Color de fondo">
        <ColorInput value={slide.bgColor} onChange={(v) => onChange({ bgColor: v })} />
      </Row>
      <Row label="Foto de fondo (URL)">
        <input
          className="input text-xs"
          value={slide.bgImageUrl ?? ""}
          onChange={(e) => onChange({ bgImageUrl: e.target.value || undefined })}
          placeholder="https://…"
        />
      </Row>
      {slide.bgImageUrl && (
        <>
          <Row label="Overlay">
            <ColorInput value={slide.bgOverlayColor ?? "#000000"} onChange={(v) => onChange({ bgOverlayColor: v })} />
          </Row>
          <Row label={`Opacidad overlay (${Math.round((slide.bgOverlayOpacity ?? 0.4) * 100)}%)`}>
            <input
              type="range"
              min={0} max={100}
              value={Math.round((slide.bgOverlayOpacity ?? 0.4) * 100)}
              onChange={(e) => onChange({ bgOverlayOpacity: Number(e.target.value) / 100 })}
              className="w-full"
            />
          </Row>
        </>
      )}
      <div className="border-t border-neutral-200 pt-3 space-y-2">
        <Toggle label="Header FISIOF/T CROSS" checked={slide.showHeader !== false} onChange={(v) => onChange({ showHeader: v })} />
        <Toggle label="Numeración 1/N" checked={slide.showNumber !== false} onChange={(v) => onChange({ showNumber: v })} />
        <Toggle label="Textura de grano" checked={slide.showGrain !== false} onChange={(v) => onChange({ showGrain: v })} />
      </div>
    </div>
  );
}

// ─── Common controls por elemento ──────────────────────────────────────

function ElementCommonHeader({ label, onDelete, onBringForward, onSendBackward }: { label: string; onDelete: () => void; onBringForward: () => void; onSendBackward: () => void }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <SectionLabel>{label}</SectionLabel>
      <div className="flex gap-1">
        <button onClick={onSendBackward} className="text-xs text-neutral-500 hover:text-neutral-900" title="Enviar atrás">⬇</button>
        <button onClick={onBringForward} className="text-xs text-neutral-500 hover:text-neutral-900" title="Traer al frente">⬆</button>
        <button onClick={onDelete} className="text-xs text-red-600" title="Eliminar (Supr)">✕</button>
      </div>
    </div>
  );
}

function PositionSizeControls({ el, onChange }: { el: SlideElement; onChange: (patch: Partial<SlideElement>) => void }) {
  return (
    <>
      <Row label="Posición X %">
        <NumberInput value={el.x} min={0} max={100} step={0.5} onChange={(v) => onChange({ x: v })} />
      </Row>
      <Row label="Posición Y %">
        <NumberInput value={el.y} min={0} max={100} step={0.5} onChange={(v) => onChange({ y: v })} />
      </Row>
      {"width" in el && typeof el.width === "number" && (
        <Row label="Ancho %">
          <NumberInput value={el.width} min={1} max={100} step={0.5} onChange={(v) => onChange({ width: v } as any)} />
        </Row>
      )}
    </>
  );
}

// ─── Text panel ─────────────────────────────────────────────────────────

function TextPanel({ el, onChangeElement, onDeleteElement, onBringForward, onSendBackward }: Props & { el: TextElement }) {
  const setEl = (patch: Partial<TextElement>) => onChangeElement(patch as Partial<SlideElement>);

  return (
    <div className="space-y-3">
      <ElementCommonHeader
        label="Texto"
        onDelete={onDeleteElement}
        onBringForward={onBringForward}
        onSendBackward={onSendBackward}
      />
      <div>
        <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium block mb-1">Contenido</label>
        <textarea
          className="input text-sm"
          rows={3}
          value={el.content}
          onChange={(e) => setEl({ content: e.target.value })}
        />
      </div>
      <Row label="Palabras en amarillo">
        <input
          type="text"
          className="input text-xs"
          value={(el.yellowWords ?? []).join(" ")}
          onChange={(e) => setEl({ yellowWords: e.target.value.split(/\s+/).map((w) => w.trim()).filter(Boolean) })}
          placeholder="MÁS HOMBRO"
        />
      </Row>
      <div className="border-t border-neutral-200 pt-3 space-y-2">
        <Row label="Fuente">
          <select className="input text-xs" value={el.font} onChange={(e) => setEl({ font: e.target.value as FontKey })}>
            {(Object.keys(FONT_STACK) as FontKey[]).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Row>
        <Row label={`Tamaño (${el.size}px)`}>
          <input type="range" min={20} max={260} value={el.size} onChange={(e) => setEl({ size: Number(e.target.value) })} className="w-full" />
        </Row>
        <Row label={`Peso (${el.weight})`}>
          <select className="input text-xs" value={el.weight} onChange={(e) => setEl({ weight: Number(e.target.value) as 400 | 500 | 600 | 700 | 800 | 900 })}>
            {[400, 500, 600, 700, 800, 900].map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </Row>
        <Row label="Color">
          <ColorInput value={el.color} onChange={(v) => setEl({ color: v })} />
        </Row>
        <Row label="Alineación">
          <div className="flex gap-1">
            {(["left", "center", "right"] as const).map((a) => (
              <button
                key={a}
                onClick={() => setEl({ align: a })}
                className={`text-xs px-2 py-1 rounded border ${el.align === a ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200"}`}
              >
                {a === "left" ? "⬅" : a === "right" ? "➡" : "↔"}
              </button>
            ))}
          </div>
        </Row>
        <Row label={`Interlineado (${el.lineHeight ?? 1.1})`}>
          <input type="range" min={0.9} max={1.6} step={0.05} value={el.lineHeight ?? 1.1} onChange={(e) => setEl({ lineHeight: Number(e.target.value) })} className="w-full" />
        </Row>
        <Row label={`Letter spacing (${el.letterSpacing ?? 0}em)`}>
          <input type="range" min={-0.05} max={0.2} step={0.005} value={el.letterSpacing ?? 0} onChange={(e) => setEl({ letterSpacing: Number(e.target.value) })} className="w-full" />
        </Row>
        <div className="grid grid-cols-2 gap-2">
          <Toggle label="Mayúsculas" checked={!!el.uppercase} onChange={(v) => setEl({ uppercase: v })} />
          <Toggle label="Cursiva" checked={!!el.italic} onChange={(v) => setEl({ italic: v })} />
          <Toggle label="Sombra" checked={!!el.shadow} onChange={(v) => setEl({ shadow: v })} />
        </div>
      </div>
      <div className="border-t border-neutral-200 pt-3 space-y-2">
        <PositionSizeControls el={el} onChange={onChangeElement} />
      </div>
    </div>
  );
}

// ─── Line panel ─────────────────────────────────────────────────────────

function LinePanel({ el, onChangeElement, onDeleteElement, onBringForward, onSendBackward }: Props & { el: LineElement }) {
  const setEl = (patch: Partial<LineElement>) => onChangeElement(patch as Partial<SlideElement>);
  return (
    <div className="space-y-3">
      <ElementCommonHeader label="Línea" onDelete={onDeleteElement} onBringForward={onBringForward} onSendBackward={onSendBackward} />
      <Row label="Color"><ColorInput value={el.color} onChange={(v) => setEl({ color: v })} /></Row>
      <Row label={`Grosor (${el.height}px)`}>
        <input type="range" min={1} max={30} value={el.height} onChange={(e) => setEl({ height: Number(e.target.value) })} className="w-full" />
      </Row>
      <div className="border-t border-neutral-200 pt-3 space-y-2">
        <PositionSizeControls el={el} onChange={onChangeElement} />
      </div>
    </div>
  );
}

// ─── Chip panel ─────────────────────────────────────────────────────────

function ChipPanel({ el, onChangeElement, onDeleteElement, onBringForward, onSendBackward }: Props & { el: ChipElement }) {
  const setEl = (patch: Partial<ChipElement>) => onChangeElement(patch as Partial<SlideElement>);
  return (
    <div className="space-y-3">
      <ElementCommonHeader label="Chip" onDelete={onDeleteElement} onBringForward={onBringForward} onSendBackward={onSendBackward} />
      <Row label="Icono (emoji o letra)"><input className="input text-sm w-16" value={el.icon} onChange={(e) => setEl({ icon: e.target.value.slice(0, 3) })} /></Row>
      <Row label="Etiqueta"><input className="input text-sm" value={el.label} onChange={(e) => setEl({ label: e.target.value })} /></Row>
      <Row label={`Tamaño texto (${el.fontSize}px)`}>
        <input type="range" min={16} max={60} value={el.fontSize} onChange={(e) => setEl({ fontSize: Number(e.target.value) })} className="w-full" />
      </Row>
      <div className="border-t border-neutral-200 pt-3 space-y-2">
        <Row label="Color borde"><ColorInput value={el.borderColor} onChange={(v) => setEl({ borderColor: v })} /></Row>
        <Row label="Color fondo"><ColorInput value={el.fill} onChange={(v) => setEl({ fill: v })} /></Row>
        <Row label="Color texto"><ColorInput value={el.labelColor} onChange={(v) => setEl({ labelColor: v })} /></Row>
        <Row label="Fondo icono"><ColorInput value={el.iconBg} onChange={(v) => setEl({ iconBg: v })} /></Row>
        <Row label="Color icono"><ColorInput value={el.iconColor} onChange={(v) => setEl({ iconColor: v })} /></Row>
      </div>
      <div className="border-t border-neutral-200 pt-3 space-y-2">
        <PositionSizeControls el={el} onChange={onChangeElement} />
      </div>
    </div>
  );
}

// ─── Image panel ────────────────────────────────────────────────────────

function ImagePanel({ el, onChangeElement, onDeleteElement, onBringForward, onSendBackward }: Props & { el: ImageElement }) {
  const setEl = (patch: Partial<ImageElement>) => onChangeElement(patch as Partial<SlideElement>);
  return (
    <div className="space-y-3">
      <ElementCommonHeader label="Imagen" onDelete={onDeleteElement} onBringForward={onBringForward} onSendBackward={onSendBackward} />
      <Row label="URL">
        <input className="input text-xs" value={el.url} onChange={(e) => setEl({ url: e.target.value })} placeholder="https://…" />
      </Row>
      <Row label="Alto %">
        <NumberInput value={el.height} min={5} max={100} step={0.5} onChange={(v) => setEl({ height: v })} />
      </Row>
      <Row label={`Radio esquinas (${el.borderRadius ?? 0}px)`}>
        <input type="range" min={0} max={100} value={el.borderRadius ?? 0} onChange={(e) => setEl({ borderRadius: Number(e.target.value) })} className="w-full" />
      </Row>
      <Row label={`Opacidad (${Math.round((el.opacity ?? 1) * 100)}%)`}>
        <input type="range" min={0} max={100} value={Math.round((el.opacity ?? 1) * 100)} onChange={(e) => setEl({ opacity: Number(e.target.value) / 100 })} className="w-full" />
      </Row>
      <Row label="Ajuste">
        <select className="input text-xs" value={el.objectFit ?? "cover"} onChange={(e) => setEl({ objectFit: e.target.value as "cover" | "contain" })}>
          <option value="cover">Cover (recorta)</option>
          <option value="contain">Contain (encaja)</option>
        </select>
      </Row>
      <div className="border-t border-neutral-200 pt-3 space-y-2">
        <PositionSizeControls el={el} onChange={onChangeElement} />
      </div>
    </div>
  );
}

// ─── UI primitives ──────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">{children}</div>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium block mb-1">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-xs">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded" />
      <span>{label}</span>
    </label>
  );
}

function NumberInput({ value, min, max, step, onChange }: { value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      className="input text-xs"
      value={value}
      min={min} max={max} step={step}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const preset: string[] = [PALETTE.chalkWhite, PALETTE.white, PALETTE.yellow, PALETTE.yellowDeep, PALETTE.bg, PALETTE.muted, "#EF4444", "#10B981", "#3B82F6"];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-10 h-8 rounded border border-neutral-200 cursor-pointer" />
      <input type="text" className="input text-xs flex-1 min-w-0" value={value} onChange={(e) => onChange(e.target.value)} />
      <div className="w-full flex gap-1 mt-1">
        {preset.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            title={p}
            className="w-5 h-5 rounded-full border border-neutral-300 hover:scale-110 transition"
            style={{ background: p }}
          />
        ))}
      </div>
    </div>
  );
}
