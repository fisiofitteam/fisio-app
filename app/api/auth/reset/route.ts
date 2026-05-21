import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSessionForProfessional, setSessionCookie } from "@/lib/auth";

export async function GET(req: NextRequest) {
  // Comprobar si el token es válido (para mostrar el formulario)
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ valid: false });

  const pro = await prisma.professional.findUnique({ where: { passwordResetToken: token } });
  if (!pro || !pro.passwordResetExpires || pro.passwordResetExpires < new Date()) {
    return NextResponse.json({ valid: false });
  }
  return NextResponse.json({ valid: true, fullName: pro.fullName, email: pro.email });
}

export async function POST(req: NextRequest) {
  const { token, password } = await req.json();

  if (!token || !password) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
  }

  const pro = await prisma.professional.findUnique({ where: { passwordResetToken: token } });
  if (!pro || !pro.passwordResetExpires || pro.passwordResetExpires < new Date()) {
    return NextResponse.json({ error: "Enlace caducado. Pídelo de nuevo." }, { status: 400 });
  }

  const passwordHash = hashPassword(password);

  await prisma.professional.update({
    where: { id: pro.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpires: null,
      passwordSetAt: new Date(),
    },
  });

  // Login automático después de establecer
  const ua = req.headers.get("user-agent") || undefined;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const sessionToken = await createSessionForProfessional(pro.id, { userAgent: ua, ipAddress: ip });
  setSessionCookie(sessionToken);

  return NextResponse.json({ ok: true, role: pro.role });
}
