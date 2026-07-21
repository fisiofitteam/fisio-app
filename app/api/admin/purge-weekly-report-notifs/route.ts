/**
 * POST /api/admin/purge-weekly-report-notifs
 *   → borra TeamNotification con type="weekly_report_ready" (todas las que
 *     se generaron con el bug de "una notificacion por paciente"). El nuevo
 *     generador solo emite una agregada por fisio.
 *
 * GET → dry-run: cuenta cuantas se borrarian sin borrar.
 *
 * Solo CEO / head_success.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo" && user.role !== "head_success") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const count = await prisma.teamNotification.count({ where: { type: "weekly_report_ready" } });
  return NextResponse.json({ mode: "dry-run", wouldDelete: count });
}

export async function POST(_req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo" && user.role !== "head_success") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { count } = await prisma.teamNotification.deleteMany({
    where: { type: "weekly_report_ready" },
  });
  return NextResponse.json({ mode: "applied", deleted: count });
}
