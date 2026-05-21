import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSessionForProfessional, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email y contraseña requeridos" }, { status: 400 });
  }

  const pro = await prisma.professional.findUnique({ where: { email: email.toLowerCase().trim() } });

  // Mismo mensaje para "no existe" y "contraseña errónea" — evita enumerar usuarios
  const genericError = NextResponse.json({ error: "Email o contraseña incorrectos" }, { status: 401 });

  if (!pro || !pro.active || !pro.passwordHash) {
    return genericError;
  }
  if (!verifyPassword(password, pro.passwordHash)) {
    return genericError;
  }

  const ua = req.headers.get("user-agent") || undefined;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const token = await createSessionForProfessional(pro.id, { userAgent: ua, ipAddress: ip });
  setSessionCookie(token);

  await prisma.professional.update({ where: { id: pro.id }, data: { lastLoginAt: new Date() } });

  return NextResponse.json({ ok: true, role: pro.role });
}
