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

type Row = MonthlyRow | Omit<MonthlyRow, "month">;
type RowDef = { label: string; get: (r: Row) => number | null; fmt: "money" | "int" | "pct" };

function fmtVal(v: number | null, fmt: "money" | "int" | "pct"): string {
  if (v === null) return "—";
  if (fmt === "money") return eur(v);
  if (fmt === "pct") return `${v}%`;
  return String(v);
}

function prettyProgram(p: string): string {
  if (p === "Sin programa") return p;
  return p.charAt(0) + p.slice(1).toLowerCase();
}

function MesesView({ monthly, onYear }: { monthly: MonthlyMetrics; onYear: (y: number) => void }) {
  const { months, annual, programTypes, year } = monthly;

  const ventasRows: RowDef[] = [
    ...programTypes.map((prog) => ({ label: `Altas · ${prettyProgram(prog)}`, get: (r: Row) => r.altasByProgram[prog] ?? 0, fmt: "int" as const })),
    { label: "Altas (total)", get: (r: Row) => r.altasCount, fmt: "int" },
    { label: "Renovaciones", get: (r: Row) => r.renewedCount, fmt: "int" },
    { label: "Bajas", get: (r: Row) => r.lostCount, fmt: "int" },
  ];
  const finanzasRows: RowDef[] = [
    { label: "Facturación total", get: (r) => r.income, fmt: "money" },
    { label: "— de altas nuevas", get: (r) => r.incomeNew, fmt: "money" },
    { label: "— de renovaciones", get: (r) => r.incomeRenewal, fmt: "money" },
    { label: "Gastos totales", get: (r) => r.expense, fmt: "money" },
    { label: "Beneficio", get: (r) => r.profit, fmt: "money" },
    { label: "% beneficio", get: (r) => r.profitPct, fmt: "pct" },
  ];
  const servicioRows: RowDef[] = [{ label: "% renovación", get: (r) => r.renewalRate, fmt: "pct" }];

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => onYear(year - 1)} className="text-sm px-2.5 py-1 border border-neutral-200 rounded hover:bg-neutral-50">←</button>
        <span className="text-sm font-medium">{year}</span>
        <button onClick={() => onYear(year + 1)} className="text-sm px-2.5 py-1 border border-neutral-200 rounded hover:bg-neutral-50">→</button>
      </div>

      <section className="card p-0 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              <th className="text-left py-2 px-3 font-medium text-xs text-neutral-500 sticky left-0 bg-neutral-50 z-10 min-w-[170px]">Métrica</th>
              {MONTH_ABBR.map((mo) => (
                <th key={mo} className="text-right py-2 px-2 font-medium text-xs text-neutral-500 whitespace-nowrap">{mo}</th>
              ))}
              <th className="text-right py-2 px-3 font-bold text-xs text-neutral-700 whitespace-nowrap border-l-2 border-neutral-300 bg-neutral-100">Anual</th>
            </tr>
          </thead>
          <tbody>
            <PublicidadRows year={year} months={months} />
            <BlockRows title="Ventas (Convertir)" rows={ventasRows} months={months} annual={annual} />
            <BlockRows title="Finanzas (Recoger)" rows={finanzasRows} months={months} annual={annual} />
            <BlockRows title="Servicio (Entregar)" rows={servicioRows} months={months} annual={annual} />
          </tbody>
        </table>
      </section>
      <p className="text-[11px] text-neutral-400 mt-2">
        Las filas de Publicidad son editables (escribe y sal de la celda para guardar). La inversión ADS alimenta el CAC del resumen.
      </p>
    </>
  );
}

function BlockHeader({ title }: { title: string }) {
  return (
    <tr>
      <td colSpan={14} className="bg-amber-50 text-amber-900 font-semibold text-xs uppercase tracking-wide py-1.5 px-3 sticky left-0">
        {title}
      </td>
    </tr>
  );
}

