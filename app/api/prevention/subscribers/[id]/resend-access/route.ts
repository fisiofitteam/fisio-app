/**
 * POST /api/prevention/subscribers/[id]/resend-access
 *
 * Reenvía al paciente Prevention su magic link 1-clic. Salta el flujo
 * "email → código → verificar" que a veces falla.
 *
 * [id] es el id de la PatientSubscription (para atarlo al panel de
 * suscriptores). Recupera el paciente vinculado.
 *
 * Solo managers.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getOrCreatePatientAccessPath } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { accessLinkEmail } from "@/lib/emails/prevention";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || !user.isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sub = await prisma.patientSubscription.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      patient: { select: { id: true, fullName: true, email: true } },
    },
  });
  if (!sub) {
    return NextResponse.json({ error: "Suscripción no encontrada" }, { status: 404 });
  }
  if (!sub.patient.email) {
    return NextResponse.json(
      { error: "El paciente no tiene email guardado. Añade uno en su ficha primero." },
      { status: 400 },
    );
  }

  const { path: accessPath } = await getOrCreatePatientAccessPath(sub.patient.id);
  const first = sub.patient.fullName.split(" ")[0];
  const mail = accessLinkEmail({ firstName: first, accessPath });

  const res: any = await sendEmail({
    to: sub.patient.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });

  return NextResponse.json({
    ok: !!res?.ok,
    error: res?.error ?? null,
    previewMode: !!res?.previewMode,
    sentTo: sub.patient.email,
  });
}
