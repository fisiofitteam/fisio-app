/**
 * Registro / desregistro del token de push notifications del paciente.
 *
 * POST { token, platform: "ios"|"android", bundleId? }
 *   → guarda/actualiza el token y lo asocia al paciente actual.
 *
 * DELETE ?token=...
 *   → marca el token como inactivo (no lo borra; útil para historial).
 *
 * Auth: requiere sesión de paciente.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActivePatient } from "@/lib/session";

export async function POST(req: NextRequest) {
  const patient = await getActivePatient();
  if (!patient) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  const token = typeof data?.token === "string" ? data.token.trim() : "";
  const platform = typeof data?.platform === "string" ? data.platform.trim() : "";
  const bundleId = typeof data?.bundleId === "string" ? data.bundleId.trim() : null;
  if (!token) return NextResponse.json({ error: "token requerido" }, { status: 400 });
  if (!["ios", "android"].includes(platform)) {
    return NextResponse.json({ error: "platform debe ser ios o android" }, { status: 400 });
  }

  // Upsert por token único: si el token ya existía (mismo dispositivo, mismo
  // paciente o cambio de paciente en un dispositivo), lo reasignamos.
  await prisma.patientPushToken.upsert({
    where: { token },
    create: { patientId: patient.id, token, platform, bundleId, active: true, lastUsedAt: new Date() },
    update: { patientId: patient.id, platform, bundleId, active: true, lastUsedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const patient = await getActivePatient();
  if (!patient) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token requerido" }, { status: 400 });
  const existing = await prisma.patientPushToken.findUnique({ where: { token } });
  if (!existing || existing.patientId !== patient.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.patientPushToken.update({ where: { token }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
