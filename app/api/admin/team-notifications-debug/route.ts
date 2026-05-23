import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  }

  const notifications = await prisma.teamNotification.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Resolver nombres de profesionales destinatarios (si los hay)
  const professionalIds = notifications
    .map((n) => n.targetProfessionalId)
    .filter((id): id is string => !!id);
  const professionals = professionalIds.length
    ? await prisma.professional.findMany({
        where: { id: { in: professionalIds } },
        select: { id: true, fullName: true, role: true },
      })
    : [];
  const profMap = new Map(professionals.map((p) => [p.id, p]));

  return NextResponse.json({
    count: notifications.length,
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      targetRole: n.targetRole,
      targetProfessional: n.targetProfessionalId
        ? profMap.get(n.targetProfessionalId) || { id: n.targetProfessionalId, fullName: "?", role: "?" }
        : null,
      leadId: n.leadId,
      actionUrl: n.actionUrl,
      readAt: n.readAt,
      createdAt: n.createdAt,
    })),
  });
}
