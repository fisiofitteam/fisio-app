/**
 * GET /acceso/[token] — Magic link 1-clic del paciente.
 *
 * El paciente pulsa el link de WhatsApp → validamos el token → creamos sesión →
 * seteamos cookie → redirigimos a /paciente/[id].
 *
 * Esto es un Route Handler (no un Server Component) porque Next.js 14 prohíbe
 * modificar cookies desde Server Components: "Cookies can only be modified in
 * a Server Action or Route Handler". El intento anterior con `page.tsx` +
 * `setSessionCookie()` daba "Application error" en producción.
 *
 * Si el token no existe o caducó, redirige a /acceso/invalido (página normal
 * que sí puede ser un Server Component porque no toca cookies).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionForPatient, SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const token = params.token;
  const origin = req.nextUrl.origin;

  if (!token || token.length < 16) {
    return NextResponse.redirect(`${origin}/acceso/invalido`);
  }

  const patient = await prisma.patient.findUnique({
    where: { accessToken: token },
    select: { id: true, accessTokenExpiresAt: true },
  });

  if (!patient || !patient.accessTokenExpiresAt) {
    return NextResponse.redirect(`${origin}/acceso/invalido`);
  }
  if (patient.accessTokenExpiresAt.getTime() < Date.now()) {
    return NextResponse.redirect(`${origin}/acceso/invalido?expired=1`);
  }

  const ua = req.headers.get("user-agent") || undefined;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
  const sessionToken = await createSessionForPatient(patient.id, { userAgent: ua, ipAddress: ip });

  // Cookie va en la propia Response del redirect — así Next.js la entrega al
  // navegador junto con la 302 sin pasar por el helper que usa cookies().
  const res = NextResponse.redirect(`${origin}/paciente/${patient.id}`);
  res.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return res;
}
