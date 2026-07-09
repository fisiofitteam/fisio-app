"use client";

import { useCallback, useRef } from "react";
import {
  CANVAS_H,
  CANVAS_W,
  FONT_STACK,
  type Slide,
  type SlideElement,
  type TextElement,
  type LineElement,
  type LogoElement,
} from "@/lib/story-maker/types";

/**
 * Renderiza UN slide 1080×1920. Todos los elementos se posicionan en %
 * respecto al canvas — así el mismo slide se ve bien a cualquier scale.
 *
 * Cuando `interactive=true` los elementos se pueden seleccionar con click
 * y arrastrar con mouse (guarda x/y de vuelta al padre via onChange).
 */
export function SlideCanvas({
  slide,
  scale = 0.3,
  selectedElementId,
  onSelectElement,
  onUpdateElement,
  interactive = false,
}: {
  slide: Slide;
  scale?: number;
  selectedElementId?: string | null;
  onSelectElement?: (id: string | null) => void;
  onUpdateElement?: (id: string, patch: Partial<SlideElement>) => void;
  interactive?: boolean;
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // Drag: convertimos px mouse a % del canvas.
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    elemStartX: number;
    elemStartY: number;
  } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, el: SlideElement) => {
      if (!interactive) return;
      e.stopPropagation();
      onSelectElement?.(el.id);
      dragRef.current = {
        id: el.id,
        startX: e.clientX,
        startY: e.clientY,
        elemStartX: el.x,
        elemStartY: el.y,
      };
      const move = (ev: MouseEvent) => {
        if (!dragRef.current || !canvasRef.current) return;
        const canvasW = canvasRef.current.offsetWidth;
        const canvasH = canvasRef.current.offsetHeight;
        const dxPct = ((ev.clientX - dragRef.current.startX) / canvasW) * 100;
        const dyPct = ((ev.clientY - dragRef.current.startY) / canvasH) * 100;
        const newX = Math.max(0, Math.min(100, dragRef.current.elemStartX + dxPct));
        const newY = Math.max(0, Math.min(100, dragRef.current.elemStartY + dyPct));
        onUpdateElement?.(dragRef.current.id, { x: newX, y: newY } as any);
      };
      const up = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [interactive, onSelectElement, onUpdateElement],
  );

  return (
    <div
      ref={canvasRef}
      onClick={() => interactive && onSelectElement?.(null)}
      style={{
        width: CANVAS_W * scale,
        height: CANVAS_H * scale,
        position: "relative",
        borderRadius: 12 * scale,
        overflow: "hidden",
        background: slide.bgColor || "#0A0A0A",
        boxShadow: `0 6px 24px -6px rgba(0,0,0,0.4)`,
        cursor: interactive ? "default" : "auto",
      }}
    >
      {/* Fondo con imagen + overlay */}
      {slide.bgImageUrl && (
        <>
          <img
            src={slide.bgImageUrl}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `rgba(10,10,10,${slide.bgOverlayOpacity ?? 0.4})`,
            }}
          />
        </>
      )}

      {/* Elementos */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: CANVAS_W,
          height: CANVAS_H,
        }}
      >
        {slide.elements.map((el) => (
          <ElementRenderer
            key={el.id}
            element={el}
            selected={selectedElementId === el.id}
            interactive={interactive}
            onMouseDown={(e) => handleMouseDown(e, el)}
          />
        ))}
      </div>
    </div>
  );
}

function ElementRenderer({
  element,
  selected,
  interactive,
  onMouseDown,
}: {
  element: SlideElement;
  selected: boolean;
  interactive: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const outlineStyle: React.CSSProperties = selected
    ? {
        outline: "3px solid #3B82F6",
        outlineOffset: 4,
        borderRadius: 4,
      }
    : {};

  const baseWrapper: React.CSSProperties = {
    position: "absolute",
    left: `${element.x}%`,
    top: `${element.y}%`,
    transform: "translate(-50%, -50%)",
    cursor: interactive ? "move" : "default",
    userSelect: "none",
    ...outlineStyle,
  };

  if (element.type === "text") return <TextRender el={element} wrap={baseWrapper} onMouseDown={onMouseDown} />;
  if (element.type === "logo") return <LogoRender el={element} wrap={baseWrapper} onMouseDown={onMouseDown} />;
  if (element.type === "line") return <LineRender el={element} wrap={baseWrapper} onMouseDown={onMouseDown} />;
  return null;
}

function TextRender({ el, wrap, onMouseDown }: { el: TextElement; wrap: React.CSSProperties; onMouseDown: (e: React.MouseEvent) => void }) {
  const content = el.uppercase ? el.content.toUpperCase() : el.content;
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        ...wrap,
        width: `${el.width}%`,
      }}
    >
      <div
        style={{
          fontFamily: FONT_STACK[el.font],
          fontSize: el.size,
          fontWeight: el.weight,
          fontStyle: el.italic ? "italic" : "normal",
          color: el.color,
          background: el.bgColor && el.bgColor !== "transparent" ? el.bgColor : "transparent",
          padding: el.bgColor && el.bgColor !== "transparent" ? "12px 24px" : 0,
          borderRadius: el.bgColor && el.bgColor !== "transparent" ? 12 : 0,
          textAlign: el.align,
          lineHeight: 1.05,
          letterSpacing: el.letterSpacing ? `${el.letterSpacing}em` : undefined,
          textShadow: el.shadow ? "0 6px 24px rgba(0,0,0,0.6)" : undefined,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {content}
      </div>
    </div>
  );
}

function LogoRender({ el, wrap, onMouseDown }: { el: LogoElement; wrap: React.CSSProperties; onMouseDown: (e: React.MouseEvent) => void }) {
  if (!el.url) {
    return (
      <div
        onMouseDown={onMouseDown}
        style={{
          ...wrap,
          width: el.size,
          height: el.size,
          border: "3px dashed #666",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#999",
          fontSize: 24,
        }}
      >
        LOGO
      </div>
    );
  }
  return (
    <img
      src={el.url}
      alt="logo"
      onMouseDown={onMouseDown}
      style={{
        ...wrap,
        width: el.size,
        height: "auto",
      }}
    />
  );
}

function LineRender({ el, wrap, onMouseDown }: { el: LineElement; wrap: React.CSSProperties; onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        ...wrap,
        width: `${el.width}%`,
        height: el.height,
        background: el.color,
        borderRadius: el.height / 2,
      }}
    />
  );
}
