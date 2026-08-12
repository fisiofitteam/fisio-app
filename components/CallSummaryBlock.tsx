"use client";

import { useState } from "react";

export type CallSummaryData = {
  summary: string | null;
  keyPoints: string | null; // JSON stringified
  outcome: string | null;   // "won" | "lost" | "rescheduled" | "unclear"
  noTranscript: boolean;
  errorMessage: string | null;
  generatedAt: string;
};

const OUTCOME_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  won:         { label: "Ganada",        color: "#065F46", bg: "#DCFCE7", border: "#86EFAC" },
  lost:        { label: "Perdida",       color: "#7F1D1D", bg: "#FEE2E2", border: "#FCA5A5" },
  rescheduled: { label: "Reagenda",      color: "#78350F", bg: "#FEF3C7", border: "#FCD34D" },
  unclear:     { label: "Sin conclusión",color: "#374151", bg: "#F3F4F6", border: "#D1D5DB" },
};

/**
 * Bloque compacto con el resumen IA de una videollamada. Se renderiza en
 * la card de /fisio/llamadas-venta y en la ficha del paciente.
 * Silencioso (null) si el CallSummary no existe o no tiene contenido útil.
 */
export function CallSummaryBlock({ summary }: { summary: CallSummaryData | null | undefined }) {
  const [expanded, setExpanded] = useState(false);

  if (!summary) return null;
  if (summary.noTranscript) {
    return (
      <div
        className="mt-2 rounded-md px-2.5 py-2 text-xs"
        style={{ background: "#F3F4F6", border: "1px solid #D1D5DB", color: "#6B7280" }}
        onClick={(e) => e.stopPropagation()}
      >
        🎥 Meet no expone transcripción para esta llamada (no se activó o fue demasiado corta).
      </div>
    );
  }
  if (!summary.summary) {
    return summary.errorMessage ? (
      <div
        className="mt-2 rounded-md px-2.5 py-2 text-[11px]"
        style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", color: "#7F1D1D" }}
        onClick={(e) => e.stopPropagation()}
      >
        ⚠ No se pudo generar el resumen: {summary.errorMessage}
      </div>
    ) : null;
  }

  const outcome = summary.outcome && OUTCOME_META[summary.outcome] ? OUTCOME_META[summary.outcome] : null;
  let keyPoints: any = null;
  if (summary.keyPoints) {
    try { keyPoints = JSON.parse(summary.keyPoints); } catch { keyPoints = null; }
  }

  const isLong = summary.summary.length > 240;
  const shown = expanded || !isLong ? summary.summary : summary.summary.slice(0, 240).trimEnd() + "…";

  return (
    <div
      className="mt-2 rounded-md px-2.5 py-2 text-xs"
      style={{ background: "#ECFDF5", border: "1px solid #86EFAC", color: "#065F46" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
        <span className="text-[13px]">🎯</span>
        <span className="font-semibold">Resumen de la llamada</span>
        {outcome && (
          <span
            className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded ml-1"
            style={{ background: outcome.bg, color: outcome.color, border: `1px solid ${outcome.border}` }}
          >
            {outcome.label.toUpperCase()}
          </span>
        )}
      </div>
      <p className="leading-relaxed">{shown}</p>
      {isLong && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="mt-1 text-[10px] font-medium underline opacity-80 hover:opacity-100"
        >
          {expanded ? "Colapsar" : "Ver todo"}
        </button>
      )}
      {expanded && keyPoints && (
        <div className="mt-2 space-y-1.5">
          <KeyList label="Motivaciones" items={keyPoints.motivations} />
          <KeyList label="Objeciones" items={keyPoints.objections} />
          <KeyList label="Contexto" items={keyPoints.context} />
          <KeyList label="Próximos pasos" items={keyPoints.nextSteps} />
        </div>
      )}
    </div>
  );
}

function KeyList({ label, items }: { label: string; items?: unknown }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-75">{label}</p>
      <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
        {items.map((it, i) => (
          <li key={i}>{String(it)}</li>
        ))}
      </ul>
    </div>
  );
}
