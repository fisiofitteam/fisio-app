"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Metrics = {
  scheduled: number;
  totalCalls: number;
  won: number;
  lost: number;
  cancelled: number;
  no_show: number;
  closeRate: number | null;
  showUpRate: number | null;
  wonByProgram: { RECUPERA: number; CONSOLIDA: number; ADVANCE: number; NONE: number };
  revenue: number;
  ticketAvg: number | null;
};

type Period = "month" | "quarter" | "year" | "custom";

function eur(n: number): string {
  return `${n.toLocaleString("es-ES", { maximumFractionDigits: 0 })} €`;
}

export function SalesMetricsBlock({
  title,
  period,
  periodLabel,
  from,
  to,
  metrics,
  perCloser,
  showProgramBreakdown = true,
}: {
  title?: string;
  period: Period;
  periodLabel: string;
  from: string;
  to: string;
  metrics: Metrics;
  perCloser?: ({ id: string; fullName: string; role: string } & Metrics)[];
  showProgramBreakdown?: boolean;
}) {
  const router = useRouter();
  const [showCustom, setShowCustom] = useState(period === "custom");
  const [fromDate, setFromDate] = useState(from || "");
  const [toDate, setToDate] = useState(to || "");

  function switchPeriod(p: "month" | "quarter" | "year") {
    const url = new URL(window.location.href);
    url.searchParams.set("salesPeriod", p);
    url.searchParams.delete("salesFrom");
    url.searchParams.delete("salesTo");
    setShowCustom(false);
    router.push(url.pathname + url.search);
    router.refresh();
  }

  function applyCustom() {
    if (!fromDate || !toDate) return;
    const url = new URL(window.location.href);
    url.searchParams.set("salesFrom", fromDate);
    url.searchParams.set("salesTo", toDate);
    url.searchParams.delete("salesPeriod");
    router.push(url.pathname + url.search);
    router.refresh();
  }

  return (
    <>
      <section className="card mb-3 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full" style={{ background: "linear-gradient(180deg, #FCD34D 0%, #F59E0B 100%)" }} />
        <div className="flex justify-between items-start mb-3 pl-2 flex-wrap gap-2">
          <div>
            <h2 className="font-medium text-sm">{title ?? "Métricas de venta"}</h2>
            <p className="text-xs text-neutral-500 capitalize">{periodLabel}</p>
          </div>
          <div className="flex bg-neutral-100 rounded-lg p-0.5">
            {(["month", "quarter", "year"] as const).map((p) => (
              <button
                key={p}
                onClick={() => switchPeriod(p)}
                className={`px-3 py-1 text-xs rounded-md ${
                  period === p ? "bg-white shadow-sm font-medium" : "text-neutral-600 hover:text-neutral-900"
                }`}
              >
                {p === "month" ? "Mensual" : p === "quarter" ? "Trimestral" : "Anual"}
              </button>
            ))}
            <button
              onClick={() => setShowCustom((v) => !v)}
              className={`px-3 py-1 text-xs rounded-md ${
                period === "custom" ? "bg-white shadow-sm font-medium" : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              📅 Personalizado
            </button>
          </div>
        </div>

        {showCustom && (
          <div className="pl-2 mb-3 flex flex-wrap gap-2 items-end bg-neutral-50 border border-neutral-200 rounded-lg p-3 mx-2">
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5 uppercase">Desde</label>
              <input type="date" className="input text-sm w-auto" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5 uppercase">Hasta</label>
              <input type="date" className="input text-sm w-auto" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <button onClick={applyCustom} disabled={!fromDate || !toDate} className="btn btn-primary text-xs disabled:opacity-50">
              Aplicar
            </button>
            {period === "custom" && (
              <button onClick={() => switchPeriod("month")} className="text-xs text-neutral-500 underline">
                Volver a mensual
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pl-2">
          <KpiCell label="Agendadas" value={metrics.scheduled} color="blue" />
          <KpiCell label="Realizadas" value={metrics.totalCalls} sub={metrics.showUpRate !== null ? `${metrics.showUpRate}% show-up` : undefined} />
          <KpiCell label="Ventas" value={metrics.won} color="emerald" />
          <KpiCell label="Perdidas" value={metrics.lost} color="red" />
          <KpiCell label="% cierre" value={metrics.closeRate !== null ? `${metrics.closeRate}%` : "—"} accent />
        </div>

        {(metrics.cancelled > 0 || metrics.no_show > 0) && (
          <div className="pl-2 mt-3 pt-3 border-t border-neutral-100 flex gap-4 text-xs text-neutral-500">
            <span>🚫 {metrics.cancelled} canceladas</span>
            <span>👻 {metrics.no_show} no acudieron</span>
          </div>
        )}
      </section>

      {showProgramBreakdown && metrics.won > 0 && (
        <section className="card mb-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Programa contratado */}
            <div>
              <h3 className="text-xs uppercase text-neutral-500 font-medium mb-2">Ventas por programa</h3>
              <div className="flex gap-2 flex-wrap">
                {(["RECUPERA", "CONSOLIDA", "ADVANCE"] as const).map((p) => (
                  <div key={p} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-50 border border-neutral-200">
                    <span className="text-[11px] font-medium text-neutral-700">{p}</span>
                    <span className="text-sm font-semibold tabular-nums">{metrics.wonByProgram[p]}</span>
                  </div>
                ))}
                {metrics.wonByProgram.NONE > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-50 border border-neutral-200 text-neutral-500">
                    <span className="text-[11px]">Sin definir</span>
                    <span className="text-sm font-semibold tabular-nums">{metrics.wonByProgram.NONE}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Facturación y ticket medio */}
            <div>
              <h3 className="text-xs uppercase text-neutral-500 font-medium mb-2">Facturación</h3>
              <div className="flex gap-4 items-baseline">
                <div>
                  <div className="text-[10px] text-neutral-500">Total</div>
                  <div className="text-xl font-semibold text-emerald-700">{eur(metrics.revenue)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-500">Ticket medio</div>
                  <div className="text-xl font-semibold">
                    {metrics.ticketAvg !== null ? eur(metrics.ticketAvg) : <span className="text-neutral-300">—</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {perCloser && perCloser.length > 0 && (
        <section className="card mb-5">
          <h2 className="font-medium text-sm mb-3">Métricas por profesional</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-neutral-500 uppercase border-b border-neutral-200">
                  <th className="text-left py-2 px-2 font-medium">Profesional</th>
                  <th className="text-right py-2 px-2 font-medium">Agend.</th>
                  <th className="text-right py-2 px-2 font-medium">Hechas</th>
                  <th className="text-right py-2 px-2 font-medium">% show</th>
                  <th className="text-right py-2 px-2 font-medium">Ventas</th>
                  <th className="text-right py-2 px-2 font-medium">Perd.</th>
                  <th className="text-right py-2 px-2 font-medium">% cierre</th>
                  <th className="text-right py-2 px-2 font-medium">Facturación</th>
                </tr>
              </thead>
              <tbody>
                {perCloser.map((c) => (
                  <tr key={c.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="py-2 px-2">
                      <div className="font-medium">{c.fullName}</div>
                      <div className="text-[10px] text-neutral-500">
                        {c.role === "ceo" ? "👑 CEO" : "📞 Closer"}
                      </div>
                    </td>
                    <td className="text-right py-2 px-2">{c.scheduled}</td>
                    <td className="text-right py-2 px-2">{c.totalCalls}</td>
                    <td className="text-right py-2 px-2 text-neutral-600">
                      {c.showUpRate !== null ? `${c.showUpRate}%` : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="text-right py-2 px-2 text-emerald-700">{c.won}</td>
                    <td className="text-right py-2 px-2 text-neutral-600">{c.lost}</td>
                    <td className="text-right py-2 px-2 font-medium">
                      {c.closeRate !== null ? `${c.closeRate}%` : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="text-right py-2 px-2">
                      {c.revenue > 0 ? eur(c.revenue) : <span className="text-neutral-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function KpiCell({
  label, value, color, sub, accent,
}: { label: string; value: number | string; color?: "blue" | "emerald" | "red"; sub?: string; accent?: boolean }) {
  const colorClass =
    color === "blue" ? "text-blue-700"
    : color === "emerald" ? "text-emerald-700"
    : color === "red" ? "text-red-700"
    : "text-neutral-900";
  return (
    <div>
      <div className="text-xs text-neutral-500 mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${accent ? "brand-gradient-text" : colorClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-neutral-400 mt-0.5">{sub}</div>}
    </div>
  );
}
