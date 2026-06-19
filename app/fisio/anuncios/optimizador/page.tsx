import { prisma } from "@/lib/prisma";
import { OptimizerView } from "@/components/OptimizerView";

export const dynamic = "force-dynamic";

export default async function OptimizadorPage() {
  const last = await prisma.adOptimizerRun.findFirst({ orderBy: { createdAt: "desc" } });
  let initial: {
    id: string;
    period: string;
    summary: string;
    recommendations: any[];
    createdAt: string;
  } | null = null;
  if (last) {
    let recs: any[] = [];
    try { recs = JSON.parse(last.recommendations); } catch { recs = []; }
    initial = {
      id: last.id,
      period: last.period,
      summary: last.summary,
      recommendations: Array.isArray(recs) ? recs : [],
      createdAt: last.createdAt.toISOString(),
    };
  }
  return <OptimizerView initial={initial} />;
}
