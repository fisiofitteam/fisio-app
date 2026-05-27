"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BusinessMetrics, MonthlyMetrics, MonthlyRow } from "@/lib/business-metrics";

type Period = "month" | "quarter" | "year";

const eur = (n: number) => `${n.toLocaleString("es-ES", { maximumFractionDigits: 0 })} €`;
const MONTH_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function BusinessMetricsView({
  period, periodLabel, m, monthly,
}: {
  period: Period;
  periodLabel: string;
  m: BusinessMetrics;
  monthly: MonthlyMetrics;
}) {
  const router = useRouter();
  const [view, setView] = useState<"resumen" | "meses">("resumen");

  function setQuery(key: string, value: string) {
    const url = new URL(window.location.href);
    url.searchParams.set(key, value);
    router.push(url.pathname + url.search);
    router.refresh();
  }

  return (
    <main>
      {/* Toggle de vista */}
      <div className="flex gap-2 mb-4">
        {(["resumen", "meses"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              view === v ? "bg-neutral-900 text-white" : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            {v === "resumen" ? "Resumen" : "Por meses"}
          </button>
        ))}
      </div>

      {view === "resumen" ? (
        <ResumenView period={period} periodLabel={periodLabel} m={m} onPeriod={(p) => setQuery("period", p)} />
      ) : (
        <MesesView monthly={monthly} onYear={(y) => setQuery("year", String(y))} />
      )}
    </main>
  );
}

/* ─────────────────────────── RESUMEN ─────────────────────────── */

