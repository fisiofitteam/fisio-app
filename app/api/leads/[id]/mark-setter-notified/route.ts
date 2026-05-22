/**
 * POST /api/leads/[id]/mark-setter-notified
 *
 * El setter marca el lead como "avisado" tras contactarle por WhatsApp.
 * Dispara la notificación al closer asignado.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { notifyProfessional, markLeadNotificationsRead } from "@/lib/notifications";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(user.role === "setter" || user.role === "ceo" || user.role === "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (lead.setterNotifiedAt) {
    return NextResponse.json({ ok: true, alreadyDone: true });
  }

  await prisma.lead.update({
    where: { id: params.id },
    data: { setterNotifiedAt: new Date(), setterId: user.id },
  });

  // Marcar como leídas las notificaciones lead_new de este lead (para setters)
  await markLeadNotificationsRead({ leadId: params.id, targetRole: "setter" });

  // Notificar al closer asignado (si lo hay)
  if (lead.closerId) {
    const dateLabel = lead.callScheduledAt.toLocaleDateString("es-ES", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    await notifyProfessional({
      professionalId: lead.closerId,
      type: "lead_assigned",
      title: `Lead asignado · ${lead.fullName}`,
      body: `Llamada el ${dateLabel}. Envíale un caso de éxito relacionado con su problema por WhatsApp.`,
      leadId: lead.id,
      actionUrl: "/fisio/llamadas-venta",
    });
  }

  return NextResponse.json({ ok: true });
}
