"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type PerFisio = {
  id: string;
  fullName: string;
  role: string;
  patientsCount: number;
  renewed: number;
  lost: number;
  rate: number | null;
  adherence: number | null;
  // Nulos si no hay respuestas suficientes en el periodo.
  satisfactionAvg: number | null;
  npsAvg: number | null;
  responsesCount: number;
};

type SatisfactionKpis = {
  satisfactionAvg: number | null;
  npsAvg: number | null;
  responsesCount: number;
};

type Period = "month" | "quarter" | "year" | "custom";

type DetailRow = {
  patientId: string;
  patientName: string;
  programType: string | null;
  fisioId: string | null;
  fisioName: string | null;
  outcome: "renewed" | "lost";
  when: string;
  amountPaid: number | null;
};

type DetailFilter = {
  fisioId?: string;      // undefined = todo el equipo
  outcome?: "renewed" | "lost" | "all";
  title: string;
};

export function TeamMetricsBlock({
  period,
  periodLabel,
  from,
  to,
  renewals,
  perFisio,
  periodFrom,
  periodTo,
  satisfaction,
}: {
  period: Period;
  periodLabel: string;
  from: string;
  to: string;
  renewals: { renewed: number; lost: number; total: number; rate: number | null };
  perFisio: PerFisio[];
  // ISO YYYY-MM-DD del periodo actual — necesarios para llamar al detalle
  periodFrom: string;
  periodTo: string;
  // Satisfacción agregada del equipo (respuestas al formulario previo).
  // Null si aún no hay datos suficientes en el periodo.
  satisfaction?: SatisfactionKpis;
}) {
  const router = useRouter();
  const [showCustom, setShowCustom] = useState(period === "custom");
  const [fromDate, setFromDate] = useState(from || "");
  const [toDate, setToDate] = useState(to || "");
  const [detail, setDetail] = useState<DetailFilter | null>(null);

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
          <button
            onClick={() => renewals.renewed > 0 && setDetail({ outcome: "renewed", title: `Renovaciones del equipo · ${periodLabel}` })}
            disabled={renewals.renewed === 0}
            className="text-left group disabled:cursor-default"
            title={renewals.renewed > 0 ? "Ver detalle" : ""}
          >
            <div className="text-xs text-neutral-500 mb-1 flex items-center gap-1">
              Renovaciones
              {renewals.renewed > 0 && <span className="text-emerald-600 text-[10px] group-hover:underline">🔍</span>}
            </div>
            <div className={`text-2xl font-semibold text-emerald-700 ${renewals.renewed > 0 ? "group-hover:underline" : ""}`}>
              {renewals.renewed}
            </div>
          </button>
          <button
            onClick={() => renewals.lost > 0 && setDetail({ outcome: "lost", title: `No renovaciones del equipo · ${periodLabel}` })}
            disabled={renewals.lost === 0}
            className="text-left group disabled:cursor-default"
            title={renewals.lost > 0 ? "Ver detalle" : ""}
          >
            <div className="text-xs text-neutral-500 mb-1 flex items-center gap-1">
              No renovaciones
              {renewals.lost > 0 && <span className="text-neutral-500 text-[10px] group-hover:underline">🔍</span>}
            </div>
            <div className={`text-2xl font-semibold text-neutral-700 ${renewals.lost > 0 ? "group-hover:underline" : ""}`}>
              {renewals.lost}
            </div>
          </button>
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

        {satisfaction && (
          <div className="grid grid-cols-2 gap-3 pl-2 mt-4 pt-4 border-t border-neutral-100">
            <div>
              <div className="text-xs text-neutral-500 mb-1">Satisfacción media</div>
              <div className="text-2xl font-semibold text-blue-700">
                {satisfaction.satisfactionAvg !== null
                  ? <>{satisfaction.satisfactionAvg}<span className="text-sm text-neutral-400"> / 10</span></>
                  : <span className="text-neutral-300">—</span>}
              </div>
              {satisfaction.responsesCount > 0 && (
                <div className="text-xs text-neutral-400 mt-0.5">
                  sobre {satisfaction.responsesCount} {satisfaction.responsesCount === 1 ? "respuesta" : "respuestas"}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-neutral-500 mb-1">NPS medio del equipo</div>
              <div className="text-2xl font-semibold text-emerald-700">
                {satisfaction.npsAvg !== null
                  ? <>{satisfaction.npsAvg}<span className="text-sm text-neutral-400"> / 10</span></>
                  : <span className="text-neutral-300">—</span>}
              </div>
              {satisfaction.responsesCount > 0 && (
                <div className="text-xs text-neutral-400 mt-0.5">
                  del formulario previo a la llamada
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {perFisio.length > 0 && (
        <section className="card mb-5">
          <h2 className="font-medium text-sm mb-3">Métricas por profesional</h2>
          <p className="text-[11px] text-neutral-500 italic mb-2">
            🔍 Click en los números para ver el detalle.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-neutral-500 uppercase border-b border-neutral-200">
                  <th className="text-left py-2 px-2 font-medium">Fisio</th>
                  <th className="text-right py-2 px-2 font-medium">Renov.</th>
                  <th className="text-right py-2 px-2 font-medium">Perdidas</th>
                  <th className="text-right py-2 px-2 font-medium">Tasa</th>
                  <th className="text-right py-2 px-2 font-medium">Cumplim.</th>
                  <th className="text-right py-2 px-2 font-medium">Satisf.</th>
                  <th className="text-right py-2 px-2 font-medium">NPS</th>
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
                    <td className="text-right py-2 px-2">
                      {f.renewed > 0 ? (
                        <button
                          onClick={() => setDetail({ fisioId: f.id, outcome: "renewed", title: `Renovaciones · ${f.fullName} · ${periodLabel}` })}
                          className="text-emerald-700 hover:underline font-medium"
                        >
                          {f.renewed}
                        </button>
                      ) : (
                        <span className="text-neutral-400">0</span>
                      )}
                    </td>
                    <td className="text-right py-2 px-2">
                      {f.lost > 0 ? (
                        <button
                          onClick={() => setDetail({ fisioId: f.id, outcome: "lost", title: `No renovaciones · ${f.fullName} · ${periodLabel}` })}
                          className="text-neutral-700 hover:underline font-medium"
                        >
                          {f.lost}
                        </button>
                      ) : (
                        <span className="text-neutral-400">0</span>
                      )}
                    </td>
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
                    <td className="text-right py-2 px-2" title={f.responsesCount > 0 ? `${f.responsesCount} respuesta${f.responsesCount === 1 ? "" : "s"}` : ""}>
                      {f.satisfactionAvg !== null
                        ? <span className="font-medium text-blue-700">{f.satisfactionAvg}</span>
                        : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="text-right py-2 px-2" title={f.responsesCount > 0 ? `${f.responsesCount} respuesta${f.responsesCount === 1 ? "" : "s"}` : ""}>
                      {f.npsAvg !== null
                        ? <span className="font-medium text-emerald-700">{f.npsAvg}</span>
                        : <span className="text-neutral-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {detail && (
        <TeamRenewalsDetailModal
          filter={detail}
          from={periodFrom}
          to={periodTo}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}

// ─── Modal detalle ───────────────────────────────────────────────

function TeamRenewalsDetailModal({
  filter, from, to, onClose,
}: {
  filter: DetailFilter;
  from: string;
  to: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DetailRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const eur = (n: number) => `${n.toLocaleString("es-ES", { maximumFractionDigits: 0 })} €`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ from, to });
        if (filter.fisioId) params.set("fisioId", filter.fisioId);
        if (filter.outcome) params.set("outcome", filter.outcome);
        const res = await fetch(`/api/team-renewals?${params}`);
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(d?.error || `Error ${res.status}`);
          return;
        }
        setRows(d.rows ?? []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Error de red");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filter.fisioId, filter.outcome, from, to]);

  const renewedRows = rows.filter((r) => r.outcome === "renewed");
  const lostRows = rows.filter((r) => r.outcome === "lost");
  const totalAmount = renewedRows.reduce((s, r) => s + (r.amountPaid ?? 0), 0);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b sticky top-0 bg-white flex items-center justify-between z-10">
          <div>
            <h3 className="font-medium">{filter.title}</h3>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Atribuidas por fecha de decisión del follow-up.
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-400 text-xl px-2">✕</button>
        </div>

        <div className="p-4">
          {loading ? (
            <p className="text-sm text-neutral-400 italic py-6 text-center">Cargando…</p>
          ) : error ? (
            <p className="text-sm text-red-600 py-4">{error}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-neutral-400 italic py-6 text-center">
              No hay {filter.outcome === "renewed" ? "renovaciones" : filter.outcome === "lost" ? "pérdidas" : "movimientos"} en este periodo.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-neutral-500 uppercase border-b border-neutral-200">
                  <th className="text-left py-2 px-2 font-medium">Paciente</th>
                  <th className="text-left py-2 px-2 font-medium">Programa</th>
                  {!filter.fisioId && <th className="text-left py-2 px-2 font-medium">Fisio</th>}
                  <th className="text-right py-2 px-2 font-medium">Fecha</th>
                  <th className="text-right py-2 px-2 font-medium">
                    {filter.outcome === "lost" ? "" : "Importe"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.patientId}-${r.when}`} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="py-2 px-2">
                      <Link href={`/fisio/paciente/${r.patientId}/suscripcion`} className="hover:underline font-medium">
                        {r.patientName}
                      </Link>
                      {r.outcome === "lost" && (
                        <span className="ml-2 text-[9px] uppercase bg-red-100 text-red-800 px-1.5 py-0.5 rounded">Perdida</span>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {r.programType ? (
                        <span className="text-[10px] uppercase bg-neutral-100 text-neutral-700 border border-neutral-300 px-2 py-0.5 rounded-full font-medium">
                          {r.programType}
                        </span>
                      ) : (
                        <span className="text-neutral-400 text-xs">—</span>
                      )}
                    </td>
                    {!filter.fisioId && (
                      <td className="py-2 px-2 text-xs text-neutral-600">
                        {r.fisioName ?? <span className="text-neutral-400">—</span>}
                      </td>
                    )}
                    <td className="text-right py-2 px-2 text-xs text-neutral-600 whitespace-nowrap">
                      {fmtDate(r.when)}
                    </td>
                    <td className="text-right py-2 px-2 font-medium tabular-nums">
                      {r.outcome === "renewed" && r.amountPaid != null ? (
                        <span className="text-emerald-700">{eur(r.amountPaid)}</span>
                      ) : r.outcome === "lost" ? (
                        <span className="text-neutral-400">—</span>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {(renewedRows.length > 0 || filter.outcome !== "lost") && (
                <tfoot>
                  <tr className="border-t-2 border-neutral-300 font-semibold">
                    <td colSpan={filter.fisioId ? 3 : 4} className="py-2 px-2 text-right">
                      Total ({rows.length}{" "}
                      {filter.outcome === "renewed" ? "renovaciones" :
                       filter.outcome === "lost" ? "pérdidas" : "movimientos"})
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-emerald-700">
                      {totalAmount > 0 ? eur(totalAmount) : ""}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

