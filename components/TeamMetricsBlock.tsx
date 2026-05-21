"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type PerFisio = {
  id: string;
  fullName: string;
  role: string;
  patientsCount: number;
  renewed: number;
  lost: number;
  rate: number | null;
  adherence: number | null;
};

type Period = "month" | "quarter" | "year" | "custom";

export function TeamMetricsBlock({
  period,
  periodLabel,
  from,
  to,
  renewals,
  perFisio,
}: {
  period: Period;
  periodLabel: string;
  from: string;
  to: string;
  renewals: { renewed: number; lost: number; total: number; rate: number | null };
  perFisio: PerFisio[];
}) {
  const router = useRouter();
  const [showCustom, setShowCustom] = useState(period === "custom");
  const [fromDate, setFromDate] = useState(from || "");
  const [toDate, setToDate] = useState(to || "");

  function switchPeriod(p: "month" | "quarter" | "year") {
    const url = new URL(window.location.href);
    url.searchParams.set("teamPeriod", p);
    url.searchParams.delete("from");
    url.searchParams.delete("to");
    setShowCustom(false);
    router.push(url.pathname + url.search);
    router.refresh();
  }

  function applyCustom() {
    if (!fromDate || !toDate) return;
    const url = new URL(window.location.href);
    url.searchParams.set("from", fromDate);
    url.searchParams.set("to", toDate);
    url.searchParams.delete("teamPeriod");
    router.push(url.pathname + url.search);
    router.refresh();
  }

  return (
    <>
      <section className="card mb-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full" style={{ background: "linear-gradient(180deg, #FCD34D 0%, #F59E0B 100%)" }} />
        <div className="flex justify-between items-start mb-3 pl-2 flex-wrap gap-2">
          <div>
            <h2 className="font-medium text-sm">Métricas de renovación del equipo</h2>
            <p className="text-xs text-neutral-500 capitalize">{periodLabel}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-neutral-100 rounded-lg p-0.5">
              {(["month", "quarter", "year"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => switchPeriod(p)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    period === p ? "bg-white shadow-sm font-medium" : "text-neutral-600 hover:text-neutral-900"
                  }`}
                >
                  {p === "month" ? "Mensual" : p === "quarter" ? "Trimestral" : "Anual"}
                </button>
              ))}
              <button
                onClick={() => setShowCustom((v) => !v)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  period === "custom" ? "bg-white shadow-sm font-medium" : "text-neutral-600 hover:text-neutral-900"
                }`}
              >
                📅 Personalizado
              </button>
            </div>
          </div>
        </div>

        {showCustom && (
          <div className="pl-2 mb-3 flex flex-wrap gap-2 items-end bg-neutral-50 border border-neutral-200 rounded-lg p-3 mx-2">
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5 uppercase">Desde</label>
              <input
                type="date"
                className="input text-sm w-auto"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5 uppercase">Hasta</label>
              <input
                type="date"
                className="input text-sm w-auto"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <button
              onClick={applyCustom}
              disabled={!fromDate || !toDate}
              className="btn btn-primary text-xs disabled:opacity-50"
            >
              Aplicar
            </button>
            {period === "custom" && (
              <button
                onClick={() => switchPeriod("month")}
                className="text-xs text-neutral-500 underline"
              >
                Volver a mensual
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 pl-2">
          <div>
            <div className="text-xs text-neutral-500 mb-1">Renovaciones</div>
            <div className="text-2xl font-semibold text-emerald-700">{renewals.renewed}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-1">No renovaciones</div>
            <div className="text-2xl font-semibold text-neutral-700">{renewals.lost}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-1">Tasa</div>
            <div className="text-2xl font-semibold">
              {renewals.rate !== null ? `${renewals.rate}%` : <span className="text-neutral-300">—</span>}
            </div>
            {renewals.total > 0 && (
              <div className="text-xs text-neutral-400 mt-0.5">
                sobre {renewals.total} {renewals.total === 1 ? "decisión" : "decisiones"}
              </div>
            )}
          </div>
        </div>
      </section>

      {perFisio.length > 0 && (
        <section className="card mb-5">
          <h2 className="font-medium text-sm mb-3">Métricas por profesional</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-neutral-500 uppercase border-b border-neutral-200">
                  <th className="text-left py-2 px-2 font-medium">Fisio</th>
                  <th className="text-right py-2 px-2 font-medium">Renov.</th>
                  <th className="text-right py-2 px-2 font-medium">Perdidas</th>
                  <th className="text-right py-2 px-2 font-medium">Tasa</th>
                  <th className="text-right py-2 px-2 font-medium">Cumplim.</th>
                </tr>
              </thead>
              <tbody>
                {perFisio.map((f) => (
                  <tr key={f.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="py-2 px-2">
                      <div className="font-medium">{f.fullName}</div>
                      <div className="text-[10px] text-neutral-500">
                        {f.role === "head_success" ? "⭐ Head-success" : "🩺 Fisio"}
                      </div>
                    </td>
                    <td className="text-right py-2 px-2 text-emerald-700">{f.renewed}</td>
                    <td className="text-right py-2 px-2 text-neutral-600">{f.lost}</td>
                    <td className="text-right py-2 px-2 font-medium">
                      {f.rate !== null ? `${f.rate}%` : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="text-right py-2 px-2">
                      {f.adherence !== null ? (
                        <span className={
                          f.adherence >= 80 ? "text-emerald-700" :
                          f.adherence >= 50 ? "text-amber-700" : "text-red-600"
                        }>{f.adherence}%</span>
                      ) : <span className="text-neutral-300">—</span>}
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
