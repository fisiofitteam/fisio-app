"use client";

import { forwardRef, useEffect, useMemo, useRef } from "react";
import {
  CANVAS_H,
  CANVAS_W,
  FONT_STACK,
  PALETTE,
  tokenizeYellow,
  type ChipElement,
  type ImageElement,
  type LineElement,
  type SlideDoc,
  type SlideElement,
  type TextElement,
} from "@/lib/carousel-maker/canvas";

/**
 * Renderiza UN slide del carrusel en tamaño 1080×1350. Los elementos se
 * dibujan según su posición en % del canvas y su estilo. El editor añade
 * handles de selección/drag encima; este componente solo pinta.
 */
type Props = {
  doc: SlideDoc;
  slideIndex: number;
  totalSlides: number;
  displayScale?: number;
  selectedElementId?: string | null;
  editingElementId?: string | null;
  onSelectElement?: (id: string | null) => void;
  onStartDrag?: (id: string, e: React.PointerEvent<HTMLDivElement>) => void;
  onStartEditing?: (id: string) => void;
  onFinishEditing?: (id: string, content: string) => void;
};

export const SlideCanvas = forwardRef<HTMLDivElement, Props>(function SlideCanvas(
  { doc, slideIndex, totalSlides, displayScale = 1, selectedElementId, editingElementId, onSelectElement, onStartDrag, onStartEditing, onFinishEditing },
  ref,
) {
  return (
    <div
      ref={ref}
      style={{
        width: CANVAS_W,
        height: CANVAS_H,
        transform: displayScale !== 1 ? `scale(${displayScale})` : undefined,
        transformOrigin: "top left",
      }}
    >
      <SlideInner
        doc={doc}
        slideIndex={slideIndex}
        totalSlides={totalSlides}
        selectedElementId={selectedElementId ?? null}
        editingElementId={editingElementId ?? null}
        onSelectElement={onSelectElement}
        onStartDrag={onStartDrag}
        onStartEditing={onStartEditing}
        onFinishEditing={onFinishEditing}
      />
    </div>
  );
});

