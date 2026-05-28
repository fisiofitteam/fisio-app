import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActivePatient } from "@/lib/session";

// PATCH /api/patient/photo — el paciente actualiza su propia foto de perfil.
// body: { photoUrl: string | null }. El fichero ya se ha subido al Blob a través de
// /api/community/upload; aquí solo guardamos la URL.
export async function PATCH(req: NextRequest) {
  const patient = await getActivePatient();
  if (!patient) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const raw = b?.photoUrl;
  const photoUrl =
    raw === null || raw === "" ? null :
    (typeof raw === "string" && raw.trim().startsWith("http") ? raw.trim() : undefined);

  if (photoUrl === undefined) {
    return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  }

  await prisma.patient.update({ where: { id: patient.id }, data: { photoUrl } });
  return NextResponse.json({ ok: true, photoUrl });
}
