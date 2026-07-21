"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, Activity, ExternalLink } from "lucide-react";

type Metric = {
  key: "fatigue" | "rpe" | "sleep";
  label: string;
  avg: number | null;
  prevAvg: number | null;
  deltaPct: number | null;
  samples: number;
};

type Sensation = { dayIso: string; dayName: string; note: string; programName: string };

type Highlights = {
  weekStart: string;
  weekEnd: string;
  sessionsCompleted: number;
  sessionsScheduled: number;
  adherencePct: number;
  metrics: Metric[];
  sensations: Sensation[];
  topFindings: string[];
  recommendations: string[];
};

type Report = {
  id: string;
  patientId: string;
  weekStartDate: string;
  summary: string;
  highlights: string | null;
  generatedAt: string;
  dismissedAt: string | null;
  patient: {
    id: string;
    fullName: string;
    programType: string | null;
    photoUrl: string | null;
    assignedProfessional: { id: string; fullName: string } | null;
  };
};

const METRIC_EMOJI: Record<Metric["key"], string> = {
  fatigue: "🪫",
  rpe: "🔥",
  sleep: "😴",
};

/**
 * Feed de resumenes semanales que aparece arriba de /fisio SOLO los lunes.
 * Cards gordos con toda la info (metricas + adherencia + sensaciones +
 * findings + recomendaciones). El fisio puede colapsar cada card con
 * "visto" — deja de aparecer aqui pero sigue accesible en la ficha.
 */
export function WeeklyReportsFeed({ managerDefault }: { managerDefault: boolean }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"mine" | "all">(managerDefault ? "all" : "mine");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAllScopes, setShowAllScopes] = useState(managerDefault);

  const isMonday = new Date().getDay() === 1;

  useEffect(() => {
    if (!isMonday) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/weekly-reports?scope=${scope}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { reports: [] }))
      .then((data) => {
        if (cancelled) return;
        setReports(data.reports ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [scope, isMonday]);

  if (!isMonday) return null;
  if (loading) return null;
  if (reports.length === 0) return null;

  async function dismiss(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/weekly-reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });
      setReports((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="font-semibold text-base flex items-center gap-2">
            🌅 Resúmenes de la semana pasada
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Generados anoche por IA. Marcar como visto para retirarlos del feed.
          </p>
        </div>
        {showAllScopes && (
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => setScope("mine")}
              className={`px-2.5 py-1 rounded-lg font-medium ${scope === "mine" ? "bg-neutral-900 text-white" : "bg-white border border-neutral-200 text-neutral-700"}`}
            >
              Mis pacientes
            </button>
            <button
              onClick={() => setScope("all")}
              className={`px-2.5 py-1 rounded-lg font-medium ${scope === "all" ? "bg-neutral-900 text-white" : "bg-white border border-neutral-200 text-neutral-700"}`}
            >
              Todos
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {reports.map((r) => (
          <WeeklyReportCard key={r.id} report={r} onDismiss={() => dismiss(r.id)} busy={busyId === r.id} />
        ))}
      </div>
    </section>
  );
}

export function WeeklyReportCard({ report, onDismiss, busy, compact }: { report: Report; onDismiss?: () => void; busy?: boolean; compact?: boolean }) {
  const [expanded, setExpanded] = useState(!compact);
  let h: Highlights | null = null;
  try { h = report.highlights ? JSON.parse(report.highlights) : null; } catch { h = null; }

  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/fisio/paciente/${report.patient.id}`} className="font-semibold hover:underline">
              {report.patient.fullName}
            </Link>
            {report.patient.programType && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700">
                {report.patient.programType}
              </span>
            )}
            {report.patient.assignedProfessional && (
              <span className="text-[11px] text-neutral-500">
                · fisio {report.patient.assignedProfessional.fullName}
              </span>
            )}
          </div>
          {h && (
            <div className="text-[11px] text-neutral-500 mt-1">
              Semana del {new Date(h.weekStart).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} al{" "}
              {new Date(new Date(h.weekEnd).getTime() - 86_400_000).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
              {" · "}
              {h.sessionsCompleted}/{h.sessionsScheduled} sesiones ({h.adherencePct}% adherencia)
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/fisio/paciente/${report.patient.id}/wods`}
            className="text-[11px] font-medium px-2.5 py-1 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 flex items-center gap-1"
            title="Abrir la ficha del paciente"
          >
            <ExternalLink size={12} /> Ficha
          </Link>
          {onDismiss && (
            <button
              onClick={onDismiss}
              disabled={busy}
              className="text-[11px] font-medium px-2.5 py-1 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 flex items-center gap-1 disabled:opacity-50"
              title="Marcar como visto (retirar del feed)"
            >
              <X size={12} /> Visto
            </button>
          )}
        </div>
      </header>

      <p className="text-sm text-neutral-800 leading-relaxed whitespace-pre-wrap">{report.summary}</p>

      {h && (
        <div className="mt-3 flex flex-wrap gap-2">
          {h.metrics.map((m) => (
            <MetricPill key={m.key} m={m} />
          ))}
        </div>
      )}

      {h && (h.topFindings.length > 0 || h.recommendations.length > 0 || h.sensations.length > 0) && (
        <div className="mt-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] font-medium text-neutral-600 hover:text-neutral-900 flex items-center gap-1"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? "Ocultar detalle" : "Ver detalle (hitos, recomendaciones, sensaciones)"}
          </button>
          {expanded && (
            <div className="mt-3 space-y-3">
              {h.topFindings.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                    Hitos de la semana
                  </div>
                  <ul className="text-sm text-neutral-800 space-y-1 list-disc pl-4">
                    {h.topFindings.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}
              {h.recommendations.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                    Recomendaciones
                  </div>
                  <ul className="text-sm text-neutral-800 space-y-1 list-disc pl-4">
                    {h.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
              {h.sensations.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                    Sensaciones registradas ({h.sensations.length})
                  </div>
                  <ul className="space-y-1.5">
                    {h.sensations.map((s, i) => (
                      <li key={i} className="text-xs">
                        <span className="capitalize text-neutral-500 mr-2">{s.dayName}</span>
                        <span className="text-neutral-800">{s.note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function MetricPill({ m }: { m: Metric }) {
  if (m.avg === null) return null;
  const delta = m.deltaPct;
  const iconColor =
    delta === null ? "text-neutral-400"
    : Math.abs(delta) < 5 ? "text-neutral-400"
    : delta > 0 ? "text-red-600"
    : "text-emerald-600";
  const arrow = delta === null || Math.abs(delta) < 5 ? <Minus size={11} /> : delta > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />;
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 flex items-center gap-2 text-xs">
      <span className="text-base leading-none">{METRIC_EMOJI[m.key]}</span>
      <div className="leading-tight">
        <div className="font-semibold text-neutral-800">{m.label} <span className="font-normal text-neutral-500">{m.avg.toFixed(1)}</span></div>
        <div className={`text-[10px] flex items-center gap-0.5 ${iconColor}`}>
          {arrow}
          {delta !== null ? `${delta > 0 ? "+" : ""}${delta.toFixed(0)}% vs semana previa` : `${m.samples} muestras`}
        </div>
      </div>
    </div>
  );
}
