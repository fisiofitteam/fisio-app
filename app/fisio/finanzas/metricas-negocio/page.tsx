import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { getPeriodRange, type Period } from "@/lib/finance";
import { computeBusinessMetrics } from "@/lib/business-metrics";
import { BusinessMetricsView } from "@/components/BusinessMetricsView";

export const dynamic = "force-dynamic";

export default async function MetricasNegocioPage({ searchParams }: { searchParams: { period?: string } }) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") redirect("/fisio");

  const period: Period = (["month", "quarter", "year"].includes(searchParams.period ?? "")
    ? (searchParams.period as Period)
    : "month");
  const { start, end, label } = getPeriodRange(period);
  const m = await computeBusinessMetrics(start, end);

  return <BusinessMetricsView period={period} periodLabel={label} m={JSON.parse(JSON.stringify(m))} />;
}
