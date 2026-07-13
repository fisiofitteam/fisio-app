/**
 * POST /api/admin/link-lead-to-prevention-patient
 *
 * Utilidad para vincular manualmente un Lead con un Patient Prevention
 * cuando el atleta se suscribió desde la landing pública (sin leadId en
 * metadata Stripe) o cuando el email del lead no coincide con el del pago.
 *
 * Marca el Lead como "won" con decidedAt=now() y closerId (el CEO/closer
 * que llama al endpoint, si el lead no tenía uno). No cambia nada del
 * Patient — su email queda como se suscribió él mismo.
 *
 * Body: { leadId?, leadEmail?, patientEmail }
 *   - Puedes pasar leadId O leadEmail (busca por contactValue).
 *   - patientEmail identifica al Patient Prevention que se suscribió.
 *
 * Solo CEO.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo") {
    return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const leadId = typeof body?.leadId === "string" ? body.leadId : null;
  const leadEmail = typeof body?.leadEmail === "string" ? body.leadEmail.trim().toLowerCase() : null;
  const patientEmail = typeof body?.patientEmail === "string" ? body.patientEmail.trim().toLowerCase() : null;

  if (!patientEmail) {
    return NextResponse.json({ error: "patientEmail requerido" }, { status: 400 });
  }
  if (!leadId && !leadEmail) {
    return NextResponse.json({ error: "Pasa leadId o leadEmail" }, { status: 400 });
  }

  // Buscar el Patient Prevention
  const patient = await prisma.patient.findFirst({
    where: { email: { equals: patientEmail, mode: "insensitive" } },
    select: { id: true, fullName: true, email: true, programType: true },
  });
  if (!patient) {
    return NextResponse.json({ error: `No hay Patient con email ${patientEmail}` }, { status: 404 });
  }

  // Buscar el Lead — tolerante a cómo el closer guardó los datos:
  //   - Por id: exacto.
  //   - Por leadEmail: busca contactValue que contenga ese email (case-
  //     insensitive) sin importar el contactType. Muchas veces el closer
  //     guarda el contacto como phone/instagram y el email en aiSummary
  //     o en el fullName.
  let lead;
  if (leadId) {
    lead = await prisma.lead.findUnique({ where: { id: leadId } });
  } else if (leadEmail) {
    // Extraer la parte local del email para buscar por username también
    const localPart = leadEmail.split("@")[0];
    // El Lead tiene `email` como campo dedicado (aparte de contactValue),
    // que es donde el CEO/setter guarda el correo cuando el contactType
    // primario es phone o instagram. Consultamos ambos.
    lead = await prisma.lead.findFirst({
      where: {
        OR: [
          { email:        { equals:   leadEmail, mode: "insensitive" } },
          { email:        { contains: localPart, mode: "insensitive" } },
          { contactValue: { contains: leadEmail, mode: "insensitive" } },
          { contactValue: { contains: localPart, mode: "insensitive" } },
          { aiSummary:    { contains: leadEmail, mode: "insensitive" } },
          { fullName:     { contains: localPart, mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
  }
  if (!lead) {
    // Devolver los últimos 5 leads recientes para que el CEO identifique el correcto
    const candidates = await prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true, fullName: true, contactType: true, contactValue: true,
        email: true, phone: true, status: true, createdAt: true, callScheduledAt: true,
      },
    });
    return NextResponse.json({
      error: "Lead no encontrado con esos datos. Aquí tienes los últimos 8 para que copies el id correcto y lo mandes como leadId:",
      candidates,
    }, { status: 404 });
  }

  const updatedLead = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      status: "won",
      decidedAt: new Date(),
      ...(lead.closerId ? {} : { closerId: user.id }),
    },
  });

  return NextResponse.json({
    ok: true,
    lead: {
      id: updatedLead.id,
      fullName: updatedLead.fullName,
      contactValue: updatedLead.contactValue,
      status: updatedLead.status,
      decidedAt: updatedLead.decidedAt?.toISOString() ?? null,
      closerId: updatedLead.closerId,
    },
    patient: {
      id: patient.id,
      fullName: patient.fullName,
      email: patient.email,
      programType: patient.programType,
    },
  });
}
