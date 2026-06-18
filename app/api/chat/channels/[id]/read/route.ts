import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canAccessChannel, ensureMembership } from "@/lib/chat";

/**
 * POST /api/chat/channels/[id]/read
 *
 * Marca `lastReadAt = now` para el usuario actual en este canal. Llamado por
 * el cliente cuando el usuario abre el canal o lo deja activo.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await canAccessChannel(params.id, user.id);
  if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (access.kind === "public") await ensureMembership(params.id, user.id);

  await prisma.chatMember.update({
    where: { channelId_professionalId: { channelId: params.id, professionalId: user.id } },
    data: { lastReadAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
