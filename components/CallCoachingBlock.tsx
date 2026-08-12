"use client";

import { useState } from "react";

export type CallCoachingData = {
  coachingSummary: string | null;
  coachingKeyPoints: string | null; // JSON { strengths, weaknesses, improvements }
};

/**
 * Bloque de coaching del closer: qué hizo bien, qué falló, qué mejorar.
 * Se muestra en /fisio/llamadas-venta debajo del análisis comercial cuando
 * el outcome es won o lost. Color violeta para diferenciarlo del bloque
 * comercial (verde/rojo/azul según outcome).
 *
 * Silencioso si no hay coaching (ej. llamadas rescheduled/unclear).
 */
export function CallCoachingBlock({ data }: { data: CallCoachingData | null | undefined }) {
  const [expanded, setExpanded] = useState(false);

  if (!data || !data.coachingSummary) return null;

  let kp: any = null;
  if (data.coachingKeyPoints) {
    try { kp = JSON.parse(data.coachingKeyPoints); } catch { kp = null; }
  }

  const isLong = data.coachingSummary.length > 240;
  const shown = expanded || !isLong ? data.coachingSummary : data.coachingSummary.slice(0, 240).trimEnd() + "…";

  return (
    <div
      className="mt-2 rounded-md px-2.5 py-2 text-xs"
      style={{ background: "#F5F3FF", border: "1px solid #C4B5FD", color: "#4C1D95" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
        <span className="text-[13px]">🎓</span>
        <span className="font-semibold">Coaching del closer</span>
      </div>
      <p className="leading-relaxed">{shown}</p>
      {(isLong || kp) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="mt-1 text-[10px] font-medium underline opacity-80 hover:opacity-100"
        >
          {expanded ? "Colapsar" : "Ver detalle"}
        </button>
      )}
      {expanded && kp && (
        <div className="mt-2 space-y-1.5">
          <KeyList label="✅ Fortalezas" items={kp.strengths} tone="ok" />
          <KeyList label="⚠️ A mejorar" items={kp.weaknesses} tone="warn" />
          <KeyList label="💡 Propuestas para próximas llamadas" items={kp.improvements} tone="idea" />
        </div>
      )}
    </div>
  );
}

function KeyList({ label, items, tone }: { label: string; items?: unknown; tone: "ok" | "warn" | "idea" }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const color = tone === "ok" ? "#065F46" : tone === "warn" ? "#7F1D1D" : "#4C1D95";
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>
        {label}
      </p>
      <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
        {items.map((it, i) => (
          <li key={i}>{String(it)}</li>
        ))}
      </ul>
    </div>
  );
}
