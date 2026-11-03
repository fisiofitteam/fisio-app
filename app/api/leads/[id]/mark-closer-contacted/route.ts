/**
 * POST /api/leads/[id]/mark-closer-contacted
 *
 * El closer marca el lead como "contactado" tras enviarle el caso de éxito.
 * Marca como leída su notificación lead_assigned.
 */
import { NextRequest, NextResponse } from "next/server";
import { hasAnyRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { markLeadNotificationsRead } from "@/lib/notifications";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const managesTeam = user.role === "ceo" || user.role === "head_success";
  if (!managesTeam && !hasAnyRole(user, ["closer"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!managesTeam && lead.closerId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (lead.closerContactedAt) {
    return NextResponse.json({ ok: true, alreadyDone: true });
  }

  await prisma.lead.update({
    where: { id: params.id },
    data: { closerContactedAt: new Date() },
  });

  // Marcar como leídas las notificaciones lead_assigned de este lead dirigidas al usuario
  await markLeadNotificationsRead({ leadId: params.id, targetProfessionalId: user.id });

  return NextResponse.json({ ok: true });
}
