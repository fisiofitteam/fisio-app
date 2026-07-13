/**
 * GET /api/patients/[id]/whatsapp-link
 *
 * Devuelve el magic link 1-clic del paciente junto con un texto ya
 * preparado para enviar por WhatsApp. El UI construye
 * `https://wa.me/<phone>?text=<waText>` y abre WhatsApp Web/App.
 *
 * Análogo a /api/prevention/subscribers/[id]/magic-link pero para
 * pacientes en general (RECUPERA / CONSOLIDA / ADVANCE / etc.).
 *
 * Auth: cualquier profesional autenticado (así el fisio también puede
 * mandarle el link a los suyos, no solo los managers).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getOrCreatePatientAccessPath } from "@/lib/auth";

export const runtime = "nodejs";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://app.fisiofitteam.com";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true, fullName: true, phone: true, whatsappGroupUrl: true },
  });
  if (!patient) {
    return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });
  }
  // Solo bloqueamos si NI teléfono NI grupo de seguimiento — el botón
  // funciona con cualquiera de los dos: grupo (copia al portapapeles y
  // abre el chat del grupo) o teléfono (wa.me con texto prefijado).
  if (!patient.phone && !patient.whatsappGroupUrl) {
    return NextResponse.json(
      { error: "Este paciente no tiene teléfono ni grupo de WhatsApp en su ficha." },
      { status: 400 },
    );
  }

  const { path } = await getOrCreatePatientAccessPath(patient.id);
  const url = `${BASE_URL}${path}`;
  const first = patient.fullName.split(" ")[0];
  const waText =
    `¡Hola ${first}! 👋\n\n` +
    `Aquí tienes tu acceso directo a FisioFit App:\n\n` +
    `${url}\n\n` +
    `Un solo clic y estás dentro — sin códigos ni contraseñas.`;

  return NextResponse.json({
    ok: true,
    url,
    waText,
    phone: patient.phone,
    whatsappGroupUrl: patient.whatsappGroupUrl,
  });
}
