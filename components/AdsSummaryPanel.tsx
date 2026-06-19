"use client";

import { useRouter, usePathname } from "next/navigation";

type DailyPoint = { date: string; spend: number };

const PERIODS = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "quarter", label: "Trimestre" },
  { value: "year", label: "Año" },
];

const eur = (n: number) => `${Math.round(n).toLocaleString("es-ES")} €`;
const eurDecimal = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const intl = (n: number) => Math.round(n).toLocaleString("es-ES");

function diffPct(curr: number, prev: number): { value: number; label: string; positive: boolean } | null {
  if (!prev) return null;
  const diff = ((curr - prev) / prev) * 100;
  const rounded = Math.round(diff);
  return {
    value: rounded,
    label: `${diff >= 0 ? "+" : ""}${rounded}%`,
    positive: diff >= 0,
  };
}

export function AdsSummaryPanel({
  period,
  periodLabel,
  previousLabel,
  spend,
  spendPrev,
  newFollowers,
  newFollowersPrev,
  followersTotal,
  igUsername,
  dailySpend,
}: {
  period: string;
  periodLabel: string;
  previousLabel: string;
  spend: number;
  spendPrev: number;
  newFollowers: number;
  newFollowersPrev: number;
  followersTotal: number;
  igUsername: string | null;
  dailySpend: DailyPoint[];
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/fisio/anuncios/metricas";

  function setPeriod(p: string) {
    const params = new URLSearchParams();
    if (p !== "month") params.set("period", p);
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  }

  // Coste por seguidor: gasto del periodo / nuevos seguidores del periodo.
  const costPerFollower = newFollowers > 0 ? spend / newFollowers : null;
  const costPerFollowerPrev = newFollowersPrev > 0 ? spendPrev / newFollowersPrev : null;

  const trendSpend = diffPct(spend, spendPrev);
  const trendNewFollowers = diffPct(newFollowers, newFollowersPrev);
  const trendCpf =
    costPerFollower !== null && costPerFollowerPrev !== null
      ? diffPct(costPerFollower, costPerFollowerPrev)
      : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-xs text-neutral-500">
          {periodLabel} <span className="text-neutral-400">vs {previousLabel}</span>
        </p>
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

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
        <Kpi label="Gasto" value={eur(spend)} trend={trendSpend} trendInvert />
        <Kpi label="Nuevos seguidores" value={intl(newFollowers)} trend={trendNewFollowers} />
        <Kpi
          label="Coste por seguidor"
          value={costPerFollower !== null ? eurDecimal(costPerFollower) : "—"}
          trend={trendCpf}
          trendInvert
        />
        <Kpi
          label="Total seguidores"
          value={intl(followersTotal)}
          sublabel={igUsername ? `@${igUsername}` : undefined}
        />
      </section>

      <section className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-sm">📈 Evolución diaria del gasto</h3>
          <span className="text-[10px] text-neutral-400">{dailySpend.length} días</span>
        </div>
        {dailySpend.length === 0 ? (
          <p className="text-xs text-neutral-400 italic text-center py-8">
            Sin gasto en este periodo.
          </p>
        ) : (
          <DailyChart data={dailySpend} />
        )}
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  sublabel,
  trend,
  trendInvert,
}: {
  label: string;
  value: string;
  sublabel?: string;
  trend?: { value: number; label: string; positive: boolean } | null;
  trendInvert?: boolean;
}) {
  // trendInvert: cuando subir es MALO (gasto, coste por seg). En esos casos,
  // "positive" (subió) lo pintamos rojo. Cuando no invierte (seguidores),
  // "positive" lo pintamos verde.
  const goodTrend = trend ? (trendInvert ? !trend.positive : trend.positive) : false;
  return (
    <div className="card !p-3">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
      <div className="flex items-center gap-1.5 mt-0.5">
        {sublabel && <span className="text-[10px] text-neutral-400">{sublabel}</span>}
        {trend && (
          <span className={`text-[10px] font-medium ${goodTrend ? "text-emerald-700" : "text-red-600"}`}>
            {trend.label}
          </span>
        )}
      </div>
    </div>
  );
}

function DailyChart({ data }: { data: DailyPoint[] }) {
  const maxSpend = Math.max(...data.map((d) => d.spend), 0);
  if (maxSpend === 0) {
    return <p className="text-xs text-neutral-400 italic text-center py-8">Sin gasto en estos días.</p>;
  }
  // Render como barras CSS sencillas (sin SVG): fila por día con barra horizontal.
  // Para periodos largos compactamos a un grid en formato bar chart vertical.
  return (
    <div className="space-y-1">
      <div className="flex items-end gap-0.5 h-32">
        {data.map((d) => {
          const h = Math.max(2, Math.round((d.spend / maxSpend) * 120));
          return (
            <div
              key={d.date}
              className="flex-1 flex flex-col items-center justify-end group relative"
              title={`${d.date}: ${eurDecimal(d.spend)}`}
            >
              <div
                className="w-full bg-neutral-800 rounded-t group-hover:bg-emerald-600 transition-colors"
                style={{ height: `${h}px` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-neutral-400 px-0.5">
        <span>{formatShort(data[0]?.date)}</span>
        <span>Máx día: {eurDecimal(maxSpend)}</span>
        <span>{formatShort(data[data.length - 1]?.date)}</span>
      </div>
    </div>
  );
}

function formatShort(iso: string | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  } catch {
    return iso;
  }
}
