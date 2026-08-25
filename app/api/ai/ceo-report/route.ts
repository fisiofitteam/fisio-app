/**
 * GET /api/ai/ceo-report — lista de informes CEO guardados.
 * DELETE /api/ai/ceo-report/[id] esta en el fichero [id]/route.ts.
 *
 * Query params:
 *   ?periodType=week|month|quarter|custom   (opcional, filtro)
 *   ?limit=20                                (default 20, max 100)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const periodType = searchParams.get("periodType");
  const limitRaw = Number(searchParams.get("limit") ?? "20");
  const limit = Math.max(1, Math.min(100, isNaN(limitRaw) ? 20 : limitRaw));

  const where: any = {};
  if (periodType && ["week", "month", "quarter", "custom"].includes(periodType)) {
    where.periodType = periodType;
  }

  const reports = await (prisma as any).ceoReport.findMany({
    where,
    orderBy: { periodStart: "desc" },
    take: limit,
    select: {
      id: true,
      periodType: true,
      periodStart: true,
      periodEnd: true,
      periodLabel: true,
      generatedAt: true,
    },
  });

  return NextResponse.json({ reports });
}
