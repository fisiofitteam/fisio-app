/**
 * GET /api/weekly-reports/advance-global?week=YYYY-MM-DD
 *   → devuelve el AdvanceWeeklySummary de esa semana (o la anterior si no
 *     se pasa week). Solo visible para CEO/head_success.
 *
 * PATCH /api/weekly-reports/advance-global/[id]
 *   → gestionado en /[id]/route.ts para dismiss/restore.
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { weekStartUtc } from "@/lib/weekly-reports";

export const dynamic = "force-dynamic";

function isManager(role: string): boolean {
  return role === "ceo" || role === "head_success";
}

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !isManager(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const weekParam = sp.get("week");
  let monday: Date;
  if (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
    monday = weekStartUtc(new Date(weekParam + "T12:00:00.000Z"));
  } else {
    const cur = weekStartUtc(new Date());
    monday = new Date(cur);
    monday.setUTCDate(monday.getUTCDate() - 7);
  }

  const includeDismissed = sp.get("includeDismissed") === "1";
  const where: any = { weekStartDate: monday };
  if (!includeDismissed) where.dismissedAt = null;

  const summary = await (prisma as any).advanceWeeklySummary.findFirst({ where });
  return NextResponse.json({ week: monday.toISOString(), summary });
}
