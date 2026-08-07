import type { SkalexMonthlyMetrics } from "@/lib/skalex/metrics";

/**
 * Card compacta para el panel CEO con las métricas del setter IA (Skalex).
 * Muestra actividad total, top 5 etiquetas y distribución por fase IA del rango.
 */
export function SkalexMetricsCard({
  metrics,
  periodLabel,
}: {
  metrics: SkalexMonthlyMetrics;
  periodLabel: string;
}) {
  const {
    activeConversations,
    labelsByName,
    aiPhaseCounts,
    linkedToPatient,
    linkedToLeadOnly,
    unlinked,
    lastSyncAt,
    lastError,
  } = metrics;

  const topLabels = labelsByName.slice(0, 5);
  const totalLabels = labelsByName.reduce((s, l) => s + l.count, 0);

  return (
    <section className="card">
      <div className="flex justify-between items-start mb-3 gap-2">
        <div>
          <h2 className="font-medium text-sm flex items-center gap-1.5">
            🤖 Setter IA (Skalex)
          </h2>
          <p className="text-[11px] text-neutral-500 mt-0.5">{periodLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-neutral-400">
            {lastSyncAt
              ? `Sync ${new Date(lastSyncAt).toLocaleString("es-ES", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}`
              : "Nunca sincronizado"}
          </p>
          {lastError && (
            <p className="text-[10px] text-red-600 mt-0.5">⚠ error sync</p>
          )}
        </div>
      </div>

      {activeConversations === 0 ? (
        <p className="text-xs text-neutral-400 py-6 text-center">
          Sin actividad en el rango.
          <br />
          {!lastSyncAt && (
            <span className="italic">Primero configura SKALEX_API_KEY y ejecuta el cron.</span>
          )}
        </p>
      ) : (
        <div className="space-y-3">
          {/* KPI principal + cruces */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-lg font-semibold tabular-nums">{activeConversations}</p>
              <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Conversaciones</p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums text-emerald-700">{linkedToPatient}</p>
              <p className="text-[10px] text-neutral-500 uppercase tracking-wider">→ Paciente</p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums text-amber-700">{linkedToLeadOnly}</p>
              <p className="text-[10px] text-neutral-500 uppercase tracking-wider">→ Lead</p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums text-neutral-400">{unlinked}</p>
              <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Sin cruce</p>
            </div>
          </div>

          {/* Top etiquetas */}
          {topLabels.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5">
                Etiquetas del rango ({totalLabels})
              </p>
              <div className="space-y-1">
                {topLabels.map((l) => (
                  <div key={l.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      {l.color && (
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ background: l.color }}
                        />
                      )}
                      {l.name}
                    </span>
                    <span className="tabular-nums text-neutral-700 font-medium">{l.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fases IA */}
          {aiPhaseCounts.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5">
                Fase del funnel (IA)
              </p>
              <div className="space-y-1">
                {aiPhaseCounts.slice(0, 6).map((p) => (
                  <div key={`${p.phase}-${p.phaseName}`} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block text-[10px] text-neutral-400 tabular-nums w-4 text-right">
                        {p.phase ?? "—"}
                      </span>
                      {p.phaseName ?? "sin fase"}
                    </span>
                    <span className="tabular-nums text-neutral-700 font-medium">{p.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
