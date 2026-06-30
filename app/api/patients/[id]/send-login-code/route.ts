/**
 * POST /api/patients/[id]/send-login-code
 *
 * Fuerza el envío del código de acceso a un paciente concreto. Útil
 * cuando el paciente dice "no me llega el código" — el CEO/head_success
 * lo dispara desde la ficha y ve si Resend dice ok o falla con un motivo.
 *
 * Salta el cooldown del flujo público (porque es soporte, no autoservice).
 * Invalida códigos pendientes y crea uno nuevo, igual que el flujo normal.
 *
 * Respuesta:
 *   { ok, error?, sentTo, previewMode? }
 *
 * Solo CEO y head_success.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { generateNumericCode, hashCode } from "@/lib/auth";
import { emailLoginCode } from "@/lib/email";

export const dynamic = "force-dynamic";

const CODE_EXPIRY_MINUTES = 10;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo" && user.role !== "head_success") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true, fullName: true, email: true },
  });
  if (!patient) {
    return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });
  }
  if (!patient.email) {
    return NextResponse.json(
      { error: "Este paciente no tiene email guardado en su ficha. Añade un email antes." },
      { status: 400 }
    );
  }

  const normalized = patient.email.trim().toLowerCase();
  if (normalized !== patient.email) {
    // Limpieza silenciosa: el email guardado tenía espacios o mayúsculas.
    // Esto era causa habitual de "no me llega el código" porque la
    // búsqueda case-insensitive de Postgres ignoraba el mismatch pero
    // el envío iba al string raro. Lo normalizamos para futuros intentos.
    await prisma.patient.update({
      where: { id: patient.id },
      data: { email: normalized },
    });
  }

  // Invalidar códigos anteriores no consumidos
  await prisma.loginCode.updateMany({
    where: { email: normalized, consumed: false },
    data: { consumed: true },
  });

  const code = generateNumericCode(6);
  const expires = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);
  await prisma.loginCode.create({
    data: { email: normalized, codeHash: hashCode(code), expiresAt: expires },
  });

  const emailRes: any = await emailLoginCode({
    to: normalized,
    code,
    fullName: patient.fullName,
  });

  return NextResponse.json({
    ok: !!emailRes?.ok,
    error: emailRes?.error ?? null,
    previewMode: !!emailRes?.previewMode,
    sentTo: normalized,
  });
}
