"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PatientDailyLogForm } from "@/components/PatientDailyLogForm";

/**
 * Botón/desplegable para registrar las métricas del día desde la pantalla
 * de "Mis métricas". Normalmente el atleta lo hace desde la sesión de hoy,
 * así que por defecto llega colapsado. Si ya registró hoy, muestra un
 * indicador ✓ y permite reabrir para editar.
 */
export function PatientDailyLogToggle({
  initial,
}: {
  initial: { fatigue: number; rpe: number; sleep: number } | null;
}) {
  const [open, setOpen] = useState(false);
  const already = !!initial;

  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">✍️</span>
          <div>
            <div className="text-sm font-semibold" style={{ letterSpacing: "-0.01em" }}>
              {already ? "Editar registro de hoy" : "Registrar métricas de hoy"}
            </div>
            <div className="text-[11px]" style={{ color: "var(--p-text-faint)" }}>
              {already
                ? `Ya registrado · Fatiga ${initial!.fatigue} · RPE ${initial!.rpe} · Sueño ${initial!.sleep}`
                : "Fatiga · RPE · Sueño (0-10)"}
            </div>
          </div>
        </div>
        <div style={{ color: "var(--p-text-faint)" }}>
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1">
          <PatientDailyLogForm initial={initial} />
        </div>
      )}
    </section>
  );
}
