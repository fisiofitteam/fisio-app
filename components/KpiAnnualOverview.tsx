import type { MonthlyMetrics } from "@/lib/business-metrics";

const euro = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function KpiAnnualOverview({ monthly }: { monthly: MonthlyMetrics }) {
  const { annual, months, year } = monthly;
  const max = Math.max(1, ...months.map((m) => Math.max(0, m.billed, m.income)));
  const cards = [
    { label: "Facturación", value: euro(annual.billed) },
    { label: "Recaudado", value: euro(annual.income) },
    { label: "Gastos", value: euro(annual.expense) },
    { label: "Resultado de caja", value: euro(annual.profit) },
    { label: "Altas nuevas", value: String(annual.altasCount) },
  ];
  return (
    <div className="mb-6 space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        {cards.map((card) => <div key={card.label} className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="text-xs text-neutral-500">{card.label}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{card.value}</div>
        </div>)}
      </div>
      <section className="card overflow-x-auto">
        <h3 className="mb-3 text-sm font-medium">Resumen trimestral · {year}</h3>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500"><tr><th className="px-3 py-2 text-left">Trimestre</th>{["Facturación", "Recaudado", "Gastos", "Resultado de caja", "Altas"].map((s) => <th className="px-3 py-2 text-right whitespace-nowrap" key={s}>{s}</th>)}</tr></thead>
          <tbody>{[0, 1, 2, 3].map((q) => {
            const rows = months.slice(q * 3, q * 3 + 3);
            const sum = (key: "billed" | "income" | "expense" | "profit" | "altasCount") => rows.reduce((total, row) => total + row[key], 0);
            return <tr key={q} className="border-b border-neutral-100"><td className="px-3 py-2">T{q + 1}</td>
              {(["billed", "income", "expense", "profit", "altasCount"] as const).map((key) => <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" key={key}>{key === "altasCount" ? sum(key) : euro(sum(key))}</td>)}
            </tr>;
          })}</tbody>
        </table>
      </section>
      <section className="card">
        <h3 className="text-sm font-medium mb-3">Facturación y recaudado mensual</h3>
        <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-sm bg-amber-400" />Facturación</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-sm bg-emerald-500" />Recaudado</span>
        </div>
        <div className="overflow-x-auto">
          <div className="grid grid-cols-12 gap-2 min-w-[780px]">
            {months.map((m) => <div key={m.month} className="text-center" title={`${names[m.month]} · Facturación: ${euro(m.billed)} · Recaudado: ${euro(m.income)}`}>
              <div className="h-36 flex items-end justify-center gap-1 border-b border-neutral-200" aria-hidden="true">
                <div className="w-5 rounded-t bg-amber-400" style={{ height: `${Math.max(0, m.billed) / max * 100}%`, minHeight: m.billed > 0 ? 2 : 0 }} />
                <div className="w-5 rounded-t bg-emerald-500" style={{ height: `${Math.max(0, m.income) / max * 100}%`, minHeight: m.income > 0 ? 2 : 0 }} />
              </div>
              <div className="mt-2 text-xs text-neutral-500">{names[m.month]}</div>
              <div className="mt-1 text-[10px] tabular-nums whitespace-nowrap text-amber-700"><span className="sr-only">Facturación: </span>{euro(m.billed)}</div>
              <div className="mt-0.5 text-[10px] tabular-nums whitespace-nowrap text-emerald-700"><span className="sr-only">Recaudado: </span>{euro(m.income)}</div>
            </div>)}
          </div>
        </div>
      </section>
      <p className="text-xs leading-5 text-neutral-500">La facturación cuenta cada contrato completo en el mes de la venta. El recaudado cuenta cada pago en el mes en que se recibe. El resultado de caja es recaudado menos gastos.</p>
    </div>
  );
}
