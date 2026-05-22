import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/patient-notifications?patientId=xxx
 * Devuelve las notificaciones NO leídas del paciente.
 */
export async function GET(req: NextRequest) {
  const patientId = req.nextUrl.searchParams.get("patientId");
  if (!patientId) return NextResponse.json({ error: "patientId required" }, { status: 400 });

  const notifications = await prisma.patientNotification.findMany({
    where: { patientId, readAt: null },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(notifications);
}

/**
 * POST /api/patient-notifications/read
 * Body: { id }
 * Marca una notificación como leída.
 */
export async function POST(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.patientNotification.update({
    where: { id },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
