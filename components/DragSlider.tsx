"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Slider táctil con thumb grande y drag continuo — sustituye al
 * <input type="range"> nativo en los campos de métricas de la app del
 * paciente. Motivo: los atletas nos decían que era contra-intuitivo que
 * "funcionara con click"; el thumb del range nativo es diminuto y la
 * pista responde a tap-to-jump, así que si ponen el dedo sin deslizar
 * ya modifica el valor.
 *
 * Este componente:
 *  - Pinta la pista + fill hasta el thumb.
 *  - Thumb GRANDE (28px) con borde blanco y sombra — se ve claramente
 *    que "esto se arrastra".
 *  - Snap a step (por defecto 1).
 *  - Escucha pointerdown en la pista/thumb y arrastra en real-time
 *    con pointermove hasta pointerup. Cubre touch, mouse y pen con
 *    el mismo código.
 *  - Preserva accesibilidad con role="slider" y aria-* + soporte
 *    teclado (flechas izquierda/derecha).
 */
export function DragSlider({
  value,
  onChange,
  min = 0,
  max = 10,
  step = 1,
  accentColor,
  disabled = false,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Color del fill y del thumb. Si no se pasa, usa var(--p-accent). */
  accentColor?: string;
  disabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const activePointer = useRef<number | null>(null);

  const range = max - min;
  const clamped = Math.min(max, Math.max(min, value));
  const pctFill = range > 0 ? ((clamped - min) / range) * 100 : 0;
  const color = accentColor ?? "var(--p-accent)";

  const valueFromClientX = useCallback(
    (clientX: number): number => {
      const el = trackRef.current;
      if (!el) return value;
      const rect = el.getBoundingClientRect();
      const raw = ((clientX - rect.left) / rect.width) * range + min;
      const snapped = Math.round(raw / step) * step;
      return Math.min(max, Math.max(min, snapped));
    },
    [min, max, range, step, value]
  );

  function onPointerDown(e: React.PointerEvent) {
    if (disabled) return;
    e.preventDefault();
    activePointer.current = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
    const v = valueFromClientX(e.clientX);
    if (v !== value) onChange(v);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || disabled) return;
    if (activePointer.current !== e.pointerId) return;
    const v = valueFromClientX(e.clientX);
    if (v !== value) onChange(v);
  }

  function onPointerEnd(e: React.PointerEvent) {
    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;
    setDragging(false);
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(Math.max(min, value - step));
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(Math.min(max, value + step));
    }
  }

  // El thumb visualmente ocupa ~28px de ancho. Compensamos su margen para
  // que su centro se alinee con el pctFill exacto en los extremos.
  const THUMB = 28;
  const thumbStyle: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    left: `${pctFill}%`,
    transform: "translate(-50%, -50%)",
    width: THUMB,
    height: THUMB,
    borderRadius: "50%",
    background: color,
    border: "3px solid #FFFFFF",
    boxShadow: dragging
      ? "0 4px 12px rgba(0,0,0,0.35), 0 0 0 8px rgba(255,255,255,0.08)"
      : "0 2px 6px rgba(0,0,0,0.30)",
    transition: dragging ? "box-shadow 0.15s ease" : "box-shadow 0.15s ease, left 0.05s linear",
    pointerEvents: "none",
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
      className="relative w-full select-none outline-none"
      style={{
        height: 36,
        touchAction: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {/* Pista de fondo */}
      <div
        className="absolute left-0 right-0 top-1/2 rounded-full"
        style={{
          height: 8,
          transform: "translateY(-50%)",
          background: "rgba(127,127,127,0.28)",
        }}
      />
      {/* Fill hasta el thumb */}
      <div
        className="absolute left-0 top-1/2 rounded-full"
        style={{
          height: 8,
          transform: "translateY(-50%)",
          width: `${pctFill}%`,
          background: color,
        }}
      />
      {/* Thumb */}
      <div style={thumbStyle} />
    </div>
  );
}
