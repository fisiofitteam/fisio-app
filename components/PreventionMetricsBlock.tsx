"use client";

import type { PreventionMetrics } from "@/lib/prevention-metrics";

function eur(n: number): string {
  return `${n.toLocaleString("es-ES", { maximumFractionDigits: 0 })} €`;
}

export function PreventionMetricsBlock({ metrics }: { metrics: PreventionMetrics }) {
  const mrrEur = Math.round(metrics.mrrCents / 100);
  const arrEur = mrrEur * 12;
  const conv = metrics.trialConversionsInPeriod;

  return (
    <section className="card mb-3 relative overflow-hidden">
      <div
        className="absolute top-0 left-0 w-1 h-full"
        style={{ background: "linear-gradient(180deg, #FCD34D 0%, #F59E0B 100%)" }}
      />
      <div className="flex justify-between items-center mb-4 pl-2 flex-wrap gap-2">
        <div>
          <h2 className="font-medium text-sm">🛡 FisioFit Prevention</h2>
          <p className="text-xs text-neutral-500 capitalize">{metrics.periodLabel}</p>
        </div>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pl-2 mb-4">
        <div className="rounded-xl p-4 border border-amber-200" style={{ background: "#FEF3C7" }}>
          <div className="text-xs uppercase text-amber-700 font-medium">MRR</div>
          <div className="text-3xl font-bold text-amber-800 mt-1 tabular-nums">{eur(mrrEur)}</div>
          <div className="text-xs text-amber-700 mt-0.5">
            ARR: {eur(arrEur)}
          </div>
        </div>
        <div className="rounded-xl p-4 border border-neutral-200 bg-neutral-50">
          <div className="text-xs uppercase text-neutral-600 font-medium">Suscriptores</div>
          <div className="text-3xl font-bold text-neutral-900 mt-1 tabular-nums">{metrics.activeCount}</div>
          <div className="text-xs text-neutral-500 mt-0.5">
            {metrics.trialingCount} en trial · {metrics.scheduledCount} pendientes
          </div>
        </div>
        <div className="rounded-xl p-4 border border-blue-200" style={{ background: "#EFF6FF" }}>
          <div className="text-xs uppercase text-blue-700 font-medium">Conversión trial</div>
          <div className="text-3xl font-bold text-blue-800 mt-1 tabular-nums">
            {conv.rate !== null ? `${conv.rate}%` : "—"}
          </div>
          <div className="text-xs text-blue-700 mt-0.5">
            {conv.converted}/{conv.startedTrial} trials cerrados
          </div>
        </div>
        <div
          className="rounded-xl p-4 border"
          style={{
            background: metrics.canceledInPeriod > 0 ? "#FEF2F2" : "#FAFAFA",
            borderColor: metrics.canceledInPeriod > 0 ? "#FECACA" : "#E5E5E5",
          }}
        >
          <div
            className="text-xs uppercase font-medium"
            style={{ color: metrics.canceledInPeriod > 0 ? "#B91C1C" : "#525252" }}
          >
            Bajas
          </div>
          <div
            className="text-3xl font-bold mt-1 tabular-nums"
            style={{ color: metrics.canceledInPeriod > 0 ? "#7F1D1D" : "#171717" }}
          >
            {metrics.canceledInPeriod}
          </div>
          <div
            className="text-xs mt-0.5"
            style={{ color: metrics.canceledInPeriod > 0 ? "#B91C1C" : "#525252" }}
          >
            +{metrics.newInPeriod} nuevas altas
          </div>
        </div>
      </div>

      {/* Distribución por plan */}
      <div className="pl-2">
        <div className="text-xs text-neutral-500 mb-2 font-medium uppercase tracking-wide">
          Distribución por plan
        </div>
        <div className="grid grid-cols-3 gap-2">
          {metrics.perPlan.map((p) => (
            <div key={p.plan} className="rounded-lg p-3 bg-neutral-50 border border-neutral-200">
              <div className="text-xs text-neutral-500">{p.label}</div>
              <div className="text-xl font-semibold text-neutral-900 mt-0.5 tabular-nums">
                {p.count}
              </div>
            </div>
          ))}
        </div>
      </div>

      {metrics.pastDueCount > 0 && (
        <div className="mt-3 pl-2">
          <div className="rounded-lg px-3 py-2 border border-amber-300 bg-amber-50 text-xs text-amber-900">
            ⚠ {metrics.pastDueCount} suscripción{metrics.pastDueCount === 1 ? "" : "es"} con pago fallido
            (past_due). Revisa emails y contactos.
          </div>
        </div>
      )}
    </section>
  );
}
