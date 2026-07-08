/**
 * GET /api/prevention/subscribers/[id]/magic-link
 *
 * Devuelve el magic link 1-clic del paciente vinculado a la suscripción,
 * junto con un texto pre-rellenado listo para enviar por WhatsApp.
 *
 * No manda nada — solo prepara los datos. El botón WhatsApp del panel
 * admin construye `https://wa.me/<phone>?text=<waText>` con la respuesta
 * y abre WhatsApp Web/App en pestaña nueva.
 *
 * Solo managers.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getOrCreatePatientAccessPath } from "@/lib/auth";

export const runtime = "nodejs";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://app.fisiofitteam.com";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || !user.isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sub = await prisma.patientSubscription.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      patient: { select: { id: true, fullName: true, phone: true } },
    },
  });
  if (!sub) {
    return NextResponse.json({ error: "Suscripción no encontrada" }, { status: 404 });
  }
  if (!sub.patient.phone) {
    return NextResponse.json(
      { error: "Este paciente no tiene WhatsApp guardado. Añádelo en su ficha." },
      { status: 400 },
    );
  }

  const { path } = await getOrCreatePatientAccessPath(sub.patient.id);
  const url = `${BASE_URL}${path}`;
  const first = sub.patient.fullName.split(" ")[0];
  const waText =
    `¡Hola ${first}! 👋\n\n` +
    `Aquí tienes tu acceso a FisioFit Prevention 🛡\n\n` +
    `${url}\n\n` +
    `Un solo clic y estás dentro — sin códigos ni contraseñas. Cualquier duda, por aquí.`;

  return NextResponse.json({
    ok: true,
    url,
    waText,
    phone: sub.patient.phone,
  });
}
