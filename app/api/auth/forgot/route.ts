import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateToken } from "@/lib/auth";
import { emailPasswordReset } from "@/lib/email";

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Email requerido" }, { status: 400 });

  const normalized = email.toLowerCase().trim();
  const pro = await prisma.professional.findUnique({ where: { email: normalized } });

  // Respondemos OK aunque no exista — no queremos enumerar emails
  if (!pro || !pro.active) {
    return NextResponse.json({ ok: true });
  }

  const token = generateToken();
  const expires = new Date();
  expires.setHours(expires.getHours() + 1);

  await prisma.professional.update({
    where: { id: pro.id },
    data: { passwordResetToken: token, passwordResetExpires: expires },
  });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset?token=${token}`;

  await emailPasswordReset({ to: pro.email!, fullName: pro.fullName, resetUrl });

  return NextResponse.json({ ok: true });
}
