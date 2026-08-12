"use client";

import { useState } from "react";

export type CallSummaryData = {
  salesSummary: string | null;
  salesKeyPoints: string | null; // JSON { motivations, objections, nextSteps }
  outcome: string | null;        // "won" | "lost" | "rescheduled" | "unclear"
  noTranscript: boolean;
  errorMessage: string | null;
  generatedAt: string;
};

// Metadatos del outcome: color del badge Y del bloque entero.
// - won  → verde   (ganada)
// - lost → rojo    (perdida)
// - followup → azul (seguimiento activo)
// - rescheduled → ámbar (reagendada)
// - unclear → gris
const OUTCOME_META: Record<string, {
  label: string;
  badgeColor: string; badgeBg: string; badgeBorder: string;
  boxColor: string;   boxBg: string;   boxBorder: string;
}> = {
  won: {
    label: "Ganada",
    badgeColor: "#065F46", badgeBg: "#DCFCE7", badgeBorder: "#86EFAC",
    boxColor:   "#065F46", boxBg:   "#ECFDF5", boxBorder:   "#86EFAC",
  },
  lost: {
    label: "Perdida",
    badgeColor: "#7F1D1D", badgeBg: "#FEE2E2", badgeBorder: "#FCA5A5",
    boxColor:   "#7F1D1D", boxBg:   "#FEF2F2", boxBorder:   "#FCA5A5",
  },
  rescheduled: {
    label: "Reagenda",
    badgeColor: "#78350F", badgeBg: "#FEF3C7", badgeBorder: "#FCD34D",
    boxColor:   "#78350F", boxBg:   "#FFFBEB", boxBorder:   "#FCD34D",
  },
  unclear: {
    label: "Sin conclusión",
    badgeColor: "#374151", badgeBg: "#F3F4F6", badgeBorder: "#D1D5DB",
    boxColor:   "#374151", boxBg:   "#F9FAFB", boxBorder:   "#D1D5DB",
  },
  followup: {
    label: "Seguimiento",
    badgeColor: "#1E3A8A", badgeBg: "#DBEAFE", badgeBorder: "#93C5FD",
    boxColor:   "#1E3A8A", boxBg:   "#EFF6FF", boxBorder:   "#93C5FD",
  },
};

// Fallback (sin outcome reconocido): neutro gris, no forzamos verde para no
// mentir sobre el resultado.
const BOX_FALLBACK = { boxColor: "#374151", boxBg: "#F9FAFB", boxBorder: "#D1D5DB" };

/**
 * Bloque con el resumen COMERCIAL de una videollamada. Se renderiza en la
 * card de /fisio/llamadas-venta. El resumen clínico (patología, síntomas,
 * historial) sale en otro bloque distinto sobre las notas de anamnesis.
 */
export function CallSummaryBlock({
  summary,
  outcomeOverride,
}: {
  summary: CallSummaryData | null | undefined;
  /** Fuerza un badge distinto al outcome real. Útil en vistas donde el
   *  contexto ya es específico (ej. Follow-up → "Seguimiento"). */
  outcomeOverride?: string;
}) {
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
  if (!summary.salesSummary) {
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

  const outcomeKey = outcomeOverride ?? summary.outcome ?? "";
  const outcome = outcomeKey && OUTCOME_META[outcomeKey] ? OUTCOME_META[outcomeKey] : null;
  const box = outcome
    ? { boxColor: outcome.boxColor, boxBg: outcome.boxBg, boxBorder: outcome.boxBorder }
    : BOX_FALLBACK;
  let keyPoints: any = null;
  if (summary.salesKeyPoints) {
    try { keyPoints = JSON.parse(summary.salesKeyPoints); } catch { keyPoints = null; }
  }

  const isLong = summary.salesSummary.length > 240;
  const shown = expanded || !isLong ? summary.salesSummary : summary.salesSummary.slice(0, 240).trimEnd() + "…";

  return (
    <div
      className="mt-2 rounded-md px-2.5 py-2 text-xs"
      style={{ background: box.boxBg, border: `1px solid ${box.boxBorder}`, color: box.boxColor }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
        <span className="text-[13px]">🎯</span>
        <span className="font-semibold">Análisis comercial de la venta</span>
        {outcome && (
          <span
            className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded ml-1"
            style={{ background: outcome.badgeBg, color: outcome.badgeColor, border: `1px solid ${outcome.badgeBorder}` }}
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
          <KeyList label="Próximos pasos comerciales" items={keyPoints.nextSteps} />
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
