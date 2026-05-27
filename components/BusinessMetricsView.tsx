"use client";

import { useRouter } from "next/navigation";
import type { BusinessMetrics } from "@/lib/business-metrics";

type Period = "month" | "quarter" | "year";

const eur = (n: number) => `${n.toLocaleString("es-ES", { maximumFractionDigits: 0 })} €`;

export function BusinessMetricsView({ period, periodLabel, m }: { period: Period; periodLabel: string; m: BusinessMetrics }) {
  const router = useRouter();

  function switchPeriod(p: Period) {
    const url = new URL(window.location.href);
    url.searchParams.set("period", p);
    router.push(url.pathname + url.search);
    router.refresh();
  }

  return (
    <main>
      <div className="flex justify-between items-center flex-wrap gap-2 mb-4">
        <p className="text-xs text-neutral-500 capitalize">{periodLabel}</p>
        <div className="flex bg-neutral-100 rounded-lg p-0.5">
          {(["month", "quarter", "year"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => switchPeriod(p)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${period === p ? "bg-white shadow-sm font-medium" : "text-neutral-600 hover:text-neutral-900"}`}
            >
              {p === "month" ? "Mensual" : p === "quarter" ? "Trimestral" : "Anual"}
            </button>
          ))}
        </div>
      </div>

      {/* Resultado del período */}
      <Section title="Resultado del período">
        <Kpi label="Facturación" value={eur(m.income)} tone="emerald" />
        <Kpi label="Gastos" value={eur(m.expense)} tone="red" />
        <Kpi
          label="Beneficio"
          value={eur(m.profit)}
          tone={m.profit >= 0 ? "neutral" : "red"}
          sub={m.profitPct !== null ? `${m.profitPct >= 0 ? "+" : ""}${m.profitPct}% sobre ingresos` : undefined}
        />
      </Section>

      {/* Adquisición */}
      <Section title="Adquisición (período)">
        <Kpi label="Altas nuevas" value={String(m.newAltas)} sub={m.newSaleRevenue > 0 ? eur(m.newSaleRevenue) : undefined} />
        <Kpi label="Ticket medio" value={m.ticketAvg !== null ? eur(m.ticketAvg) : "—"} sub="por alta nueva" />
        <Kpi
          label="CAC"
          value={m.cac !== null ? eur(m.cac) : "—"}
          sub={`Marketing ${eur(m.marketingSpend)} + comisión ${eur(m.closerCommission)}`}
        />
      </Section>

      {/* Cliente / retención */}
      <Section title="Cliente y retención">
        <Kpi label="Pacientes activos" value={String(m.activePatients)} sub="suscripción vigente · actual" />
        <Kpi
          label="Tasa de renovación"
          value={m.renewalRate !== null ? `${m.renewalRate}%` : "—"}
          sub={m.renewedCount + m.lostCount > 0 ? `${m.renewedCount} renov · ${m.lostCount} baja` : "sin decisiones en el período"}
        />
        <Kpi
          label="LTV"
          value={m.ltv !== null ? eur(m.ltv) : "—"}
          tone="emerald"
          sub={m.ltvPatients > 0 ? `histórico · base ${m.ltvPatients} paciente${m.ltvPatients === 1 ? "" : "s"}` : "aún sin pacientes con pagos"}
        />
        <Kpi
          label="Ratio LTV / CAC"
          value={m.ltvCacRatio !== null ? `${m.ltvCacRatio}×` : "—"}
          tone={m.ltvCacRatio !== null && m.ltvCacRatio >= 3 ? "emerald" : m.ltvCacRatio !== null && m.ltvCacRatio < 1 ? "red" : "neutral"}
          sub="objetivo ≥ 3×"
        />
      </Section>

      <p className="text-[11px] text-neutral-400 mt-4 max-w-2xl">
        El LTV es histórico (todo el tiempo) y solo cuenta pacientes con pagos registrados en la app,
        por lo que se irá afinando a medida que entren altas nuevas y renovaciones. El CAC depende de
        que registréis el gasto de marketing en su categoría.
      </p>
    </main>
  );
}

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
