"use client";

import { MetricAlertsEditor, type MetricMeta } from "@/components/MetricAlertsEditor";

/**
 * Editor de plantilla global. Pintamos dos secciones para dejar claro
 * a qué programa afecta cada bloque (ADVANCE vs RECUPERA/CONSOLIDA).
 * Ambos guardan sobre la misma plantilla — el detector se cruza con las
 * fuentes correctas al evaluar.
 */
export function MetricAlertsTemplateClient({
  initial,
  dailyLogMetrics,
  rehabMetrics,
}: {
  initial: any;
  dailyLogMetrics: MetricMeta[];
  rehabMetrics: MetricMeta[];
}) {
  async function save(config: any) {
    const r = await fetch("/api/metric-alerts/template", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    if (!r.ok) throw new Error("save failed");
    const data = await r.json();
    return data.config;
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
          <span>⚡</span> Atletas ADVANCE / PREVENTION
        </h2>
        <p className="text-[11px] text-neutral-500 mb-3">
          Se evalúan cuando el paciente rellena su daily-log (fatiga/RPE/sueño).
        </p>
        <MetricAlertsEditor
          initial={initial}
          scope="template"
          metrics={dailyLogMetrics}
          onSave={save}
        />
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
          <span>🩹</span> Pacientes RECUPERA / CONSOLIDA
        </h2>
        <p className="text-[11px] text-neutral-500 mb-3">
          Métricas clínicas de la biblioteca (auto=true). Se evalúan cuando el paciente
          completa una sesión con tarea EVOLUTION.
          {rehabMetrics.length === 0 && (
            <> Actualmente <strong>no hay métricas auto configuradas</strong> en la biblioteca.</>
          )}
        </p>
        <MetricAlertsEditor
          initial={initial}
          scope="template"
          metrics={rehabMetrics}
          onSave={save}
        />
      </section>
    </div>
  );
}
