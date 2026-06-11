import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  createSessionForProfessional,
  createSessionForPatient,
  setSessionCookie,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email y contraseña requeridos" }, { status: 400 });
  }

  const normalized = email.toLowerCase().trim();

  // ─── Modo demo Apple Review (fallback en el login de equipo) ───
  // Si las credenciales son las del paciente demo, logueamos como ese paciente
  // y devolvemos el redirect a su panel. Esto cubre el caso en que un reviewer
  // confunde la puerta de entrada ("Equipo" vs "Paciente"). Para el resto de
  // usuarios este bloque no hace nada.
  const demoEmail = process.env.DEMO_PATIENT_EMAIL?.toLowerCase().trim();
  const demoCode = process.env.DEMO_PATIENT_CODE?.trim();
  if (demoEmail && demoCode && normalized === demoEmail && String(password).trim() === demoCode) {
    const patient = await prisma.patient.findUnique({ where: { email: normalized } });
    if (patient) {
      const ua = req.headers.get("user-agent") || undefined;
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
      const token = await createSessionForPatient(patient.id, { userAgent: ua, ipAddress: ip });
      setSessionCookie(token);
      return NextResponse.json({ ok: true, role: "patient", redirect: `/paciente/${patient.id}` });
    }
  }

  const pro = await prisma.professional.findUnique({ where: { email: normalized } });

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
