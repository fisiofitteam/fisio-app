import { NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const row = await prisma.ceoReport.findFirst({ where: { periodType: "grok_daily" }, orderBy: { generatedAt: "desc" }, select: { id: true, periodLabel: true, generatedAt: true, narrative: true } });
  if (!row) return NextResponse.json({ report: null });
  try { return NextResponse.json({ report: { ...row, narrative: JSON.parse(row.narrative) } }); }
  catch { return NextResponse.json({ report: null }); }
}
