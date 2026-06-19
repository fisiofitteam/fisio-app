"use client";

import { useState } from "react";
import Link from "next/link";

type Recommendation = {
  priority: "high" | "medium" | "low";
  entity: "campaign" | "adset" | "ad";
  entityId: string;
  entityName: string;
  action: string;
  actionLabel: string;
  reason: string;
  suggestedNext?: string;
};

type Run = {
  id: string;
  period: string;
  summary: string;
  recommendations: Recommendation[];
  createdAt: string;
};

const PRIORITY_LABEL: Record<Recommendation["priority"], string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

const PRIORITY_COLOR: Record<Recommendation["priority"], string> = {
  high: "bg-red-50 border-red-200 text-red-900",
  medium: "bg-amber-50 border-amber-200 text-amber-900",
  low: "bg-neutral-50 border-neutral-200 text-neutral-700",
};

const PRIORITY_BADGE: Record<Recommendation["priority"], string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-neutral-200 text-neutral-700",
};

const ACTION_ICON: Record<string, string> = {
  pause: "⏸️",
  scale_up: "📈",
  scale_down: "📉",
  renew_creative: "✨",
  broaden_audience: "👥",
  narrow_audience: "🎯",
  review_targeting: "🔍",
  review_attribution: "🔗",
  other: "💡",
};

const PERIODS = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "quarter", label: "Trimestre" },
  { value: "year", label: "Año" },
];

function entityLink(r: Recommendation): string {
  if (r.entity === "ad") return `/fisio/anuncios/ad/${r.entityId}`;
  return `/fisio/anuncios/campanas`;
}

export function OptimizerView({ initial }: { initial: Run | null }) {
  const [run, setRun] = useState<Run | null>(initial);
  const [period, setPeriod] = useState<string>(initial?.period ?? "day");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/ads/optimizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      });
      const data = await r.json();
      if (!r.ok) setError(data?.error ?? "Error inesperado");
      else setRun(data.run);
    } catch (e: any) {
      setError(e.message ?? "Error de red");
    } finally {
      setLoading(false);
    }
  }

  const sorted = run
    ? [...run.recommendations].sort((a, b) => {
        const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
        return (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3);
      })
    : [];

  return (
    <div>
      <section className="card mb-4">
        <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
          <h2 className="font-medium text-sm">🧠 Optimizador IA</h2>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`text-xs px-2.5 py-1 rounded-md border ${period === p.value ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200"}`}
              >
                {p.label}
              </button>
            ))}
            <button onClick={analyze} disabled={loading} className="btn btn-primary text-xs ml-2">
              {loading ? "Analizando con Claude…" : run ? "🔄 Reanalizar" : "✨ Analizar ahora"}
            </button>
          </div>
        </div>
        <p className="text-xs text-neutral-500">
          Claude Opus revisa Meta + ROAS atribuido y te propone acciones priorizadas (pausar, escalar, renovar, etc).
          {run && (
            <span className="ml-2">
              Último análisis: <strong>{new Date(run.createdAt).toLocaleString("es-ES")}</strong> · periodo <strong>{run.period}</strong>
            </span>
          )}
        </p>
        {error && (
          <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
            ⚠️ {error}
          </div>
        )}
      </section>

      {run && (
        <>
          <section className="card mb-4">
            <h3 className="font-medium text-sm mb-1">📋 Resumen</h3>
            <p className="text-sm text-neutral-700">{run.summary}</p>
          </section>

          {sorted.length === 0 ? (
            <section className="card text-center py-12 italic text-sm text-neutral-500">
              Sin recomendaciones. Esto suele ser buena señal — o que no hay datos del periodo.
            </section>
          ) : (
            <section className="space-y-2">
              <h3 className="font-medium text-sm mb-1">Recomendaciones ({sorted.length})</h3>
              {sorted.map((r, i) => (
                <article key={i} className={`card !p-3 border-l-4 ${PRIORITY_COLOR[r.priority]}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{ACTION_ICON[r.action] ?? "💡"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${PRIORITY_BADGE[r.priority]}`}>
                          {PRIORITY_LABEL[r.priority]}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-neutral-500">
                          {r.entity === "campaign" ? "Campaña" : r.entity === "adset" ? "AdSet" : "Anuncio"}
                        </span>
                        <strong className="text-sm">{r.entityName}</strong>
                      </div>
                      <p className="text-sm font-medium">{r.actionLabel}</p>
                      <p className="text-sm text-neutral-700 mt-1">{r.reason}</p>
                      {r.suggestedNext && (
                        <p className="text-xs text-neutral-500 mt-2 italic">→ {r.suggestedNext}</p>
                      )}
                    </div>
                    <Link href={entityLink(r)} className="text-xs text-neutral-500 hover:text-neutral-900 flex-shrink-0">
                      Abrir →
                    </Link>
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}

      {!run && !loading && !error && (
        <section className="card text-center py-12">
          <p className="text-sm text-neutral-500">
            Aún no has ejecutado ningún análisis. Pulsa <strong>Analizar ahora</strong> para que Claude revise tus campañas activas y te diga qué hacer.
          </p>
          <p className="text-[11px] text-neutral-400 mt-2">
            Tarda ~10-30s. Cada análisis se guarda; al volver aquí ves el último sin re-ejecutar.
          </p>
        </section>
      )}
    </div>
  );
}
