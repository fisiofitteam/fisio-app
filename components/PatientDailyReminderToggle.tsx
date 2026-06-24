"use client";
/**
 * Toggle "Aviso diario" para el paciente.
 * Persiste el flag dailyReminderEnabled en Patient vía PATCH /api/patient/preferences.
 */
import { useState } from "react";

export function PatientDailyReminderToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !enabled;
    setSaving(true);
    setEnabled(next); // optimista
    try {
      const r = await fetch("/api/patient/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyReminderEnabled: next }),
      });
      if (!r.ok) {
        setEnabled(!next);
        alert("No se pudo guardar. Inténtalo de nuevo.");
      }
    } catch {
      setEnabled(!next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={saving}
      className="flex justify-between items-center w-full"
      style={{ background: "transparent" }}
    >
      <div className="text-left">
        <div className="font-semibold text-sm">Aviso diario por email</div>
        <div className="text-xs" style={{ color: "var(--p-text-dim)" }}>
          Cada mañana a las 7:00 con un resumen de tus tareas de hoy.
        </div>
      </div>
      <span
        className={`flex-shrink-0 inline-block w-11 h-6 rounded-full relative transition-colors`}
        style={{
          background: enabled ? "#10b981" : "#d4d4d4",
          opacity: saving ? 0.6 : 1,
        }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
          style={{ left: enabled ? "22px" : "2px" }}
        />
      </span>
    </button>
  );
}
