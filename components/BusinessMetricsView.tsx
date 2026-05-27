"use client";

import { useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import type { BusinessMetrics, MonthlyMetrics, MonthlyRow } from "@/lib/business-metrics";

type Period = "month" | "quarter" | "year";

const eur = (n: number) => `${n.toLocaleString("es-ES", { maximumFractionDigits: 0 })} €`;
const MONTH_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function BusinessMetricsView({
  period, periodLabel, m, monthly, goals,
}: {
  period: Period;
  periodLabel: string;
  m: BusinessMetrics;
  monthly: MonthlyMetrics;
  goals: Record<string, Record<number, number>>;
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
        <MesesView monthly={monthly} goals={goals} onYear={(y) => setQuery("year", String(y))} />
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
        <Kpi label="CAC" value={m.cac !== null ? eur(m.cac) : "—"} sub={`ADS ${eur(m.marketingSpend)} + comisión ${eur(m.closerCommission)} + sueldo ${eur(m.closerSalary)}`} />
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

function MesesView({ monthly, goals, onYear }: { monthly: MonthlyMetrics; goals: Record<string, Record<number, number>>; onYear: (y: number) => void }) {
  const { months, annual, programTypes, year } = monthly;

  const ventasRows: RowDef[] = [
    { label: "Altas (total)", get: (r: Row) => r.altasCount, fmt: "int" },
    ...programTypes.map((prog) => ({ label: `Altas · ${prettyProgram(prog)}`, get: (r: Row) => r.altasByProgram[prog] ?? 0, fmt: "int" as const })),
    { label: "Renovaciones", get: (r: Row) => r.renewedCount, fmt: "int" },
    { label: "Bajas", get: (r: Row) => r.lostCount, fmt: "int" },
  ];
  const finanzasRows: RowDef[] = [
    { label: "Facturación total", get: (r) => r.income, fmt: "money" },
    { label: "— de altas nuevas", get: (r) => r.incomeNew, fmt: "money" },
    ...programTypes.map((prog) => ({ label: `— altas · ${prettyProgram(prog)}`, get: (r: Row) => r.altasRevenueByProgram[prog] ?? 0, fmt: "money" as const })),
    { label: "— de renovaciones", get: (r) => r.incomeRenewal, fmt: "money" },
    { label: "Gastos totales", get: (r) => r.expense, fmt: "money" },
    { label: "Beneficio", get: (r) => r.profit, fmt: "money" },
    { label: "% beneficio", get: (r) => r.profitPct, fmt: "pct" },
  ];
  const servicioRows: RowDef[] = [
    { label: "Clientes a renovar", get: (r) => r.renewedCount + r.lostCount, fmt: "int" },
    { label: "% renovación", get: (r) => r.renewalRate, fmt: "pct" },
  ];

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
            <EditableSingleRow year={year} months={months} field="refunds" label="Devoluciones" />
          </tbody>
        </table>
      </section>
      <p className="text-[11px] text-neutral-400 mt-2">
        Las filas de Publicidad son editables (escribe y sal de la celda para guardar). La inversión ADS alimenta el CAC del resumen.
      </p>

      <GoalsSection year={year} months={months} goals={goals} />
    </>
  );
}

// ─── Objetivos trimestrales (REAL vs GOAL) ───
type GoalMetric = { key: string; label: string; fmt: "money" | "int" | "pct"; higherBetter: boolean; real: (q: MonthlyRow[]) => number | null };

const sumBy = (q: MonthlyRow[], f: (r: MonthlyRow) => number) => q.reduce((a, r) => a + f(r), 0);

const GOAL_METRICS: GoalMetric[] = [
  { key: "altasCount", label: "Altas nuevas", fmt: "int", higherBetter: true, real: (q) => sumBy(q, (r) => r.altasCount) },
  { key: "income", label: "Facturación total", fmt: "money", higherBetter: true, real: (q) => sumBy(q, (r) => r.income) },
  { key: "incomeNew", label: "Facturación · altas", fmt: "money", higherBetter: true, real: (q) => sumBy(q, (r) => r.incomeNew) },
  { key: "incomeRenewal", label: "Facturación · renovaciones", fmt: "money", higherBetter: true, real: (q) => sumBy(q, (r) => r.incomeRenewal) },
  { key: "expense", label: "Gastos", fmt: "money", higherBetter: false, real: (q) => sumBy(q, (r) => r.expense) },
  { key: "profit", label: "Beneficio", fmt: "money", higherBetter: true, real: (q) => sumBy(q, (r) => r.profit) },
  { key: "profitPct", label: "% beneficio", fmt: "pct", higherBetter: true, real: (q) => { const i = sumBy(q, (r) => r.income); return i > 0 ? Math.round((sumBy(q, (r) => r.profit) / i) * 100) : null; } },
  { key: "renewalRate", label: "% renovación", fmt: "pct", higherBetter: true, real: (q) => { const d = sumBy(q, (r) => r.renewedCount + r.lostCount); return d > 0 ? Math.round((sumBy(q, (r) => r.renewedCount) / d) * 100) : null; } },
  { key: "lostCount", label: "Bajas", fmt: "int", higherBetter: false, real: (q) => sumBy(q, (r) => r.lostCount) },
  { key: "refunds", label: "Devoluciones", fmt: "int", higherBetter: false, real: (q) => sumBy(q, (r) => r.refunds ?? 0) },
  { key: "newFollowers", label: "Nuevos seguidores", fmt: "int", higherBetter: true, real: (q) => sumBy(q, (r) => r.newFollowers ?? 0) },
];

const QUARTERS = [1, 2, 3, 4];
const QMONTHS: Record<number, number[]> = { 1: [0, 1, 2], 2: [3, 4, 5], 3: [6, 7, 8], 4: [9, 10, 11] };

function GoalsSection({ year, months, goals }: { year: number; months: MonthlyRow[]; goals: Record<string, Record<number, number>> }) {
  const [g, setG] = useState(goals);

  async function saveGoal(metricKey: string, quarter: number, raw: string) {
    setG((prev) => {
      const next = { ...prev, [metricKey]: { ...(prev[metricKey] ?? {}) } };
      if (raw === "") delete next[metricKey][quarter];
      else next[metricKey][quarter] = Number(raw);
      return next;
    });
    await fetch("/api/business-metrics/goals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, quarter, metricKey, value: raw === "" ? null : Number(raw) }),
    }).catch(() => {});
  }

  return (
    <section className="mt-6">
      <h2 className="text-xs uppercase tracking-wide text-neutral-500 font-medium mb-2">Objetivos por trimestre (REAL vs GOAL)</h2>
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              <th className="text-left py-2 px-3 font-medium text-xs text-neutral-500 sticky left-0 bg-neutral-50 z-10 min-w-[170px]">Métrica</th>
              {QUARTERS.map((q) => (
                <th key={q} className="text-center py-2 px-3 font-medium text-xs text-neutral-500" colSpan={2}>T{q}</th>
              ))}
              <th className="text-center py-2 px-3 font-bold text-xs text-neutral-700 border-l-2 border-neutral-300 bg-neutral-100" colSpan={2}>Anual</th>
            </tr>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-[10px] text-neutral-400 uppercase">
              <th className="sticky left-0 bg-neutral-50 z-10"></th>
              {QUARTERS.map((q) => (
                <Fragment key={q}>
                  <th className="text-right py-1 px-2 font-medium">Real</th>
                  <th className="text-right py-1 px-2 font-medium border-r border-neutral-200">Goal</th>
                </Fragment>
              ))}
              <th className="text-right py-1 px-2 font-medium border-l-2 border-neutral-300 bg-neutral-100">Real</th>
              <th className="text-right py-1 px-2 font-medium bg-neutral-100">Goal</th>
            </tr>
          </thead>
          <tbody>
            {GOAL_METRICS.map((gm) => (
              <tr key={gm.key} className="border-b border-neutral-100">
                <td className="py-2 px-3 text-neutral-700 sticky left-0 bg-white z-10 whitespace-nowrap">{gm.label}</td>
                {QUARTERS.map((q) => {
                  const qMonths = QMONTHS[q].map((i) => months[i]);
                  const real = gm.real(qMonths);
                  const goal = g[gm.key]?.[q] ?? null;
                  const meets = real != null && goal != null ? (gm.higherBetter ? real >= goal : real <= goal) : null;
                  const realColor = meets === null ? "text-neutral-700" : meets ? "text-emerald-700" : "text-red-700";
                  return (
                    <Fragment key={q}>
                      <td className={`py-2 px-2 text-right tabular-nums font-medium ${realColor} whitespace-nowrap`}>
                        {fmtVal(real, gm.fmt)}
                      </td>
                      <td className="py-1 px-1 text-right border-r border-neutral-200">
                        <input
                          type="number"
                          defaultValue={goal ?? ""}
                          onBlur={(e) => { if (e.target.value !== String(goal ?? "")) saveGoal(gm.key, q, e.target.value); }}
                          className="w-16 text-right tabular-nums bg-transparent border border-transparent hover:border-neutral-200 focus:border-neutral-400 rounded px-1 py-0.5 outline-none text-xs text-neutral-500"
                        />
                      </td>
                    </Fragment>
                  );
                })}
                {(() => {
                  const real = gm.real(months);
                  const goal = g[gm.key]?.[0] ?? null;
                  const meets = real != null && goal != null ? (gm.higherBetter ? real >= goal : real <= goal) : null;
                  const realColor = meets === null ? "text-neutral-900" : meets ? "text-emerald-700" : "text-red-700";
                  return (
                    <>
                      <td className={`py-2 px-2 text-right tabular-nums font-semibold ${realColor} whitespace-nowrap border-l-2 border-neutral-300 bg-neutral-50`}>
                        {fmtVal(real, gm.fmt)}
                      </td>
                      <td className="py-1 px-1 text-right bg-neutral-50">
                        <input
                          type="number"
                          defaultValue={goal ?? ""}
                          onBlur={(e) => { if (e.target.value !== String(goal ?? "")) saveGoal(gm.key, 0, e.target.value); }}
                          className="w-16 text-right tabular-nums bg-transparent border border-transparent hover:border-neutral-200 focus:border-neutral-400 rounded px-1 py-0.5 outline-none text-xs text-neutral-500"
                        />
                      </td>
                    </>
                  );
                })()}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-neutral-400 mt-2">
        Escribe el objetivo de cada trimestre (y el anual) y se compara con el REAL (verde = cumplido, rojo = no). En Gastos, Bajas y Devoluciones, cumplir es quedar por debajo.
      </p>
    </section>
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
type ManualField = "newFollowers" | "adsSpend" | "adsConversion" | "totalFollowers";
function PublicidadRows({ year, months }: { year: number; months: MonthlyRow[] }) {
  const [vals, setVals] = useState(() =>
    months.map((m) => ({ newFollowers: m.newFollowers, adsSpend: m.adsSpend, adsConversion: m.adsConversion, totalFollowers: m.totalFollowers }))
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
  // Coste por seguidor = Follow me ADs / nuevos seguidores
  const totalFollowAds = sum("adsSpend");
  const totalNew = sum("newFollowers");
  const annualCost = totalFollowAds && totalNew ? Math.round((totalFollowAds / totalNew) * 100) / 100 : null;

  const FIELDS: { key: ManualField; label: string; money?: boolean }[] = [
    { key: "newFollowers", label: "Nuevos seguidores" },
    { key: "adsSpend", label: "Follow me ADs (€)", money: true },
    { key: "adsConversion", label: "Conversión ADs (€)", money: true },
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
            {f.key === "totalFollowers" ? (lastTotal ?? "—") : f.money ? eur(sum(f.key)) : sum(f.key)}
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

// Fila editable de un único dato manual (ej. Devoluciones). Anual = suma.
function EditableSingleRow({ year, months, field, label, money = false }: { year: number; months: MonthlyRow[]; field: string; label: string; money?: boolean }) {
  const [vals, setVals] = useState<(number | null)[]>(() => months.map((m) => (m as any)[field] ?? null));

  function setCell(month: number, raw: string) {
    setVals((arr) => arr.map((v, i) => (i === month ? (raw === "" ? null : Number(raw)) : v)));
  }
  async function save(month: number, raw: string) {
    await fetch("/api/business-metrics/inputs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month, [field]: raw === "" ? null : Number(raw) }),
    }).catch(() => {});
  }
  const total = vals.reduce((a, v) => a + (v ?? 0), 0);

  return (
    <tr className="border-b border-neutral-100">
      <td className="py-1.5 px-3 text-neutral-700 sticky left-0 bg-white z-10 whitespace-nowrap">{label}</td>
      {months.map((mo) => (
        <td key={mo.month} className="py-1 px-1 text-right">
          <input
            type="number"
            value={vals[mo.month] ?? ""}
            onChange={(e) => setCell(mo.month, e.target.value)}
            onBlur={(e) => save(mo.month, e.target.value)}
            className="w-16 text-right tabular-nums bg-transparent border border-transparent hover:border-neutral-200 focus:border-neutral-400 rounded px-1 py-0.5 outline-none text-xs"
          />
        </td>
      ))}
      <td className="py-1.5 px-3 text-right tabular-nums font-semibold border-l-2 border-neutral-300 bg-neutral-50 whitespace-nowrap">
        {money ? eur(total) : total}
      </td>
    </tr>
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
