import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getPeriodRange, parseSpecificMonth, type Period } from "@/lib/finance";
import { computeBusinessMetrics, computeMonthlyBusinessMetrics } from "@/lib/business-metrics";
import { BusinessMetricsView } from "@/components/BusinessMetricsView";

export const dynamic = "force-dynamic";

export default async function MetricasNegocioPage({
  searchParams,
}: {
  searchParams: { period?: string; year?: string; specificMonth?: string };
}) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") redirect("/fisio");

  // Resolver rango: si viene specificMonth (YYYY-MM), se usa como mes histórico.
  // Si no, se cae al period normal (mes/trimestre/año actual).
  const specific = parseSpecificMonth(searchParams.specificMonth);
  const period: Period = (["month", "quarter", "year"].includes(searchParams.period ?? "")
    ? (searchParams.period as Period)
    : "month");
  const { start, end, label } = specific ?? getPeriodRange(period);
  const year = Number(searchParams.year) || new Date().getFullYear();

  const [m, monthly, goalRows] = await Promise.all([
    computeBusinessMetrics(start, end),
    computeMonthlyBusinessMetrics(year),
    prisma.businessQuarterlyGoal.findMany({ where: { year }, select: { quarter: true, metricKey: true, value: true } }),
  ]);

  // Mapa metricKey → { [quarter]: value }
  const goals: Record<string, Record<number, number>> = {};
  for (const g of goalRows) {
    (goals[g.metricKey] ??= {})[g.quarter] = g.value;
  }

  return (
    <BusinessMetricsView
      period={period}
      periodLabel={label}
      specificMonth={specific ? (searchParams.specificMonth ?? null) : null}
      m={JSON.parse(JSON.stringify(m))}
      monthly={JSON.parse(JSON.stringify(monthly))}
      goals={goals}
    />
  );
}
