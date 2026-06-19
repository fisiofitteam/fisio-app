import { getPeriodRange, getPreviousPeriodRange, type Period } from "@/lib/finance";
import {
  metaConfigured,
  getAdSpend,
  getDailySpend,
  getInstagramAccount,
  getDailyNewFollowers,
} from "@/lib/meta";
import { getTotalRevenue, getDailyRevenue } from "@/lib/business-revenue";
import { AdsSummaryPanel } from "@/components/AdsSummaryPanel";

export const dynamic = "force-dynamic";
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export default async function MetricasPage({ searchParams }: { searchParams: { period?: string } }) {
  const period: Period = (["day", "week", "month", "quarter", "year"].includes(searchParams.period ?? "")
    ? (searchParams.period as Period)
    : "month");
  const { start, end, label } = getPeriodRange(period);
  const prev = getPreviousPeriodRange(period);

  if (!metaConfigured()) {
    return (
      <div className="card text-sm text-neutral-600">
        Meta no está conectado. Configura las env vars de Meta en Vercel y vuelve aquí.
      </div>
    );
  }

  const safe = async <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

  // Pedimos UNA SOLA llamada de los últimos 30 días de seguidores (la API
  // limita a 30) y luego filtramos por rango para current/prev. Más limpio,
  // menos llamadas, y nos da los datos diarios para el gráfico de regalo.
  const [
    spendCurrent,
    spendPrev,
    dailySpend,
    igAccount,
    dailyFollowers,
    revenueCurrent,
    revenuePrev,
    dailyRevenue,
  ] = await Promise.all([
    safe(getAdSpend(ymd(start), ymd(end))),
    safe(getAdSpend(ymd(prev.start), ymd(prev.end))),
    safe(getDailySpend(ymd(start), ymd(end))),
    safe(getInstagramAccount()),
    safe(getDailyNewFollowers(30)),
    safe(getTotalRevenue(start, end)),
    safe(getTotalRevenue(prev.start, prev.end)),
    safe(getDailyRevenue(start, end)),
  ]);

  const startStr = ymd(start);
  const endStr = ymd(end);
  const prevStartStr = ymd(prev.start);
  const prevEndStr = ymd(prev.end);

  const sumInRange = (items: { date: string; value: number }[] | null, fromYmd: string, toYmd: string) => {
    if (!items) return 0;
    return items
      .filter((d) => d.date >= fromYmd && d.date <= toYmd)
      .reduce((a, v) => a + v.value, 0);
  };

  const newFollowers = sumInRange(dailyFollowers, startStr, endStr);
  // Solo calculamos newFollowersPrev si el rango anterior está dentro de los
  // últimos 30 días de datos. Si está fuera de ventana, lo dejamos null para
  // que la UI no muestre tendencia engañosa.
  const earliestData = dailyFollowers && dailyFollowers.length > 0 ? dailyFollowers[0].date : null;
  const prevWithinWindow = earliestData ? prevStartStr >= earliestData : false;
  const newFollowersPrev = prevWithinWindow ? sumInRange(dailyFollowers, prevStartStr, prevEndStr) : 0;

  return (
    <AdsSummaryPanel
      period={period}
      periodLabel={label}
      previousLabel={prev.label}
      spend={spendCurrent ?? 0}
      spendPrev={spendPrev ?? 0}
      newFollowers={newFollowers}
      newFollowersPrev={newFollowersPrev}
      followersTotal={igAccount?.followersCount ?? 0}
      igUsername={igAccount?.username ?? null}
      revenue={revenueCurrent ?? 0}
      revenuePrev={revenuePrev ?? 0}
      dailySpend={dailySpend ?? []}
      dailyFollowers={dailyFollowers ?? []}
      dailyRevenue={dailyRevenue ?? []}
    />
  );
}
