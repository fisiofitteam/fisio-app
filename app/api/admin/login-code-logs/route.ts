/**
 * GET /api/admin/login-code-logs?email=... — devuelve los últimos códigos
 * de login enviados a ese email (o los últimos 30 en general si no se pasa
 * email). Muestra sentOk, sentError, sentTo, consumed, expiresAt y
 * createdAt para que el CEO pueda diagnosticar rápido cuando un paciente
 * dice "no me llega el código".
 *
 * Solo CEO / head_success. Muy útil como reemplazo del ?debug=1 sobre el
 * endpoint de patient-code (que solo miraba el intento del momento).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo" && user.role !== "head_success") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const emailParam = req.nextUrl.searchParams.get("email")?.toLowerCase().trim();
  const where: any = emailParam ? { email: { contains: emailParam, mode: "insensitive" } } : {};

  const codes = await prisma.loginCode.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      email: true,
      sentTo: true,
      sentOk: true,
      sentError: true,
      consumed: true,
      attempts: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ codes });
}
