import { getPeriodRange, getPreviousPeriodRange, type Period } from "@/lib/finance";
import {
  metaConfigured,
  getAdSpend,
  getDailySpend,
  getInstagramAccount,
  getNewFollowers,
} from "@/lib/meta";
import { AdsSummaryPanel } from "@/components/AdsSummaryPanel";

export const dynamic = "force-dynamic";
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const daysBetween = (a: Date, b: Date) =>
  Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);

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

  // Tolerante a fallos: si Meta devuelve error en algún campo, lo absorbemos.
  const safe = async <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

  const days = daysBetween(start, end);

  // Para nuevos seguidores del periodo ANTERIOR, usamos el truco de pedir el
  // total acumulado de `days + daysPrev` días y restarle los `days` del actual.
  // La API de Meta no permite rango arbitrario; sólo "últimos N días".
  const daysPrev = daysBetween(prev.start, prev.end);
  const [
    spendCurrent,
    spendPrev,
    dailySpend,
    igAccount,
    newFollowers,
    cumulativeForPrev,
  ] = await Promise.all([
    safe(getAdSpend(ymd(start), ymd(end))),
    safe(getAdSpend(ymd(prev.start), ymd(prev.end))),
    safe(getDailySpend(ymd(start), ymd(end))),
    safe(getInstagramAccount()),
    safe(getNewFollowers(days)),
    safe(getNewFollowers(days + daysPrev)),
  ]);

  const newFollowersPrev =
    cumulativeForPrev !== null && newFollowers !== null
      ? Math.max(0, cumulativeForPrev - newFollowers)
      : null;

  return (
    <AdsSummaryPanel
      period={period}
      periodLabel={label}
      previousLabel={prev.label}
      spend={spendCurrent ?? 0}
      spendPrev={spendPrev ?? 0}
      newFollowers={newFollowers ?? 0}
      newFollowersPrev={newFollowersPrev ?? 0}
      followersTotal={igAccount?.followersCount ?? 0}
      igUsername={igAccount?.username ?? null}
      dailySpend={dailySpend ?? []}
    />
  );
}
