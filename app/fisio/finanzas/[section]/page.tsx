import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { resolveKpiMonth, resolveKpiYear } from "@/lib/kpi-period";
import { getKpiDashboardData } from "@/lib/kpi-dashboard";
import { computeBusinessMetrics, computeMonthlyBusinessMetrics } from "@/lib/business-metrics";
import { KpiPeriodNav } from "@/components/KpiPeriodNav";
import { KpiAnnualOverview } from "@/components/KpiAnnualOverview";
import { BusinessMetricsView } from "@/components/BusinessMetricsView";
import { KpiAcquisitionView, KpiHealthView, KpiPaymentsView, KpiDiagnosisView, KpiSourcesView } from "@/components/KpiDashboardViews";

export const dynamic = "force-dynamic";
const sections = {
  captacion: { title: "Captación", View: KpiAcquisitionView },
  salud: { title: "Salud del negocio", View: KpiHealthView },
  pagos: { title: "Pagos", View: KpiPaymentsView },
  diagnostico: { title: "Diagnóstico", View: KpiDiagnosisView },
  vias: { title: "Vías de captación", View: KpiSourcesView },
};

export default async function KpiSectionPage({ params, searchParams }: {
  params: { section: string };
  searchParams: { specificMonth?: string; year?: string };
}) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") redirect("/fisio");
  const period = resolveKpiMonth(searchParams.specificMonth);

  if (params.section === "anual") {
    const year = resolveKpiYear(searchParams.year, period.year);
    const [monthly, m, goalRows] = await Promise.all([
      computeMonthlyBusinessMetrics(year),
      computeBusinessMetrics(period.start, period.end),
      prisma.businessQuarterlyGoal.findMany({ where: { year }, select: { quarter: true, metricKey: true, value: true } }),
    ]);
    const goals: Record<string, Record<number, number>> = {};
    for (const goal of goalRows) (goals[goal.metricKey] ??= {})[goal.quarter] = goal.value;
    return <main>
      <KpiPeriodNav title="Anual" month={period.month} year={year} annual />
      <KpiAnnualOverview monthly={monthly} />
      <h3 className="text-sm font-medium mb-3">Histórico mensual y objetivos</h3>
      <BusinessMetricsView key={year} initialView="meses" hideYearControls monthlyOnly
        period="month" periodLabel={period.label} specificMonth={period.month}
        m={JSON.parse(JSON.stringify(m))} monthly={JSON.parse(JSON.stringify(monthly))} goals={goals} />
    </main>;
  }
  const section = sections[params.section as keyof typeof sections];
  if (!section) notFound();
  const data = await getKpiDashboardData(period.start, period.end);
  const View = section.View;
  return <main>
    <KpiPeriodNav title={section.title} month={period.month} year={period.year} />
    <View data={data} />
  </main>;
}
