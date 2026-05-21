import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional, generateToken } from "@/lib/auth";
import { emailInvite } from "@/lib/email";

const VALID_ROLES = ["ceo", "head_success", "fisio", "setter", "closer"];

export async function POST(req: NextRequest) {
  const me = await getActiveProfessional();
  if (!me || me.role !== "ceo") {
    return NextResponse.json({ error: "Solo el CEO puede invitar" }, { status: 403 });
  }

  const { fullName, email, role } = await req.json();
  if (!fullName || !email || !role) {
    return NextResponse.json({ error: "Nombre, email y rol requeridos" }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Rol no válido" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Ya existe?
  const existing = await prisma.professional.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return NextResponse.json({ error: "Ya existe un profesional con ese email" }, { status: 409 });
  }

  const token = generateToken();
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);

  const pro = await prisma.professional.create({
    data: {
      fullName,
      email: normalizedEmail,
      role,
      active: true,
      passwordResetToken: token,
      passwordResetExpires: expires,
    },
  });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const setupUrl = `${baseUrl}/reset?token=${token}&welcome=1`;

  await emailInvite({ to: normalizedEmail, fullName, role, setupUrl });

  return NextResponse.json({ ok: true, id: pro.id });
}

// Reenviar invitación (genera nuevo token y reenvía email)
export async function PUT(req: NextRequest) {
  const me = await getActiveProfessional();
  if (!me || me.role !== "ceo") {
    return NextResponse.json({ error: "Solo el CEO" }, { status: 403 });
  }

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const pro = await prisma.professional.findUnique({ where: { id } });
  if (!pro || !pro.email) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const token = generateToken();
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);

  await prisma.professional.update({
    where: { id },
    data: { passwordResetToken: token, passwordResetExpires: expires },
  });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const setupUrl = `${baseUrl}/reset?token=${token}&welcome=1`;

  await emailInvite({ to: pro.email, fullName: pro.fullName, role: pro.role, setupUrl });

  return NextResponse.json({ ok: true });
}
