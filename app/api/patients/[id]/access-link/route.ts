import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

const TOKEN_VALIDITY_DAYS = 365;

// POST /api/patients/[id]/access-link
// Devuelve el "magic link" de acceso 1-clic del paciente. Si ya existe uno
// vigente, lo reutiliza (estable para reenviar por WhatsApp varias veces).
// Si está caducado o no existe, genera uno nuevo. Cualquier miembro del
// equipo puede pedirlo.
// Body opcional: { regenerate: true } → fuerza nuevo token (invalida el viejo).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true, fullName: true, accessToken: true, accessTokenExpiresAt: true },
  });
  if (!patient) return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const forceRegenerate = body?.regenerate === true;

  const now = new Date();
  const stillValid =
    !forceRegenerate &&
    patient.accessToken &&
    patient.accessTokenExpiresAt &&
    patient.accessTokenExpiresAt.getTime() > now.getTime();

  let token = patient.accessToken!;
  let expiresAt = patient.accessTokenExpiresAt!;

  if (!stillValid) {
    token = randomBytes(24).toString("base64url"); // URL-safe, 32 chars
    expiresAt = new Date(now.getTime() + TOKEN_VALIDITY_DAYS * 86400 * 1000);
    await prisma.patient.update({
      where: { id: patient.id },
      data: { accessToken: token, accessTokenExpiresAt: expiresAt },
    });
  }

  return NextResponse.json({
    url: `/acceso/${token}`,
    expiresAt: expiresAt.toISOString(),
    regenerated: !stillValid,
  });
}
