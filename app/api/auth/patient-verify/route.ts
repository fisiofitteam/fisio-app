import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCode, createSessionForPatient, setSessionCookie } from "@/lib/auth";

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  const { email, code } = await req.json();
  if (!email || !code) {
    return NextResponse.json({ error: "Email y código requeridos" }, { status: 400 });
  }

  const normalized = email.toLowerCase().trim();

  // ─── Modo demo para Apple Review ───
  // Si email+código coinciden con los configurados en env vars, saltamos el
  // check de LoginCode y logueamos directamente al paciente con ese email.
  // Para usuarios normales este bloque no se ejecuta (env vars vacías).
  const demoEmail = process.env.DEMO_PATIENT_EMAIL?.toLowerCase().trim();
  const demoCode = process.env.DEMO_PATIENT_CODE?.trim();
  if (demoEmail && demoCode && normalized === demoEmail && String(code).trim() === demoCode) {
    const patient = await prisma.patient.findFirst({
      where: { email: { equals: normalized, mode: "insensitive" } },
    });
    if (!patient) {
      return NextResponse.json({ error: "Paciente demo no encontrado" }, { status: 500 });
    }
    const ua = req.headers.get("user-agent") || undefined;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
    const token = await createSessionForPatient(patient.id, { userAgent: ua, ipAddress: ip });
    setSessionCookie(token);
    return NextResponse.json({ ok: true, patientId: patient.id });
  }

  const record = await prisma.loginCode.findFirst({
    where: {
      email: normalized,
      consumed: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  const genericError = NextResponse.json({ error: "Código incorrecto o caducado" }, { status: 401 });

  if (!record) return genericError;

  if (record.attempts >= MAX_ATTEMPTS) {
    await prisma.loginCode.update({ where: { id: record.id }, data: { consumed: true } });
    return genericError;
  }

  if (!verifyCode(code, record.codeHash)) {
    await prisma.loginCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    return genericError;
  }

  // Consumir el código
  await prisma.loginCode.update({ where: { id: record.id }, data: { consumed: true } });

  // Búsqueda case-insensitive (ver patient-code/route.ts).
  const patient = await prisma.patient.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
  });
  if (!patient) return genericError;

  const ua = req.headers.get("user-agent") || undefined;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const token = await createSessionForPatient(patient.id, { userAgent: ua, ipAddress: ip });
  setSessionCookie(token);

  return NextResponse.json({ ok: true, patientId: patient.id });
}
