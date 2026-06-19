"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { computeRoas } from "@/lib/ads-roas";

type Row = {
  metaId: string;
  name: string;
  localId: string | null;
  spend: number;
  reach: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  results: number;
  costPerResult: number | null;
  leadsAttr: number;
  wonAttr: number;
  revenueAttr: number;
  roasReal: number;
  cacReal: number | null;
};

type Totals = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  won: number;
  revenue: number;
};

const PERIODS: { value: "month" | "quarter" | "year"; label: string }[] = [
  { value: "month", label: "Mes" },
  { value: "quarter", label: "Trimestre" },
  { value: "year", label: "Año" },
];

const eur = (n: number) => `${Math.round(n).toLocaleString("es-ES")} €`;
const intl = (n: number) => Math.round(n).toLocaleString("es-ES");

export function AdsMetricsPanel({
  period,
  periodLabel,
  rows,
  totals,
  error,
}: {
  period: "month" | "quarter" | "year";
  periodLabel: string;
  rows: Row[];
  totals: Totals;
  error: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/fisio/anuncios/metricas";

  function setPeriod(p: string) {
    const params = new URLSearchParams();
    if (p !== "month") params.set("period", p);
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  }

  const totalRoas = computeRoas(totals.spend, totals.revenue);

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-xs text-neutral-500">{periodLabel}</p>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`text-xs px-2.5 py-1 rounded-md border ${
                period === p.value ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="card text-sm text-red-700 mb-3 bg-red-50 border border-red-200">
          ⚠️ Meta devolvió un error: {error}
        </div>
      )}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <Kpi label="Gasto" value={eur(totals.spend)} />
        <Kpi label="Leads atribuidos" value={intl(totals.leads)} />
        <Kpi label="Ventas atribuidas" value={intl(totals.won)} />
        <Kpi label="ROAS real" value={`${totalRoas}×`} highlight={totalRoas >= 2} />
      </section>

      <section className="card">
        <h3 className="font-medium text-sm mb-2">Por campaña</h3>
        {rows.length === 0 ? (
          <p className="text-xs text-neutral-400 italic text-center py-8">
            No hay campañas con gasto en este periodo.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-neutral-400 border-b border-neutral-100">
                <tr>
                  <th className="py-2 pr-2">Campaña</th>
                  <th className="py-2 px-2 text-right">Gasto</th>
                  <th className="py-2 px-2 text-right">Impr.</th>
                  <th className="py-2 px-2 text-right">CTR</th>
                  <th className="py-2 px-2 text-right">CPC</th>
                  <th className="py-2 px-2 text-right">Leads</th>
                  <th className="py-2 px-2 text-right">Ventas</th>
                  <th className="py-2 px-2 text-right">Revenue</th>
                  <th className="py-2 px-2 text-right">ROAS</th>
                  <th className="py-2 pl-2 text-right">CAC</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.metaId} className="border-b border-neutral-50 last:border-0">
                    <td className="py-2 pr-2">
                      <div className="font-medium">
                        {r.localId ? (
                          <Link href={`/fisio/anuncios/campanas?focus=${r.localId}`} className="hover:underline">
                            {r.name}
                          </Link>
                        ) : (
                          <span>{r.name}</span>
                        )}
                      </div>
                      {!r.localId && (
                        <span className="text-[10px] text-amber-700">no enlazada en el sistema</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{eur(r.spend)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{intl(r.impressions)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.ctr.toFixed(2)}%</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.cpc.toFixed(2)}€</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.leadsAttr}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.wonAttr}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{eur(r.revenueAttr)}</td>
                    <td className={`py-2 px-2 text-right tabular-nums font-medium ${r.roasReal >= 2 ? "text-emerald-700" : r.roasReal > 0 ? "text-amber-700" : "text-neutral-400"}`}>
                      {r.roasReal ? `${r.roasReal}×` : "—"}
                    </td>
                    <td className="py-2 pl-2 text-right tabular-nums">
                      {r.cacReal ? eur(r.cacReal) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-neutral-400 mt-3">
          ROAS y CAC reales se calculan cruzando leads atribuidos vía <code className="bg-neutral-100 px-1 rounded">utm_campaign</code> con sus ventas (modelo Sale).
          Si una campaña no se enlaza, comprueba que el nombre en Meta coincida con tu campaña local o pega su ID en el campo "ID de Meta" del editor.
        </p>
      </section>
    </div>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`card !p-3 ${highlight ? "bg-emerald-50 border-emerald-200" : ""}`}>
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
}
