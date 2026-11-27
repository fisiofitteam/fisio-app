import { CeoAgentWorkspace } from "@/components/CeoAgentWorkspace";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { CeoReportsClient } from "@/components/CeoReportsClient";

export const dynamic = "force-dynamic";

export default async function CeoReportPage() {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    redirect("/fisio");
  }

  const reports = await (prisma as any).ceoReport.findMany({
    orderBy: { periodStart: "desc" },
    take: 40,
    select: {
      id: true,
      periodType: true,
      periodStart: true,
      periodEnd: true,
      periodLabel: true,
      generatedAt: true,
    },
  });

  const initialList = reports.map((r: any) => ({
    id: r.id,
    periodType: r.periodType,
    periodStart: r.periodStart.toISOString(),
    periodEnd: r.periodEnd.toISOString(),
    periodLabel: r.periodLabel,
    generatedAt: r.generatedAt.toISOString(),
  }));

  return <div className="space-y-5">
    <header><h2 className="text-xl font-semibold">Informes</h2>
      <p className="text-sm text-neutral-500 mt-1">Informes diarios, análisis por periodo e histórico del CEO IA.</p></header>
    {user.id === process.env.GROK_CEO_FOUNDER_ID && <CeoAgentWorkspace mode="reports" />}
    <CeoReportsClient initial={initialList} isFounder={user.id === process.env.GROK_CEO_FOUNDER_ID} />
  </div>;
}
