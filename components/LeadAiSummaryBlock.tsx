"use client";

import { useState } from "react";
import type { LeadAiSummary } from "@/lib/skalex/summaries";

/**
 * Bloque compacto que muestra el análisis IA de Skalex para un lead.
 * Se colapsa si el análisis es largo (>150 chars); botón para expandir.
 * Silencioso (renderiza null) si no hay análisis todavía.
 */
export function LeadAiSummaryBlock({ summary }: { summary: LeadAiSummary | null | undefined }) {
  const [expanded, setExpanded] = useState(false);
  if (!summary || !summary.analysis) return null;

  const text = summary.analysis.trim();
  const isLong = text.length > 150;
  const shown = expanded || !isLong ? text : text.slice(0, 150).trimEnd() + "…";

  return (
    <div
      className="mt-2 rounded-md px-2.5 py-2 text-xs"
      style={{ background: "#F5F3FF", border: "1px solid #DDD6FE", color: "#4C1D95" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[13px]">🤖</span>
        <span className="font-semibold">Estado del setter IA</span>
        {summary.phaseName && (
          <span
            className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded ml-1"
            style={{ background: "#EDE9FE", color: "#5B21B6", border: "1px solid #C4B5FD" }}
          >
            {summary.phase != null && (
              <span className="tabular-nums opacity-70 mr-0.5">{summary.phase}</span>
            )}
            {summary.phaseName}
          </span>
        )}
      </div>
      <p className="leading-relaxed">"{shown}"</p>
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
      {summary.nextStepGoal && (
        <p className="mt-1 text-[11px]" style={{ color: "#5B21B6" }}>
          <span className="font-semibold">▶ Siguiente paso:</span> {summary.nextStepGoal}
        </p>
      )}
    </div>
  );
}
