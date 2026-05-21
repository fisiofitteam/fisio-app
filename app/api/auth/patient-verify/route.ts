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

  const patient = await prisma.patient.findUnique({ where: { email: normalized } });
  if (!patient) return genericError;

  const ua = req.headers.get("user-agent") || undefined;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const token = await createSessionForPatient(patient.id, { userAgent: ua, ipAddress: ip });
  setSessionCookie(token);

  return NextResponse.json({ ok: true, patientId: patient.id });
}
