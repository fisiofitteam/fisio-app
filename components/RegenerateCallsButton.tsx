"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Botón "Actualizar llamadas" del recuadro "Próximas llamadas" del panel.
 * Dispara manualmente el generador de ScheduledCall (optimización 4a→5a
 * semana, renovación 14 días antes). Sirve como red de seguridad cuando
 * el cron programado falla o va con retraso.
 *
 * Accesible a fisios, head_success y CEO — usa un endpoint dedicado
 * (/api/patient-calls/refresh) que valida por rol de equipo clínico.
 */
export function RegenerateCallsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const r = await fetch("/api/patient-calls/refresh", {
        method: "POST",
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d?.error ?? "No se pudo regenerar");
        return;
      }
      const created = (d?.optimizationCreated ?? 0) + (d?.renewalCreated ?? 0);
      const scanned = d?.scanned ?? 0;
      if (created === 0) {
        setFeedback(`✓ Sin cambios — ${scanned} pacientes revisados`);
      } else {
        setFeedback(`✓ Añadidos ${created} avisos (opt ${d.optimizationCreated} · ren ${d.renewalCreated})`);
        // Refrescamos para que aparezcan las nuevas ScheduledCall en la lista.
        router.refresh();
      }
    } catch (e: any) {
      setError(e?.message ?? "Error inesperado");
    } finally {
      setBusy(false);
      // Auto-limpia el feedback tras unos segundos.
      setTimeout(() => { setFeedback(null); setError(null); }, 6000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {feedback && <span className="text-[10px] text-emerald-700">{feedback}</span>}
      {error && <span className="text-[10px] text-red-600">{error}</span>}
      <button
        onClick={run}
        disabled={busy}
        className="text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-50"
        title="Ejecuta el generador manual de avisos de optimización/renovación (útil si el cron automático falló)"
      >
        {busy ? "⏳ Actualizando…" : "🔄 Actualizar llamadas"}
      </button>
    </div>
  );
}
