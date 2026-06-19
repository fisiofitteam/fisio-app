import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canManageAds } from "@/lib/ads";
import { runOptimizer } from "@/lib/ads-optimizer";
import { type Period } from "@/lib/finance";

/** GET: devuelve el último run guardado. */
export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canManageAds(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const last = await prisma.adOptimizerRun.findFirst({ orderBy: { createdAt: "desc" } });
  if (!last) return NextResponse.json({ run: null });
  let recs: any[] = [];
  try { recs = JSON.parse(last.recommendations); } catch { recs = []; }
  return NextResponse.json({
    run: {
      id: last.id,
      period: last.period,
      summary: last.summary,
      recommendations: Array.isArray(recs) ? recs : [],
      createdAt: last.createdAt.toISOString(),
    },
  });
}

/**
 * POST: ejecuta el análisis on-demand. Body: { period?: "day"|"week"|"month"|"quarter"|"year" }.
 * Delega en `runOptimizer` (compartido con el cron diario).
 */
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageAds(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const data = await req.json().catch(() => ({}));
  const period: Period = ["day", "week", "month", "quarter", "year"].includes(data?.period) ? data.period : "day";

  try {
    const r = await runOptimizer(period, user.id);
    return NextResponse.json({
      run: {
        id: r.runId,
        period: r.period,
        summary: r.summary,
        recommendations: r.recommendations,
        createdAt: r.createdAt.toISOString(),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Error inesperado" }, { status: 500 });
  }
}
