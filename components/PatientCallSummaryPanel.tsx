"use client";

import { useState } from "react";

/**
 * Panel con el resumen IA de una llamada terminada. Muestra:
 *   - Evolución clínica (síntomas, adherencia, ajustes, objetivos, banderas rojas)
 *   - Cierre de renovación (solo si type=renewal)
 *   - Feedback para el fisio (coaching)
 *   - Acción "Regenerar" (rehacer desde la transcripción)
 *
 * Se usa tanto en la ficha del paciente (dentro de PatientCallLinksCard)
 * como en el panel de llamadas (/fisio/llamadas) para las realizadas.
 */

export type PatientCallSummaryData = {
  clinicalSummary: string | null;
  clinicalKeyPoints: string | null;
  coachingSummary: string | null;
  coachingKeyPoints: string | null;
  salesSummary: string | null;
  salesKeyPoints: string | null;
  transcriptCharCount: number | null;
  updatedAt: string;
};

export function PatientCallSummaryPanel({
  callId,
  callType,
  summary,
  onRegenerated,
  defaultOpen = true,
}: {
  callId: string;
  callType: "optimization" | "renewal";
  summary: PatientCallSummaryData;
  onRegenerated?: () => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [regenerating, setRegenerating] = useState(false);

  const clinicalKp = safeParse(summary.clinicalKeyPoints);
  const coachingKp = safeParse(summary.coachingKeyPoints);
  const renewalKp = callType === "renewal" ? safeParse(summary.salesKeyPoints) : null;

  async function regen() {
    if (!confirm("¿Regenerar el resumen desde la transcripción? Sobrescribirá el actual.")) return;
    setRegenerating(true);
    const r = await fetch(`/api/patient-calls/${callId}/regenerate`, { method: "POST" });
    setRegenerating(false);
    if (r.ok && onRegenerated) onRegenerated();
  }

  return (
    <div className="mt-3 rounded-md" style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-xs font-semibold">🤖 Resumen IA {open ? "▾" : "▸"}</span>
        <span className="text-[10px] text-neutral-500">
          {summary.transcriptCharCount ? `${summary.transcriptCharCount.toLocaleString("es-ES")} chars` : ""}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 text-[12px]">
          {summary.clinicalSummary && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">
                Evolución clínica
              </div>
              <p className="text-neutral-800 leading-relaxed">{summary.clinicalSummary}</p>
              <KpList label="Síntomas actuales" items={clinicalKp?.currentSymptoms} />
              <KpList label="Adherencia" items={clinicalKp?.adherence} />
              <KpList label="Ajustes acordados" items={clinicalKp?.planAdjustments} />
              <KpList label="Objetivos actualizados" items={clinicalKp?.goalsUpdated} />
              <KpList label="⚠️ Banderas rojas" items={clinicalKp?.redFlags} highlight />
            </div>
          )}

          {callType === "renewal" && summary.salesSummary && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">
                Cierre de renovación
              </div>
              <p className="text-neutral-800 leading-relaxed">{summary.salesSummary}</p>
              {renewalKp?.programProposed && (
                <div className="text-[11px] text-neutral-700 mt-1">
                  <b>Propuesta:</b> {renewalKp.programProposed}
                  {renewalKp?.priceDiscussed ? ` · ${renewalKp.priceDiscussed}` : ""}
                </div>
              )}
              {renewalKp?.decision && (
                <div className="text-[11px] text-neutral-700 mt-0.5">
                  <b>Decisión:</b> {renewalKp.decision}
                </div>
              )}
              <KpList label="Objeciones" items={renewalKp?.objections} />
            </div>
          )}

          {summary.coachingSummary && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">
                🎯 Feedback para el fisio
              </div>
              <p className="text-neutral-800 leading-relaxed">{summary.coachingSummary}</p>
              <KpList label="👍 Puntos fuertes" items={coachingKp?.strengths} />
              <KpList label="👀 Oportunidades" items={coachingKp?.weaknesses} />
              <KpList label="💡 Para la próxima" items={coachingKp?.improvements} />
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "#E5E7EB" }}>
            <span className="text-[10px] text-neutral-500">
              Generado {new Intl.DateTimeFormat("es-ES", {
                timeZone: "Europe/Madrid",
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(summary.updatedAt))}
            </span>
            <button
              onClick={regen}
              disabled={regenerating}
              className="text-[11px] font-medium px-2 py-1 rounded-md disabled:opacity-40"
              style={{ background: "#0A0A0A", color: "#FAFAFA" }}
            >
              {regenerating ? "Regenerando…" : "🔄 Regenerar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function KpList({ label, items, highlight }: { label: string; items?: string[]; highlight?: boolean }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{label}</div>
      <ul className="list-disc pl-5 mt-0.5 space-y-0.5">
        {items.map((it, i) => (
          <li key={i} className={highlight ? "text-red-700 font-medium" : "text-neutral-700"}>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function safeParse(json: string | null | undefined): any {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}
