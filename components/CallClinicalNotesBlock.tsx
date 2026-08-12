"use client";

import { useState } from "react";

export type CallClinicalData = {
  clinicalSummary: string | null;
  clinicalKeyPoints: string | null; // JSON { mainComplaint, symptoms, history, contextLifestyle, goals, redFlags }
  noTranscript: boolean;
  errorMessage: string | null;
};

/**
 * Bloque con el resumen CLÍNICO de la videollamada de venta, generado por
 * IA a partir de la transcripción de Meet. Se muestra al fisio en la ficha
 * del paciente (pestaña Formularios) encima del textarea de notas de
 * anamnesis, como referencia.
 *
 * Si no hay transcripción disponible, el componente no renderiza nada
 * (el textarea manual sigue estando ahí para que el fisio lo rellene).
 */
export function CallClinicalNotesBlock({ data }: { data: CallClinicalData | null | undefined }) {
  const [expanded, setExpanded] = useState(true);

  if (!data) return null;
  // Silencioso si no hay transcript ni contenido: el fisio no necesita ver
  // un aviso técnico aquí, ya tiene el textarea para escribir a mano.
  if (data.noTranscript || (!data.clinicalSummary && !data.errorMessage)) return null;

  if (!data.clinicalSummary && data.errorMessage) {
    return (
      <div
        className="rounded-md px-3 py-2 text-[11px] mb-2"
        style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", color: "#7F1D1D" }}
      >
        ⚠ No se pudo generar el resumen clínico desde la transcripción: {data.errorMessage}
      </div>
    );
  }

  let kp: any = null;
  if (data.clinicalKeyPoints) {
    try { kp = JSON.parse(data.clinicalKeyPoints); } catch { kp = null; }
  }

  return (
    <div
      className="rounded-lg px-3 py-2.5 text-xs mb-3"
      style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#1E3A8A" }}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px]">🩺</span>
          <span className="font-semibold">Resumen clínico de la llamada (IA)</span>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] font-medium underline opacity-80 hover:opacity-100"
        >
          {expanded ? "Colapsar" : "Expandir"}
        </button>
      </div>
      <p className="leading-relaxed">{data.clinicalSummary}</p>
      {expanded && kp && (
        <div className="mt-2 space-y-1.5">
          {kp.mainComplaint && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider opacity-75">Motivo de consulta</p>
              <p className="mt-0.5">{String(kp.mainComplaint)}</p>
            </div>
          )}
          <KeyList label="Síntomas" items={kp.symptoms} />
          <KeyList label="Historial / antecedentes" items={kp.history} />
          <KeyList label="Contexto (trabajo, sueño, entrenamiento)" items={kp.contextLifestyle} />
          <KeyList label="Objetivos" items={kp.goals} />
          <KeyList label="⚠ Banderas rojas" items={kp.redFlags} accent />
        </div>
      )}
      <p className="mt-2 text-[10px] italic opacity-70">
        Generado automáticamente desde la transcripción de Meet. Verifica los datos con el paciente en la primera sesión.
      </p>
    </div>
  );
}

function KeyList({ label, items, accent = false }: { label: string; items?: unknown; accent?: boolean }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div>
      <p
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={accent ? { color: "#B91C1C" } : { opacity: 0.75 }}
      >
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
