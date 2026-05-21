import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateNumericCode, hashCode } from "@/lib/auth";
import { emailLoginCode } from "@/lib/email";

const CODE_EXPIRY_MINUTES = 10;
const COOLDOWN_SECONDS = 30; // entre peticiones del mismo email

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Email requerido" }, { status: 400 });

  const normalized = email.toLowerCase().trim();
  const patient = await prisma.patient.findUnique({ where: { email: normalized } });

  // No revelamos si existe el paciente o no
  if (!patient) {
    // Simulamos el delay
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({ ok: true });
  }

  // Cooldown: si hay un código emitido hace menos de COOLDOWN_SECONDS, devolvemos sin reenviar
  const recent = await prisma.loginCode.findFirst({
    where: {
      email: normalized,
      createdAt: { gte: new Date(Date.now() - COOLDOWN_SECONDS * 1000) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    return NextResponse.json({ ok: true, cooldown: true });
  }

  // Invalidar códigos anteriores no consumidos
  await prisma.loginCode.updateMany({
    where: { email: normalized, consumed: false },
    data: { consumed: true },
  });

  const code = generateNumericCode(6);
  const expires = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

  await prisma.loginCode.create({
    data: {
      email: normalized,
      codeHash: hashCode(code),
      expiresAt: expires,
    },
  });

  await emailLoginCode({ to: patient.email!, code, fullName: patient.fullName });

  return NextResponse.json({ ok: true });
}
