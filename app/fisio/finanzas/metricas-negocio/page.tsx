import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { getPeriodRange, type Period } from "@/lib/finance";
import { computeBusinessMetrics, computeMonthlyBusinessMetrics } from "@/lib/business-metrics";
import { BusinessMetricsView } from "@/components/BusinessMetricsView";

export const dynamic = "force-dynamic";

export default async function MetricasNegocioPage({ searchParams }: { searchParams: { period?: string; year?: string } }) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") redirect("/fisio");

  const period: Period = (["month", "quarter", "year"].includes(searchParams.period ?? "")
    ? (searchParams.period as Period)
    : "month");
  const { start, end, label } = getPeriodRange(period);
  const year = Number(searchParams.year) || new Date().getFullYear();

  const [m, monthly] = await Promise.all([
    computeBusinessMetrics(start, end),
    computeMonthlyBusinessMetrics(year),
  ]);

  return (
    <BusinessMetricsView
      period={period}
      periodLabel={label}
      m={JSON.parse(JSON.stringify(m))}
      monthly={JSON.parse(JSON.stringify(monthly))}
    />
  );
}