function BlockRows({ title, rows, months, annual }: { title: string; rows: RowDef[]; months: MonthlyRow[]; annual: Omit<MonthlyRow, "month"> }) {
  return (
    <>
      <BlockHeader title={title} />
      {rows.map((row) => (
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

// Bloque Publicidad con celdas editables (datos manuales).
type ManualField = "newFollowers" | "adsSpend" | "totalFollowers";
function PublicidadRows({ year, months }: { year: number; months: MonthlyRow[] }) {
  const [vals, setVals] = useState(() =>
    months.map((m) => ({ newFollowers: m.newFollowers, adsSpend: m.adsSpend, totalFollowers: m.totalFollowers }))
  );

  function setCell(month: number, field: ManualField, raw: string) {
    setVals((arr) => arr.map((v, i) => (i === month ? { ...v, [field]: raw === "" ? null : Number(raw) } : v)));
  }
  async function save(month: number, field: ManualField, raw: string) {
    await fetch("/api/business-metrics/inputs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month, [field]: raw === "" ? null : Number(raw) }),
    }).catch(() => {});
  }

  const sum = (f: ManualField) => vals.reduce((a, v) => a + (v[f] ?? 0), 0);
  const lastTotal = [...vals].reverse().find((v) => v.totalFollowers != null)?.totalFollowers ?? null;
  const totalAds = sum("adsSpend");
  const totalNew = sum("newFollowers");
  const annualCost = totalAds && totalNew ? Math.round((totalAds / totalNew) * 100) / 100 : null;

  const FIELDS: { key: ManualField; label: string }[] = [
    { key: "newFollowers", label: "Nuevos seguidores" },
    { key: "adsSpend", label: "Inversión ADS (€)" },
    { key: "totalFollowers", label: "Seguidores totales" },
  ];

  return (
    <>
      <BlockHeader title="Publicidad (Atraer)" />
      {FIELDS.map((f) => (
        <tr key={f.key} className="border-b border-neutral-100">
          <td className="py-1.5 px-3 text-neutral-700 sticky left-0 bg-white z-10 whitespace-nowrap">{f.label}</td>
          {months.map((mo) => (
            <td key={mo.month} className="py-1 px-1 text-right">
              <input
                type="number"
                value={vals[mo.month][f.key] ?? ""}
                onChange={(e) => setCell(mo.month, f.key, e.target.value)}
                onBlur={(e) => save(mo.month, f.key, e.target.value)}
                className="w-16 text-right tabular-nums bg-transparent border border-transparent hover:border-neutral-200 focus:border-neutral-400 rounded px-1 py-0.5 outline-none text-xs"
              />
            </td>
          ))}
          <td className="py-1.5 px-3 text-right tabular-nums font-semibold border-l-2 border-neutral-300 bg-neutral-50 whitespace-nowrap">
            {f.key === "totalFollowers" ? (lastTotal ?? "—") : f.key === "adsSpend" ? eur(sum("adsSpend")) : sum("newFollowers")}
          </td>
        </tr>
      ))}
      {/* Coste por seguidor (auto) */}
      <tr className="border-b border-neutral-100">
        <td className="py-2 px-3 text-neutral-500 sticky left-0 bg-white z-10 whitespace-nowrap italic">Coste por seguidor</td>
        {months.map((mo) => {
          const v = vals[mo.month];
          const cps = v.adsSpend != null && v.newFollowers ? Math.round((v.adsSpend / v.newFollowers) * 100) / 100 : null;
          return (
            <td key={mo.month} className="py-2 px-2 text-right tabular-nums text-neutral-500 text-xs whitespace-nowrap">
              {cps != null ? `${cps.toLocaleString("es-ES")} €` : "—"}
            </td>
          );
        })}
        <td className="py-2 px-3 text-right tabular-nums font-semibold text-neutral-500 border-l-2 border-neutral-300 bg-neutral-50 whitespace-nowrap">
          {annualCost != null ? `${annualCost.toLocaleString("es-ES")} €` : "—"}
        </td>
      </tr>
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
