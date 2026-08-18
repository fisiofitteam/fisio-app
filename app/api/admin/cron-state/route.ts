/**
 * GET /api/admin/cron-state
 * Devuelve el estado de la última ejecución de cada cron registrado.
 * Solo CEO/head_success. Útil para diagnóstico: si un cron nunca aparece,
 * es que Vercel no lo está disparando (mira `hasCronSecret` para ver si
 * la env está configurada).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo" && user.role !== "head_success") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const runs = await (prisma as any).cronRunState.findMany({ orderBy: { lastRunAt: "desc" } });
  return NextResponse.json({
    hasCronSecret: !!process.env.CRON_SECRET,
    nowUtc: new Date().toISOString(),
    runs: runs.map((r: any) => ({
      cron: r.id,
      lastRunAt: r.lastRunAt.toISOString(),
      lastRunAgoMin: Math.round((Date.now() - r.lastRunAt.getTime()) / 60000),
      lastOk: r.lastOk,
      lastError: r.lastError,
      lastResult: (() => { try { return JSON.parse(r.lastResultJson ?? "null"); } catch { return r.lastResultJson; } })(),
      totalRuns: r.totalRuns,
      totalOk: r.totalOk,
    })),
  });
}
