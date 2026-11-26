import { NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { viewerReportMetrics } from "@/lib/ceo-direction-contract";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const row = await prisma.ceoReport.findFirst({ where: { periodType: "grok_daily" }, orderBy: { generatedAt: "desc" }, select: { id: true, periodLabel: true, generatedAt: true, narrative: true, metrics: true } });
  if (!row) return NextResponse.json({ report: null });
  try {
    const { metrics, narrative, ...meta } = row;
    let snapshot = null;
    try { snapshot = viewerReportMetrics(JSON.parse(metrics), user.id === process.env.GROK_CEO_FOUNDER_ID); } catch { /* legacy or malformed metrics */ }
    return NextResponse.json({ report: { ...meta, narrative: JSON.parse(narrative), metrics: snapshot } });
  }
  catch { return NextResponse.json({ report: null }); }
}
