/**
 * POST /api/leads/[id]/mark-reminder-sent
 *
 * El closer marca que ha enviado el recordatorio del día anterior con el
 * vídeo pre-llamada.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { markLeadNotificationsRead } from "@/lib/notifications";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(user.role === "closer" || user.role === "ceo" || user.role === "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.lead.update({
    where: { id: params.id },
    data: { reminderSentAt: new Date() },
  });

  // Marcar como leídas las notificaciones call_reminder de este lead
  await markLeadNotificationsRead({ leadId: params.id, targetProfessionalId: user.id });

  return NextResponse.json({ ok: true });
}
