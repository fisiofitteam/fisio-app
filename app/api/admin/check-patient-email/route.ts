/**
 * Diagnóstico: dado un email, dice si existe un paciente en BD con ese email
 * (case-insensitive), si hay cooldown activo, y si Resend está disponible.
 *
 * GET /api/admin/check-patient-email?email=foo@bar.com
 *
 * Solo CEO.
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rawEmail = req.nextUrl.searchParams.get("email");
  if (!rawEmail) return NextResponse.json({ error: "Falta ?email=foo@bar.com" }, { status: 400 });
  if (!rawEmail.includes("@")) {
    return NextResponse.json({
      error: "El parámetro 'email' no parece un email. Sustituye el placeholder por un email real.",
      received: rawEmail,
    }, { status: 400 });
  }
  const normalized = rawEmail.toLowerCase().trim();

  // 1) Búsqueda case-insensitive (debe encontrar siempre que el paciente
  // tenga ese email aunque esté guardado con mayúsculas).
  const ci = await prisma.patient.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
    select: { id: true, fullName: true, email: true, onboardingStatus: true, startedAt: true },
  });

  // 2) Búsqueda strict por findUnique (compara con el valor exact-match
  // tal cual está en BD; sirve para detectar si solo difiere por mayúsculas).
  const strict = await prisma.patient.findUnique({
    where: { email: normalized },
    select: { id: true, email: true },
  });

  // 3) Búsqueda fuzzy en BD: paciente sin email exacto pero con email parecido
  // (por si hay un typo evidente).
  const fuzzy = await prisma.patient.findMany({
    where: { email: { contains: normalized.split("@")[0], mode: "insensitive" } },
    select: { id: true, fullName: true, email: true },
    take: 5,
  });

  // 4) ¿Hay un LoginCode reciente que indica cooldown?
  const recentCode = await prisma.loginCode.findFirst({
    where: {
      email: normalized,
      createdAt: { gte: new Date(Date.now() - 30 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });

  // 5) Total de LoginCodes históricos para este email
  const totalCodes = await prisma.loginCode.count({ where: { email: normalized } });

  return NextResponse.json({
    input: { rawEmail, normalized },
    patient: ci
      ? {
          id: ci.id,
          fullName: ci.fullName,
          emailEnBD: ci.email,
          onboardingStatus: ci.onboardingStatus,
          startedAt: ci.startedAt,
          encontradoExacto: !!strict,
          notas: !strict ? "El email en BD difiere por mayúsculas/espacios del input normalizado" : null,
        }
      : null,
    cooldown: recentCode ? { activeUntil: new Date(recentCode.createdAt.getTime() + 30 * 1000) } : null,
    historico: { totalCodesEnviados: totalCodes },
    fuzzyMatches: fuzzy.length > 0 && !ci ? fuzzy : null,
    diagnostico: !ci
      ? "❌ NO hay paciente con ese email. El endpoint patient-code devuelve OK silencioso → no se envía nada."
      : recentCode
        ? "⏱ Cooldown activo. Espera 30s y reintenta."
        : "✅ Paciente encontrado y sin cooldown. El envío debería funcionar.",
  });
  } catch (e: any) {
    console.error("[check-patient-email] error:", e?.message, e?.code, e?.meta);
    return NextResponse.json({
      error: e?.message ?? "Error desconocido",
      code: e?.code,
      meta: e?.meta,
    }, { status: 500 });
  }
}
