import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getRealProfessional, IMPERSONATE_COOKIE } from "@/lib/auth";

// POST /api/admin/impersonate — el CEO empieza a ver el panel como otro miembro.
// body: { professionalId }
export async function POST(req: NextRequest) {
  const real = await getRealProfessional();
  if (!real || real.role !== "ceo") {
    return NextResponse.json({ error: "Solo el CEO puede hacer esto." }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const targetId = typeof b?.professionalId === "string" ? b.professionalId : "";
  if (!targetId || targetId === real.id) {
    return NextResponse.json({ error: "Miembro no válido." }, { status: 400 });
  }

  const target = await prisma.professional.findUnique({ where: { id: targetId }, select: { id: true, active: true } });
  if (!target || !target.active) {
    return NextResponse.json({ error: "El miembro no existe o está inactivo." }, { status: 404 });
  }

  cookies().set(IMPERSONATE_COOKIE, target.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60, // 8 horas
  });
  return NextResponse.json({ ok: true });
}
