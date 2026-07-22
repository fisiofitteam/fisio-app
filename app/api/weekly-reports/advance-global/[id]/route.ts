/**
 * PATCH /api/weekly-reports/advance-global/[id]
 *   body: { action: "dismiss" | "restore" }
 * Solo CEO/head_success.
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || (user.role !== "ceo" && user.role !== "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  if (action !== "dismiss" && action !== "restore") {
    return NextResponse.json({ error: "action requerido" }, { status: 400 });
  }
  const updated = await (prisma as any).advanceWeeklySummary.update({
    where: { id: params.id },
    data: action === "dismiss"
      ? { dismissedAt: new Date(), dismissedById: user.id }
      : { dismissedAt: null, dismissedById: null },
  }).catch(() => null);
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, summary: updated });
}
