/**
 * GET /api/ai/ceo-report/[id] — devuelve un informe con metrics + narrative parseados.
 * DELETE /api/ai/ceo-report/[id] — borra un informe (solo CEO).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const report = await (prisma as any).ceoReport.findUnique({ where: { id: params.id } });
  if (!report) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  let metrics: any = null, narrative: any = null;
  try { metrics = JSON.parse(report.metrics); } catch { /* ignore */ }
  try { narrative = JSON.parse(report.narrative); } catch { /* ignore */ }

  return NextResponse.json({
    id: report.id,
    periodType: report.periodType,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    periodLabel: report.periodLabel,
    generatedAt: report.generatedAt,
    metrics,
    narrative,
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await (prisma as any).ceoReport.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
