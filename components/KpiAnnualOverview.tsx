import type { MonthlyMetrics } from "@/lib/business-metrics";

const euro = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function KpiAnnualOverview({ monthly }: { monthly: MonthlyMetrics }) {
  const { annual, months, year } = monthly;
  const max = Math.max(1, ...months.map((m) => Math.max(0, m.income)));
  const cards = [
    { label: "Facturación", value: euro(annual.income) },
    { label: "Gastos", value: euro(annual.expense) },
    { label: "Beneficio", value: euro(annual.profit) },
    { label: "Altas registradas", value: String(annual.altasCount) },
  ];
  return (
    <div className="mb-6 space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => <div key={card.label} className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="text-xs text-neutral-500">{card.label}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{card.value}</div>
        </div>)}
      </div>
      <section className="card overflow-x-auto">
        <h3 className="mb-3 text-sm font-medium">Resumen trimestral · {year}</h3>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500"><tr><th className="px-3 py-2 text-left">Trimestre</th>{["Facturación", "Gastos", "Beneficio", "Altas"].map((s) => <th className="px-3 py-2 text-right" key={s}>{s}</th>)}</tr></thead>
          <tbody>{[0, 1, 2, 3].map((q) => {
            const rows = months.slice(q * 3, q * 3 + 3);
            const sum = (key: "income" | "expense" | "profit" | "altasCount") => rows.reduce((total, row) => total + row[key], 0);
            return <tr key={q} className="border-b border-neutral-100"><td className="px-3 py-2">T{q + 1}</td>
              {(["income", "expense", "profit", "altasCount"] as const).map((key) => <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" key={key}>{key === "altasCount" ? sum(key) : euro(sum(key))}</td>)}
            </tr>;
          })}</tbody>
        </table>
      </section>
      <section className="card">
        <h3 className="text-sm font-medium mb-4">Facturación mensual</h3>
        <div className="overflow-x-auto">
          <div className="grid grid-cols-12 gap-2 min-w-[600px]">
            {months.map((m) => <div key={m.month} className="text-center" title={`${names[m.month]}: ${euro(m.income)}`}>
              <div className="h-36 flex items-end justify-center border-b border-neutral-200">
                <div className="w-full max-w-10 rounded-t bg-amber-400" style={{ height: `${Math.max(0, m.income) / max * 100}%`, minHeight: m.income > 0 ? 2 : 0 }} />
              </div>
              <div className="mt-2 text-xs text-neutral-500">{names[m.month]}</div>
              <div className="mt-1 text-[10px] tabular-nums whitespace-nowrap">{euro(m.income)}</div>
            </div>)}
          </div>
        </div>
      </section>
    </div>
  );
}
