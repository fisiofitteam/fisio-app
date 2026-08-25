"use client";

import { useState } from "react";

type ReportRow = {
  id: string;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  generatedAt: string;
};

type Narrative = {
  resumenEjecutivo: string;
  luces: string[];
  sombras: string[];
  accionesRecomendadas: string[];
  alertas: string[];
  tendencias: string[];
};

type ReportDetail = {
  id: string;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  generatedAt: string;
  metrics: any;
  narrative: Narrative;
};

const PERIOD_LABELS: Record<string, string> = {
  week: "Semanal",
  month: "Mensual",
  quarter: "Trimestral",
  custom: "Personalizado",
};

const PERIOD_COLORS: Record<string, string> = {
  week: "bg-blue-100 text-blue-800",
  month: "bg-emerald-100 text-emerald-800",
  quarter: "bg-purple-100 text-purple-800",
  custom: "bg-neutral-200 text-neutral-800",
};

export function CeoReportsClient({ initial }: { initial: ReportRow[] }) {
  const [reports, setReports] = useState<ReportRow[]>(initial);
  const [generating, setGenerating] = useState(false);
  const [periodType, setPeriodType] = useState<"week" | "month" | "quarter" | "custom">("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  async function generate() {
    setError(null);
    if (periodType === "custom" && (!customFrom || !customTo)) {
      setError("Elige fecha desde y hasta");
      return;
    }
    setGenerating(true);
    try {
      const body: any = { periodType };
      if (periodType === "custom") { body.from = customFrom; body.to = customTo; }
      const res = await fetch("/api/ai/ceo-report/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let j: any = {};
      try { j = JSON.parse(text); } catch { /* ignore */ }
      if (!res.ok || !j?.ok) {
        setError(j?.error || `Error ${res.status}`);
        return;
      }
      // Refrescar lista + abrir el nuevo
      const listRes = await fetch("/api/ai/ceo-report");
      const listJ = await listRes.json();
      setReports(listJ.reports ?? []);
      openReport(j.id);
    } catch (e: any) {
      setError(e?.message ?? "Error de red");
    } finally {
      setGenerating(false);
    }
  }

  async function openReport(id: string) {
    setOpenId(id);
    setDetail(null);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/ai/ceo-report/${id}`);
      const j = await res.json();
      setDetail(j);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function deleteReport(id: string) {
    if (!confirm("¿Borrar este informe? No se puede deshacer.")) return;
    const res = await fetch(`/api/ai/ceo-report/${id}`, { method: "DELETE" });
    if (res.ok) {
      setReports((prev) => prev.filter((r) => r.id !== id));
      if (openId === id) { setOpenId(null); setDetail(null); }
    }
  }

  return (
    <div className="space-y-6">
      {/* Generador */}
      <section className="border border-neutral-200 rounded-lg p-4 bg-white">
        <h2 className="text-lg font-semibold mb-3">Generar nuevo informe</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Periodo</label>
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as any)}
              className="border border-neutral-300 rounded px-3 py-2 text-sm"
              disabled={generating}
            >
              <option value="week">Semanal (últimos 7 días)</option>
              <option value="month">Mensual (mes en curso)</option>
              <option value="quarter">Trimestral (Q en curso)</option>
              <option value="custom">Personalizado</option>
            </select>
          </div>
          {periodType === "custom" && (
            <>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Desde</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="border border-neutral-300 rounded px-3 py-2 text-sm"
                  disabled={generating}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Hasta</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="border border-neutral-300 rounded px-3 py-2 text-sm"
                  disabled={generating}
                />
              </div>
            </>
          )}
          <button
            onClick={generate}
            disabled={generating}
            className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? "Generando…" : "🧠 Generar informe"}
          </button>
        </div>
        {generating && (
          <p className="text-xs text-neutral-500 mt-3">
            Recopilando métricas y llamando a Claude Sonnet… suele tardar 10-30 segundos.
          </p>
        )}
        {error && (
          <p className="text-xs text-red-600 mt-3 whitespace-pre-wrap">Error: {error}</p>
        )}
      </section>

      {/* Detalle */}
      {openId && (
        <section className="border-2 border-amber-400 rounded-lg p-5 bg-amber-50/40">
          {loadingDetail && <p className="text-sm text-neutral-500">Cargando informe…</p>}
          {detail && <ReportDetailView detail={detail} onClose={() => { setOpenId(null); setDetail(null); }} />}
        </section>
      )}

      {/* Historico */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Histórico</h2>
        {reports.length === 0 ? (
          <p className="text-sm text-neutral-500 italic">
            Aún no hay informes. Genera el primero arriba.
          </p>
        ) : (
          <ul className="divide-y border border-neutral-200 rounded-lg bg-white overflow-hidden">
            {reports.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50">
                <button onClick={() => openReport(r.id)} className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${PERIOD_COLORS[r.periodType] ?? "bg-neutral-200"}`}>
                      {PERIOD_LABELS[r.periodType] ?? r.periodType}
                    </span>
                    <span className="text-sm font-medium">{r.periodLabel}</span>
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Generado {new Date(r.generatedAt).toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </button>
                <button
                  onClick={() => deleteReport(r.id)}
                  className="text-xs text-red-600 hover:underline ml-3"
                  title="Borrar"
                >
                  Borrar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ReportDetailView({ detail, onClose }: { detail: ReportDetail; onClose: () => void }) {
  const n = detail.narrative;
  const m = detail.metrics;
  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${PERIOD_COLORS[detail.periodType] ?? "bg-neutral-200"}`}>
              {PERIOD_LABELS[detail.periodType] ?? detail.periodType}
            </span>
            <h3 className="text-xl font-semibold">{detail.periodLabel}</h3>
          </div>
          <p className="text-[11px] text-neutral-500">
            Generado {new Date(detail.generatedAt).toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <button onClick={onClose} className="text-neutral-500 hover:text-neutral-800 text-lg leading-none">✕</button>
      </div>

      {/* Resumen ejecutivo */}
      <div className="bg-white rounded-lg p-4 mb-4 border border-amber-200">
        <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-2">Resumen ejecutivo</h4>
        <p className="text-sm text-neutral-800 leading-relaxed whitespace-pre-wrap">{n.resumenEjecutivo}</p>
      </div>

      {/* KPIs rapidos del snapshot */}
      {m && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
          <Kpi label="Ventas cerradas" value={m.sales?.won ?? 0} sub={m.sales?.revenue ? `${m.sales.revenue.toLocaleString("es-ES")}€` : undefined} />
          <Kpi label="No-show %" value={m.sales?.showUpRate != null ? `${100 - m.sales.showUpRate}%` : "—"} sub={m.sales?.no_show ? `${m.sales.no_show} llamadas` : undefined} />
          <Kpi label="Renovaciones" value={`${m.renewals?.renewed ?? 0}✅ ${m.renewals?.lost ?? 0}❌`} sub={m.renewals?.renewalRate != null ? `${m.renewals.renewalRate}% tasa` : undefined} />
          <Kpi label="Ingresos" value={`${(m.finance?.income ?? 0).toLocaleString("es-ES")}€`} sub={m.finance?.profit != null ? `profit ${m.finance.profit.toLocaleString("es-ES")}€` : undefined} />
          <Kpi label="Setter IA" value={m.leadOrigin?.aiCount ?? 0} sub={m.leadOrigin?.aiCloseRate != null ? `${m.leadOrigin.aiCloseRate}% close` : undefined} />
          <Kpi label="Setter humano" value={m.leadOrigin?.setterCount ?? 0} sub={m.leadOrigin?.setterCloseRate != null ? `${m.leadOrigin.setterCloseRate}% close` : undefined} />
          <Kpi label="Skalex activas" value={m.skalex?.activeConversations ?? 0} sub={m.skalex?.linkedToPatient ? `${m.skalex.linkedToPatient} → pacientes` : undefined} />
          <Kpi label="Ticket medio" value={m.sales?.ticketAvg ? `${m.sales.ticketAvg.toLocaleString("es-ES")}€` : "—"} />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Section title="🟢 Luces" items={n.luces} tone="green" empty="Nada especialmente destacable." />
        <Section title="🔴 Sombras" items={n.sombras} tone="red" empty="Sin puntos de preocupación." />
      </div>
      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <Section title="🎯 Acciones recomendadas" items={n.accionesRecomendadas} tone="amber" empty="Sin acciones sugeridas." />
        <Section title="📈 Tendencias" items={n.tendencias} tone="blue" empty="Aún no hay histórico suficiente para detectar tendencias." />
      </div>
      {n.alertas.length > 0 && (
        <div className="mt-4">
          <Section title="🚨 Alertas críticas" items={n.alertas} tone="red-bold" empty="" />
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded p-3 border border-neutral-200">
      <div className="text-[10px] font-medium text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold text-neutral-900 mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-neutral-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function Section({ title, items, tone, empty }: { title: string; items: string[]; tone: "green" | "red" | "amber" | "blue" | "red-bold"; empty: string }) {
  const bg =
    tone === "green" ? "bg-emerald-50 border-emerald-200" :
    tone === "red" ? "bg-red-50 border-red-200" :
    tone === "amber" ? "bg-amber-50 border-amber-200" :
    tone === "blue" ? "bg-blue-50 border-blue-200" :
    "bg-red-100 border-red-400";
  return (
    <div className={`rounded-lg p-4 border ${bg}`}>
      <h4 className="text-xs font-bold uppercase tracking-wide mb-2">{title}</h4>
      {items.length === 0 ? (
        <p className="text-xs text-neutral-500 italic">{empty}</p>
      ) : (
        <ul className="text-sm space-y-1.5">
          {items.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-neutral-400">•</span>
              <span className="flex-1">{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