function ResumenView({ period, periodLabel, m, onPeriod }: { period: Period; periodLabel: string; m: BusinessMetrics; onPeriod: (p: Period) => void }) {
  return (
    <>
      <div className="flex justify-between items-center flex-wrap gap-2 mb-4">
        <p className="text-xs text-neutral-500 capitalize">{periodLabel}</p>
        <div className="flex bg-neutral-100 rounded-lg p-0.5">
          {(["month", "quarter", "year"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => onPeriod(p)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${period === p ? "bg-white shadow-sm font-medium" : "text-neutral-600 hover:text-neutral-900"}`}
            >
              {p === "month" ? "Mensual" : p === "quarter" ? "Trimestral" : "Anual"}
            </button>
          ))}
        </div>
      </div>

      <Section title="Resultado del período">
        <Kpi label="Facturación" value={eur(m.income)} tone="emerald" />
        <Kpi label="Gastos" value={eur(m.expense)} tone="red" />
        <Kpi label="Beneficio" value={eur(m.profit)} tone={m.profit >= 0 ? "neutral" : "red"} sub={m.profitPct !== null ? `${m.profitPct >= 0 ? "+" : ""}${m.profitPct}% sobre ingresos` : undefined} />
      </Section>

      <Section title="Adquisición (período)">
        <Kpi label="Altas nuevas" value={String(m.newAltas)} sub={m.newSaleRevenue > 0 ? eur(m.newSaleRevenue) : undefined} />
        <Kpi label="Ticket medio" value={m.ticketAvg !== null ? eur(m.ticketAvg) : "—"} sub="por alta nueva" />
        <Kpi label="CAC" value={m.cac !== null ? eur(m.cac) : "—"} sub={`Marketing ${eur(m.marketingSpend)} + comisión ${eur(m.closerCommission)}`} />
      </Section>

      <Section title="Cliente y retención">
        <Kpi label="Pacientes activos" value={String(m.activePatients)} sub="suscripción vigente · actual" />
        <Kpi label="Tasa de renovación" value={m.renewalRate !== null ? `${m.renewalRate}%` : "—"} sub={m.renewedCount + m.lostCount > 0 ? `${m.renewedCount} renov · ${m.lostCount} baja` : "sin decisiones en el período"} />
        <Kpi label="LTV" value={m.ltv !== null ? eur(m.ltv) : "—"} tone="emerald" sub={m.ltvPatients > 0 ? `histórico · base ${m.ltvPatients} paciente${m.ltvPatients === 1 ? "" : "s"}` : "aún sin pacientes con pagos"} />
        <Kpi label="Ratio LTV / CAC" value={m.ltvCacRatio !== null ? `${m.ltvCacRatio}×` : "—"} tone={m.ltvCacRatio !== null && m.ltvCacRatio >= 3 ? "emerald" : m.ltvCacRatio !== null && m.ltvCacRatio < 1 ? "red" : "neutral"} sub="objetivo ≥ 3×" />
      </Section>

      <p className="text-[11px] text-neutral-400 mt-4 max-w-2xl">
        El LTV es histórico y solo cuenta pacientes con pagos registrados en la app (se irá afinando).
        El CAC depende de registrar el gasto de marketing en su categoría.
      </p>
    </>
  );
}

/* ─────────────────────────── POR MESES ─────────────────────────── */

type RowDef = { label: string; get: (r: MonthlyRow | Omit<MonthlyRow, "month">) => number | null; fmt: "money" | "int" | "pct" };

const BLOCKS: { title: string; rows: RowDef[] }[] = [
  {
    title: "Ventas (Convertir)",
    rows: [
      { label: "Altas nuevas", get: (r) => r.altasCount, fmt: "int" },
      { label: "Renovaciones", get: (r) => r.renewedCount, fmt: "int" },
      { label: "Bajas", get: (r) => r.lostCount, fmt: "int" },
    ],
  },
  {
    title: "Finanzas (Recoger)",
    rows: [
      { label: "Facturación total", get: (r) => r.income, fmt: "money" },
      { label: "— de altas nuevas", get: (r) => r.incomeNew, fmt: "money" },
      { label: "— de renovaciones", get: (r) => r.incomeRenewal, fmt: "money" },
      { label: "Gastos totales", get: (r) => r.expense, fmt: "money" },
      { label: "Beneficio", get: (r) => r.profit, fmt: "money" },
      { label: "% beneficio", get: (r) => r.profitPct, fmt: "pct" },
    ],
  },
  {
    title: "Servicio (Entregar)",
    rows: [{ label: "% renovación", get: (r) => r.renewalRate, fmt: "pct" }],
  },
];

function fmtVal(v: number | null, fmt: "money" | "int" | "pct"): string {
  if (v === null) return "—";
  if (fmt === "money") return eur(v);
  if (fmt === "pct") return `${v}%`;
  return String(v);
}

function MesesView({ monthly, onYear }: { monthly: MonthlyMetrics; onYear: (y: number) => void }) {
  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => onYear(monthly.year - 1)} className="text-sm px-2.5 py-1 border border-neutral-200 rounded hover:bg-neutral-50">←</button>
        <span className="text-sm font-medium">{monthly.year}</span>
        <button onClick={() => onYear(monthly.year + 1)} className="text-sm px-2.5 py-1 border border-neutral-200 rounded hover:bg-neutral-50">→</button>
      </div>

      <section className="card p-0 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              <th className="text-left py-2 px-3 font-medium text-xs text-neutral-500 sticky left-0 bg-neutral-50 z-10 min-w-[150px]">Métrica</th>
              {MONTH_ABBR.map((mo) => (
                <th key={mo} className="text-right py-2 px-2 font-medium text-xs text-neutral-500 whitespace-nowrap">{mo}</th>
              ))}
              <th className="text-right py-2 px-3 font-bold text-xs text-neutral-700 whitespace-nowrap border-l-2 border-neutral-300 bg-neutral-100">Anual</th>
            </tr>
          </thead>
          <tbody>
            {BLOCKS.map((block) => (
              <BlockRows key={block.title} block={block} months={monthly.months} annual={monthly.annual} />
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function BlockRows({ block, months, annual }: { block: { title: string; rows: RowDef[] }; months: MonthlyRow[]; annual: Omit<MonthlyRow, "month"> }) {
  return (
    <>
      <tr>
        <td colSpan={14} className="bg-amber-50 text-amber-900 font-semibold text-xs uppercase tracking-wide py-1.5 px-3 sticky left-0">
          {block.title}
        </td>
      </tr>
      {block.rows.map((row) => (
        <tr key={row.label} className="border-b border-neutral-100">
          <td className="py-2 px-3 text-neutral-700 sticky left-0 bg-white z-10 whitespace-nowrap">{row.label}</td>
          {months.map((mo) => (
            <td key={mo.month} className="py-2 px-2 text-right tabular-nums text-neutral-700 whitespace-nowrap">
              {fmtVal(row.get(mo), row.fmt)}
            </td>
          ))}
          <td className="py-2 px-3 text-right tabular-nums font-semibold border-l-2 border-neutral-300 bg-neutral-50 whitespace-nowrap">
            {fmtVal(row.get(annual), row.fmt)}
          </td>
        </tr>
      ))}
    </>
  );
}

/* ─────────────────────────── helpers ─────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="text-xs uppercase tracking-wide text-neutral-500 font-medium mb-2">{title}</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{children}</div>
    </section>
  );
}

function Kpi({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: string; tone?: "neutral" | "emerald" | "red" }) {
  const color = tone === "emerald" ? "text-emerald-700" : tone === "red" ? "text-red-700" : "text-neutral-900";
  return (
    <div className="card">
      <div className="text-xs text-neutral-500 mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-neutral-400 mt-0.5">{sub}</div>}
    </div>
  );
}
