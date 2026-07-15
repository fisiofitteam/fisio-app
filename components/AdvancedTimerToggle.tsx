"use client";

import { useEffect, useState } from "react";

/**
 * Toggle "Modo ADVANCE del timer". Solo se renderiza para pacientes
 * ADVANCE (el server decide si lo pinta).
 *
 * Al activarlo, el cronómetro añade:
 *  - Botón "🏁 Ronda" mientras está corriendo. Cada pulsación registra
 *    un split (tiempo de la vuelta).
 *  - Botón "Terminar WOD" que muestra un mini-informe con los splits
 *    acumulados, estilo laps de Garmin.
 *
 * Se persiste en localStorage (por dispositivo). Coherente con el resto
 * de preferencias del timer (volumen, cuenta atrás, vibración).
 */

const LS_KEY = "fisio-timer-advanced-mode";

export function AdvancedTimerToggle() {
  const [enabled, setEnabled] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setEnabled(localStorage.getItem(LS_KEY) === "1");
    setHydrated(true);
  }, []);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem(LS_KEY, next ? "1" : "0");
  }

  if (!hydrated) return null;

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium" style={{ color: "var(--p-text)" }}>
          Rondas + splits en el timer
        </div>
        <p className="text-xs mt-0.5" style={{ color: "var(--p-text-dim)" }}>
          Añade botón "Ronda" al cronómetro. Al terminar el WOD, ves el tiempo
          de cada ronda estilo laps de Garmin.
        </p>
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={enabled}
        className="relative w-12 h-7 rounded-full shrink-0 transition-colors"
        style={{
          background: enabled ? "var(--p-accent)" : "var(--p-surface-2)",
          border: "1px solid var(--p-border-strong)",
        }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
          style={{
            left: enabled ? "calc(100% - 1.375rem)" : "0.125rem",
            background: enabled ? "var(--p-accent-ink)" : "var(--p-text)",
          }}
        />
      </button>
    </div>
  );
}
