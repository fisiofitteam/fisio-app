import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

// El PATCH solo hace el reset del CallSummary cuando cambia el meetingUrl.
// La regeneración del resumen (Meet + Sonnet, 15-30s) la dispara el cliente
// en un fetch aparte con keepalive:true — así no bloqueamos el modal.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Crear lead: setter, closer, head_success o ceo
  if (user.role !== "setter" && user.role !== "closer" && !user.isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await req.json();
  // Normalizamos el email para que el login posterior coincida (Postgres
  // case-sensitive). El teléfono lo dejamos tal cual (no afecta a login).
  const contactType = data.contactType ?? "phone";
  const contactValueNorm = contactType === "email" && typeof data.contactValue === "string"
    ? data.contactValue.trim().toLowerCase()
    : data.contactValue;
  const emailNorm = typeof data.email === "string" && data.email ? data.email.trim().toLowerCase() : null;
  const lead = await prisma.lead.create({
    data: {
      fullName: data.fullName,
      contactType,
      contactValue: contactValueNorm,
      email: emailNorm,
      phone: data.phone || null,
      aiSummary: data.aiSummary || null,
      callScheduledAt: new Date(data.callScheduledAt),
      // Si lo crea un closer y no se especifica otro closer, se lo auto-asigna
      closerId: data.closerId || (user.role === "closer" ? user.id : null),
      setterId: user.role === "setter" ? user.id : data.setterId || null,
      status: "scheduled",
      sourceTagId: typeof data.sourceTagId === "string" ? data.sourceTagId : null,
    },
  });
  return NextResponse.json(lead);
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const data = await req.json();
  const { id, ...rest } = data;

  // El closer puede editar SUS leads completamente (cambio de petición del CEO)
  if (user.role === "closer") {
    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead || lead.closerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (user.role !== "setter" && !user.isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updateData: any = {};
  if (rest.fullName !== undefined) updateData.fullName = rest.fullName;
  if (rest.contactType !== undefined) updateData.contactType = rest.contactType;
  if (rest.contactValue !== undefined) {
    // Normaliza si es email; teléfono se queda igual.
    const ct = rest.contactType ?? "phone";
    updateData.contactValue = ct === "email" && typeof rest.contactValue === "string"
      ? rest.contactValue.trim().toLowerCase()
      : rest.contactValue;
  }
  if (rest.email !== undefined) updateData.email = (typeof rest.email === "string" && rest.email) ? rest.email.trim().toLowerCase() : null;
  if (rest.phone !== undefined) updateData.phone = rest.phone || null;
  if (rest.aiSummary !== undefined) updateData.aiSummary = rest.aiSummary || null;
  if (rest.callScheduledAt !== undefined) updateData.callScheduledAt = new Date(rest.callScheduledAt);
  if (rest.closerId !== undefined) updateData.closerId = rest.closerId || null;
  if (rest.status !== undefined) {
    updateData.status = rest.status;
    updateData.decidedAt = new Date();
  }
  if (rest.lostReason !== undefined) updateData.lostReason = rest.lostReason || null;
  if (rest.aiScheduled !== undefined) updateData.aiScheduled = !!rest.aiScheduled;
  if (rest.instagram !== undefined) updateData.instagram = rest.instagram || null;
  if (rest.sourceTagId !== undefined) updateData.sourceTagId = rest.sourceTagId || null;
  if (rest.meetingUrl !== undefined) updateData.meetingUrl = rest.meetingUrl || null;

  // Si marcamos inFollowUp=true y todavía no se había iniciado, autocalculamos las 4 fechas
  if (rest.inFollowUp === true) {
    const existing = await prisma.lead.findUnique({ where: { id } });
    updateData.inFollowUp = true;
    if (existing && !existing.followUpStartedAt) {
      const now = new Date();
      const add = (hours: number) => {
        const d = new Date(now);
        d.setHours(d.getHours() + hours);
        return d;
      };
      const addDays = (days: number) => {
        const d = new Date(now);
        d.setDate(d.getDate() + days);
        return d;
      };
      updateData.followUpStartedAt = now;
      updateData.followUp24hDate = add(24);
      updateData.followUp48hDate = add(60); // punto medio 48-72h
      updateData.followUp30dDate = addDays(30);
      updateData.followUp90dDate = addDays(90);
    }
  } else if (rest.inFollowUp === false) {
    updateData.inFollowUp = false;
  }

  // Toggles individuales de follow-up
  if (rest.followUp24hDone !== undefined) updateData.followUp24hDone = !!rest.followUp24hDone;
  if (rest.followUp48hDone !== undefined) updateData.followUp48hDone = !!rest.followUp48hDone;
  if (rest.followUp30dDone !== undefined) updateData.followUp30dDone = !!rest.followUp30dDone;
  if (rest.followUp90dDone !== undefined) updateData.followUp90dDone = !!rest.followUp90dDone;

  if (rest.followUpNote !== undefined) updateData.followUpNote = rest.followUpNote || null;

  // Fechas de follow-up personalizables (sobrescriben las automáticas)
  for (const f of ["followUp24hDate", "followUp48hDate", "followUp30dDate", "followUp90dDate"] as const) {
    if (rest[f] !== undefined) updateData[f] = rest[f] ? new Date(rest[f]) : null;
  }

  // Si el meetingUrl cambia y apunta a un Meet válido, hay que regenerar el
  // resumen IA con la nueva transcripción (útil cuando el paciente agendó
  // dos veces y el Meet real es otro).
  const meetingUrlChanged =
    rest.meetingUrl !== undefined &&
    (rest.meetingUrl || null) !== null &&
    typeof rest.meetingUrl === "string" &&
    rest.meetingUrl.includes("meet.google.com");
  let previousMeetingUrl: string | null = null;
  if (meetingUrlChanged) {
    const prev = await prisma.lead.findUnique({ where: { id }, select: { meetingUrl: true } });
    previousMeetingUrl = prev?.meetingUrl ?? null;
  }

  const lead = await prisma.lead.update({ where: { id }, data: updateData });

  // Si cambió el meetingUrl: reseteamos el CallSummary síncronamente y le
  // devolvemos al cliente un flag para que dispare la regeneración desde
  // navegador con keepalive:true (garantiza que se completa aunque cierre
  // el modal, cosa que un fetch normal no garantiza).
  const shouldRegenerate = meetingUrlChanged && rest.meetingUrl !== previousMeetingUrl;
  console.log("[leads.patch] meetingUrl regen check", { id, shouldRegenerate, previousMeetingUrl, newMeetingUrl: rest.meetingUrl });
  if (shouldRegenerate) {
    await prisma.callSummary.updateMany({
      where: { leadId: id },
      data: {
        noTranscript: false,
        errorMessage: null,
        salesSummary: null,
        salesKeyPoints: null,
        clinicalSummary: null,
        clinicalKeyPoints: null,
        coachingSummary: null,
        coachingKeyPoints: null,
      },
    });
  }

  return NextResponse.json({ ...lead, _regenerationQueued: shouldRegenerate });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Setter, closer y CEO/head_success pueden borrar
  if (user.role !== "setter" && user.role !== "closer" && !user.isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: { sales: { select: { id: true, status: true } } },
  });
  if (!lead) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });

  // Protección 1: si ya hay un paciente asociado, no se puede borrar
  if (lead.convertedPatientId) {
    return NextResponse.json(
      { error: "Este lead ya se convirtió en paciente. No se puede borrar." },
      { status: 409 }
    );
  }
  // Protección 2: si hay algún Sale paid, no se puede borrar
  if (lead.sales.some((s) => s.status === "paid")) {
    return NextResponse.json(
      { error: "Este lead tiene un pago confirmado en Stripe. No se puede borrar." },
      { status: 409 }
    );
  }

  // Borrado en cascada: notificaciones + sales + lead, todo en una transacción
  await prisma.$transaction([
    prisma.teamNotification.deleteMany({ where: { leadId: id } }),
    prisma.sale.deleteMany({ where: { leadId: id } }),
    prisma.lead.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