function SlideInner({
  doc,
  slideIndex,
  totalSlides,
  selectedElementId,
  editingElementId,
  onSelectElement,
  onStartDrag,
  onStartEditing,
  onFinishEditing,
}: Omit<Props, "displayScale"> & { selectedElementId: string | null; editingElementId: string | null }) {
  return (
    <div
      onPointerDown={(e) => {
        // Click en el fondo → deselecciona.
        if (e.target === e.currentTarget && onSelectElement) onSelectElement(null);
      }}
      style={{
        width: CANVAS_W,
        height: CANVAS_H,
        background: doc.bgColor,
        color: PALETTE.chalkWhite,
        fontFamily: FONT_STACK.Geist,
        position: "relative",
        overflow: "hidden",
        cursor: onSelectElement ? "default" : undefined,
      }}
    >
      {doc.bgImageUrl && (
        <img
          src={doc.bgImageUrl}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
      {doc.bgOverlayColor && (
        <div style={{ position: "absolute", inset: 0, background: doc.bgOverlayColor, opacity: doc.bgOverlayOpacity ?? 0.4, pointerEvents: "none" }} />
      )}
      {doc.showGrain !== false && <GrainOverlay />}
      {doc.showHeader !== false && <BrandHeader />}
      {doc.showNumber !== false && <SlideNumber index={slideIndex} total={totalSlides} />}

      {doc.elements.map((el) => (
        <ElementView
          key={el.id}
          el={el}
          selected={selectedElementId === el.id}
          editing={editingElementId === el.id}
          selectable={!!onSelectElement}
          onSelect={() => onSelectElement?.(el.id)}
          onStartDrag={onStartDrag}
          onStartEditing={onStartEditing}
          onFinishEditing={onFinishEditing}
        />
      ))}
    </div>
  );
}

// ─── Renderizador por tipo de elemento ────────────────────────────────

function ElementView({
  el,
  selected,
  editing,
  selectable,
  onSelect,
  onStartDrag,
  onStartEditing,
  onFinishEditing,
}: {
  el: SlideElement;
  selected: boolean;
  editing: boolean;
  selectable: boolean;
  onSelect: () => void;
  onStartDrag?: (id: string, e: React.PointerEvent<HTMLDivElement>) => void;
  onStartEditing?: (id: string) => void;
  onFinishEditing?: (id: string, content: string) => void;
}) {
  // Contenedor común: posición en % del canvas, transform para centrar en (x, y).
  const boxStyle: React.CSSProperties = {
    position: "absolute",
    left: `${el.x}%`,
    top: `${el.y}%`,
    transform: "translate(-50%, -50%)",
    outline: editing
      ? `2px dashed ${PALETTE.yellow}`
      : selected
        ? `2px solid ${PALETTE.yellow}`
        : selectable ? "2px solid transparent" : undefined,
    outlineOffset: 4,
    cursor: editing ? "text" : selectable ? "grab" : undefined,
    userSelect: editing ? "text" : "none",
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!selectable) return;
    if (editing) return; // en modo edición no arrastramos; dejamos que llegue al text nativo.
    e.stopPropagation();
    onSelect();
    onStartDrag?.(el.id, e);
  };

  if (el.type === "text") return (
    <TextView
      el={el}
      boxStyle={boxStyle}
      editing={editing}
      onPointerDown={handlePointerDown}
      onDoubleClick={() => onStartEditing?.(el.id)}
      onFinishEditing={(v) => onFinishEditing?.(el.id, v)}
    />
  );
  if (el.type === "line") return <LineView el={el} boxStyle={boxStyle} onPointerDown={handlePointerDown} />;
  if (el.type === "chip") return <ChipView el={el} boxStyle={boxStyle} onPointerDown={handlePointerDown} />;
  if (el.type === "image") return <ImageView el={el} boxStyle={boxStyle} onPointerDown={handlePointerDown} />;
  return null;
}

function TextView({
  el,
  boxStyle,
  editing,
  onPointerDown,
  onDoubleClick,
  onFinishEditing,
}: {
  el: TextElement;
  boxStyle: React.CSSProperties;
  editing: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDoubleClick: () => void;
  onFinishEditing: (v: string) => void;
}) {
  const tokens = useMemo(
    () => tokenizeYellow(el.content, el.yellowWords ?? []),
    [el.content, el.yellowWords],
  );
  const anchor = el.anchor ?? "center";
  const transform =
    anchor === "top" ? "translate(-50%, 0)"
    : anchor === "bottom" ? "translate(-50%, -100%)"
    : "translate(-50%, -50%)";

  const commonTextStyle: React.CSSProperties = {
    fontFamily: FONT_STACK[el.font],
    fontSize: el.size,
    fontWeight: el.weight,
    color: el.color,
    textAlign: el.align,
    lineHeight: el.lineHeight ?? 1.1,
    letterSpacing: el.letterSpacing !== undefined ? `${el.letterSpacing}em` : undefined,
    textTransform: el.uppercase ? "uppercase" : undefined,
    fontStyle: el.italic ? "italic" : undefined,
    textShadow: el.shadow ? "0 3px 0 rgba(0,0,0,.55)" : undefined,
    wordBreak: "break-word",
    whiteSpace: "pre-wrap",
  };

  // Al entrar en modo edición, autoenfocamos y ponemos el cursor al final.
  const editableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editing) return;
    const node = editableRef.current;
    if (!node) return;
    node.focus();
    // Cursor al final del contenido.
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editing]);

  return (
    <div
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      style={{
        ...boxStyle,
        transform,
        width: `${el.width}%`,
      }}
    >
      {editing ? (
        <div
          ref={editableRef}
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => onFinishEditing(e.currentTarget.innerText ?? "")}
          onKeyDown={(e) => {
            if (e.key === "Escape") { (e.currentTarget as HTMLElement).blur(); }
            // Enter respetamos el salto (multi-línea es útil en carruseles).
            // Ctrl/Cmd+Enter cierra edición.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              (e.currentTarget as HTMLElement).blur();
            }
          }}
          style={{ ...commonTextStyle, outline: "none", minWidth: 40 }}
        >
          {/* En modo edición mostramos el contenido plano, sin tokenizar amarillos —
              se recolorean al terminar. Esto simplifica el DOM editable. */}
          {el.content}
        </div>
      ) : (
        <div style={commonTextStyle}>
          {tokens.map((t, i) =>
            t.break ? <br key={i} /> : (
              <span key={i} style={{ color: t.yellow ? PALETTE.yellow : undefined }}>{t.text}</span>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function LineView({ el, boxStyle, onPointerDown }: { el: LineElement; boxStyle: React.CSSProperties; onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void }) {
  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        ...boxStyle,
        width: `${el.width}%`,
        height: el.height,
        background: el.color,
      }}
    />
  );
}

function ChipView({ el, boxStyle, onPointerDown }: { el: ChipElement; boxStyle: React.CSSProperties; onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void }) {
  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        ...boxStyle,
        width: `${el.width}%`,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "18px 26px",
        border: `2.5px solid ${el.borderColor}`,
        borderRadius: 20,
        background: el.fill,
      }}
    >
      <div style={{
        width: 54, height: 54, borderRadius: 27,
        background: el.iconBg,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 28, color: el.iconColor, fontWeight: 800, flexShrink: 0,
      }}>
        {el.icon}
      </div>
      <span style={{ fontSize: el.fontSize, color: el.labelColor, fontWeight: 500, fontFamily: FONT_STACK.Geist }}>
        {el.label}
      </span>
    </div>
  );
}

function ImageView({ el, boxStyle, onPointerDown }: { el: ImageElement; boxStyle: React.CSSProperties; onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void }) {
  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        ...boxStyle,
        width: `${el.width}%`,
        height: `${el.height}%`,
        borderRadius: el.borderRadius ?? 0,
        overflow: "hidden",
        opacity: el.opacity ?? 1,
        background: "rgba(255,255,255,.03)",
      }}
    >
      <img
        src={el.url}
        alt=""
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: el.objectFit ?? "cover", display: "block" }}
      />
    </div>
  );
}

// ─── Adornos base del slide (header, número, grano) ────────────────────

function GrainOverlay() {
  const noise = `data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#n)" opacity="0.35"/></svg>',
  )}`;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute", inset: 0,
        backgroundImage: `url("${noise}")`,
        opacity: 0.08,
        pointerEvents: "none",
        mixBlendMode: "screen",
      }}
    />
  );
}

function BrandHeader() {
  return (
    <div style={{
      position: "absolute",
      top: 60,
      left: 0,
      right: 0,
      textAlign: "center",
      fontFamily: FONT_STACK.Anton,
      fontSize: 46,
      letterSpacing: 4,
      color: PALETTE.chalkWhite,
      pointerEvents: "none",
    }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span>FISIOF</span>
        <span style={{ color: PALETTE.yellow, fontSize: 52 }}>⚡</span>
        <span>T CROSS</span>
      </span>
    </div>
  );
}

function SlideNumber({ index, total }: { index: number; total: number }) {
  return (
    <div style={{
      position: "absolute",
      top: 60,
      right: 60,
      fontFamily: FONT_STACK.Geist,
      fontSize: 22,
      color: PALETTE.chalkWhite,
      opacity: 0.6,
      letterSpacing: 1,
      pointerEvents: "none",
    }}>
      {index + 1}/{total}
    </div>
  );
}
