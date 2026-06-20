"use client";

import { useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";

type DailySpend = { date: string; spend: number };
type DailyFollowers = { date: string; value: number };
type DailyRevenue = { date: string; revenue: number };

const PERIODS = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "quarter", label: "Trimestre" },
  { value: "year", label: "Año" },
];

const eur = (n: number) => `${Math.round(n).toLocaleString("es-ES")} €`;
const eurDecimal = (n: number) =>
  `${(Math.round(n * 100) / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
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
  revenue,
  revenuePrev,
  dailySpend,
  dailyFollowers,
  dailyRevenue,
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
  revenue: number;
  revenuePrev: number;
  dailySpend: DailySpend[];
  dailyFollowers: DailyFollowers[];
  dailyRevenue: DailyRevenue[];
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/fisio/anuncios/metricas";

  function setPeriod(p: string) {
    const params = new URLSearchParams();
    if (p !== "month") params.set("period", p);
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  }

  const costPerFollower = newFollowers > 0 ? spend / newFollowers : null;
  const costPerFollowerPrev = newFollowersPrev > 0 ? spendPrev / newFollowersPrev : null;
  const roas = spend > 0 ? revenue / spend : null;
  const roasPrev = spendPrev > 0 ? revenuePrev / spendPrev : null;

  const trendSpend = diffPct(spend, spendPrev);
  const trendNewFollowers = diffPct(newFollowers, newFollowersPrev);
  const trendCpf =
    costPerFollower !== null && costPerFollowerPrev !== null
      ? diffPct(costPerFollower, costPerFollowerPrev)
      : null;
  const trendRoas = roas !== null && roasPrev !== null ? diffPct(roas, roasPrev) : null;

  const series = useMemo(
    () => buildSeries(dailySpend, dailyFollowers, dailyRevenue),
    [dailySpend, dailyFollowers, dailyRevenue],
  );

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

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
        <Kpi label="Gasto" value={eur(spend)} trend={trendSpend} trendInvert />
        <Kpi label="Nuevos seguidores" value={intl(newFollowers)} trend={trendNewFollowers} />
        <Kpi
          label="Coste / seguidor"
          value={costPerFollower !== null ? eurDecimal(costPerFollower) : "—"}
          trend={trendCpf}
          trendInvert
        />
        <Kpi
          label="ROAS nuevas altas"
          value={roas !== null ? `${(Math.round(roas * 100) / 100).toLocaleString("es-ES")}×` : "—"}
          trend={trendRoas}
          sublabel="Ingresos nuevas altas / Gasto ads"
        />
        <Kpi
          label="Total seguidores"
          value={intl(followersTotal)}
          sublabel={igUsername ? `@${igUsername}` : undefined}
        />
      </section>

      <section className="card">
        <h3 className="font-medium text-sm mb-3">📈 Evolución diaria</h3>
        {series.dates.length === 0 ? (
          <p className="text-xs text-neutral-400 italic text-center py-8">Sin datos en este periodo.</p>
        ) : (
          <div className="space-y-4">
            <SparkLine
              label="Gasto en ads"
              color="#0A0A0A"
              dates={series.dates}
              values={series.spend}
              format={(v) => eurDecimal(v)}
              summaryLabel="Total"
              summaryValue={eur(spend)}
            />
            <SparkLine
              label="Coste por seguidor"
              color="#7C3AED"
              dates={series.dates}
              values={series.cpf}
              format={(v) => eurDecimal(v)}
              summaryLabel="Medio"
              summaryValue={costPerFollower !== null ? eurDecimal(costPerFollower) : "—"}
              skipZero
            />
            <SparkLine
              label="ROAS nuevas altas"
              color="#059669"
              dates={series.dates}
              values={series.roas}
              format={(v) => `${(Math.round(v * 100) / 100).toLocaleString("es-ES")}×`}
              summaryLabel="Medio"
              summaryValue={
                roas !== null
                  ? `${(Math.round(roas * 100) / 100).toLocaleString("es-ES")}×`
                  : "—"
              }
              skipZero
            />
          </div>
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

/** Une las tres series diarias en un calendario común. */
function buildSeries(
  spend: DailySpend[],
  followers: DailyFollowers[],
  revenue: DailyRevenue[],
): { dates: string[]; spend: number[]; cpf: number[]; roas: number[] } {
  const all = new Set<string>();
  spend.forEach((d) => all.add(d.date));
  followers.forEach((d) => all.add(d.date));
  revenue.forEach((d) => all.add(d.date));
  const dates = Array.from(all).sort();

  const spendMap = new Map(spend.map((d) => [d.date, d.spend]));
  const followersMap = new Map(followers.map((d) => [d.date, d.value]));
  const revenueMap = new Map(revenue.map((d) => [d.date, d.revenue]));

  const spendArr = dates.map((d) => spendMap.get(d) ?? 0);
  const cpf = dates.map((d) => {
    const s = spendMap.get(d) ?? 0;
    const f = followersMap.get(d) ?? 0;
    return f > 0 ? s / f : 0;
  });
  const roas = dates.map((d) => {
    const s = spendMap.get(d) ?? 0;
    const r = revenueMap.get(d) ?? 0;
    return s > 0 ? r / s : 0;
  });
  return { dates, spend: spendArr, cpf, roas };
}

/**
 * Gráfico de línea SVG con ejes X (fechas) e Y (valores) visibles.
 * skipZero: ignora días con valor 0 para el rango y los huecos en la línea.
 */
function SparkLine({
  label,
  color,
  dates,
  values,
  format,
  summaryLabel,
  summaryValue,
  skipZero = false,
}: {
  label: string;
  color: string;
  dates: string[];
  values: number[];
  format: (v: number) => string;
  summaryLabel: string;
  summaryValue: string;
  skipZero?: boolean;
}) {
  // Layout del gráfico.
  const W = 800;
  const H = 220;
  const PAD_LEFT = 56;
  const PAD_RIGHT = 12;
  const PAD_TOP = 12;
  const PAD_BOTTOM = 28;
  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_TOP - PAD_BOTTOM;

  const nonZero = skipZero ? values.filter((v) => v > 0) : values;
  const minRaw = nonZero.length > 0 ? Math.min(...nonZero) : 0;
  const maxRaw = nonZero.length > 0 ? Math.max(...nonZero) : 1;

  // Padding del rango para que la línea respire arriba/abajo.
  const span = Math.max(maxRaw - minRaw, 1);
  const minV = Math.max(0, minRaw - span * 0.1);
  const maxV = maxRaw + span * 0.1;
  const range = maxV - minV || 1;

  const x = (i: number) =>
    values.length === 1
      ? PAD_LEFT + chartW / 2
      : PAD_LEFT + (i / Math.max(values.length - 1, 1)) * chartW;
  const y = (v: number): number | null => {
    if (skipZero && v === 0) return null;
    return PAD_TOP + chartH - ((v - minV) / range) * chartH;
  };

  // Path con huecos (segments).
  const segments: string[] = [];
  let cur = "";
  for (let i = 0; i < values.length; i++) {
    const yi = y(values[i]);
    if (yi === null) {
      if (cur) { segments.push(cur); cur = ""; }
      continue;
    }
    cur += `${cur ? "L" : "M"} ${x(i).toFixed(1)} ${yi.toFixed(1)} `;
  }
  if (cur) segments.push(cur);

  // Ticks Y: 5 niveles.
  const yTicks = 5;
  const yTickValues: number[] = [];
  for (let i = 0; i <= yTicks; i++) {
    yTickValues.push(minV + (range * i) / yTicks);
  }

  // Ticks X: 5 fechas espaciadas.
  const xTickCount = Math.min(6, dates.length);
  const xTickIdxs: number[] = [];
  if (dates.length > 0) {
    for (let i = 0; i < xTickCount; i++) {
      const idx = Math.round((i / Math.max(xTickCount - 1, 1)) * (dates.length - 1));
      if (!xTickIdxs.includes(idx)) xTickIdxs.push(idx);
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-medium text-neutral-700 flex items-center gap-1.5">
          <span className="w-3 h-0.5 inline-block" style={{ background: color }} />
          {label}
        </span>
        <span className="text-[11px] text-neutral-500">
          {summaryLabel}: <span className="font-medium text-neutral-900">{summaryValue}</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-44">
        {/* Gridlines + Y labels */}
        {yTickValues.map((tv, i) => {
          const py = PAD_TOP + chartH - ((tv - minV) / range) * chartH;
          return (
            <g key={`y-${i}`}>
              <line
                x1={PAD_LEFT}
                x2={W - PAD_RIGHT}
                y1={py}
                y2={py}
                stroke="#E5E5E5"
                strokeWidth={1}
                strokeDasharray={i === 0 ? "" : "3 3"}
              />
              <text
                x={PAD_LEFT - 6}
                y={py + 3}
                textAnchor="end"
                fontSize="10"
                fill="#737373"
              >
                {format(tv)}
              </text>
            </g>
          );
        })}

        {/* X ticks (fechas) */}
        {xTickIdxs.map((idx) => (
          <g key={`x-${idx}`}>
            <line
              x1={x(idx)}
              x2={x(idx)}
              y1={PAD_TOP + chartH}
              y2={PAD_TOP + chartH + 4}
              stroke="#A3A3A3"
              strokeWidth={1}
            />
            <text
              x={x(idx)}
              y={PAD_TOP + chartH + 16}
              textAnchor="middle"
              fontSize="10"
              fill="#737373"
            >
              {formatShort(dates[idx])}
            </text>
          </g>
        ))}

        {/* Línea principal */}
        {segments.map((path, i) => (
          <path key={`line-${i}`} d={path} fill="none" stroke={color} strokeWidth="2" />
        ))}

        {/* Puntos con tooltip */}
        {values.map((v, i) => {
          const yi = y(v);
          if (yi === null) return null;
          return (
            <circle key={`pt-${i}`} cx={x(i)} cy={yi} r="2.5" fill={color}>
              <title>{`${dates[i]}: ${format(v)}`}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}

function formatShort(iso: string | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}
