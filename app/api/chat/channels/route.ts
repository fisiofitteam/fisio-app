import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canCreateChannel, isChatKind, type ChatKind } from "@/lib/chat";

/**
 * GET /api/chat/channels
 * Devuelve la lista de canales visibles para el usuario, agrupados por tipo,
 * con metadatos útiles para el sidebar: nombre, emoji, unreadCount, lastMessageAt.
 */
export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Públicos: cualquiera del equipo los ve (no requiere ChatMember). Lazy-init
  // de membresía solo al abrir/enviar.
  const publicChannels = await prisma.chatChannel.findMany({
    where: { kind: "public", archivedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      members: { where: { professionalId: user.id }, select: { lastReadAt: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });

  // Privados + DMs: solo donde el user es miembro.
  const memberChannels = await prisma.chatChannel.findMany({
    where: {
      archivedAt: null,
      kind: { in: ["private", "dm"] },
      members: { some: { professionalId: user.id } },
    },
    orderBy: { createdAt: "asc" },
    include: {
      members: {
        select: {
          professionalId: true,
          lastReadAt: true,
          professional: { select: { id: true, fullName: true, role: true } },
        },
      },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });

  type ChannelOut = {
    id: string;
    kind: ChatKind;
    name: string | null;
    description: string | null;
    emoji: string | null;
    lastMessageAt: string | null;
    unread: boolean;
    dmOther?: { id: string; fullName: string; role: string } | null;
  };

  async function buildChannelOut(c: any, ownLastReadAt: Date | null): Promise<ChannelOut> {
    const lastMsg = c.messages[0]?.createdAt ?? null;
    const unread = !!lastMsg && (!ownLastReadAt || new Date(lastMsg) > new Date(ownLastReadAt));
    let dmOther: ChannelOut["dmOther"];
    if (c.kind === "dm") {
      const other = c.members.find((m: any) => m.professionalId !== user!.id)?.professional ?? null;
      dmOther = other;
    }
    return {
      id: c.id,
      kind: c.kind as ChatKind,
      name: c.name,
      description: c.description,
      emoji: c.emoji,
      lastMessageAt: lastMsg ? new Date(lastMsg).toISOString() : null,
      unread,
      dmOther,
    };
  }

  const publicOut = await Promise.all(
    publicChannels.map((c) => buildChannelOut(c, c.members[0]?.lastReadAt ?? null)),
  );
  const memberOut = await Promise.all(
    memberChannels.map((c) => {
      const own = c.members.find((m: any) => m.professionalId === user!.id);
      return buildChannelOut(c, own?.lastReadAt ?? null);
    }),
  );

  return NextResponse.json({
    publicChannels: publicOut,
    privateChannels: memberOut.filter((c) => c.kind === "private"),
    dms: memberOut.filter((c) => c.kind === "dm"),
  });
}

/**
 * POST /api/chat/channels
 * Body: { kind, name?, description?, emoji?, memberIds? }
 *  - "public": solo CEO/HS. Crea canal sin members (lazy-init).
 *  - "private": solo CEO/HS. memberIds = invitados (el creador entra siempre).
 *  - "dm": cualquiera. memberIds debe ser [otherId]; si ya existe, lo reutiliza.
 */
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json().catch(() => ({}));
  const kind = data?.kind;
  if (!isChatKind(kind)) {
    return NextResponse.json({ error: "kind inválido" }, { status: 400 });
  }

  if ((kind === "public" || kind === "private") && !canCreateChannel(user.role)) {
    return NextResponse.json({ error: "Solo CEO y Head-success pueden crear canales" }, { status: 403 });
  }

  if (kind === "public" || kind === "private") {
    const name = typeof data?.name === "string" ? data.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Nombre obligatorio" }, { status: 400 });

    const memberIds: string[] = Array.isArray(data?.memberIds)
      ? data.memberIds.filter((x: unknown) => typeof x === "string")
      : [];

    const channel = await prisma.chatChannel.create({
      data: {
        kind,
        name,
        description: typeof data?.description === "string" ? data.description.trim() || null : null,
        emoji: typeof data?.emoji === "string" ? data.emoji.trim() || null : null,
        createdById: user.id,
      },
    });

    if (kind === "private") {
      // Creador siempre dentro; el resto = memberIds.
      const allIds = Array.from(new Set([user.id, ...memberIds]));
      await prisma.chatMember.createMany({
        data: allIds.map((pid) => ({ channelId: channel.id, professionalId: pid })),
        skipDuplicates: true,
      });
    } else {
      // Público: solo añadimos al creador (el resto entra lazy al abrir).
      await prisma.chatMember.create({
        data: { channelId: channel.id, professionalId: user.id },
      });
    }

    return NextResponse.json({ id: channel.id });
  }

  // DM: requiere exactly otro participante. Si ya existe, devolvemos el existente.
  const memberIds: string[] = Array.isArray(data?.memberIds)
    ? data.memberIds.filter((x: unknown) => typeof x === "string" && x !== user.id)
    : [];
  if (memberIds.length !== 1) {
    return NextResponse.json({ error: "DM requiere exactamente un destinatario" }, { status: 400 });
  }
  const otherId = memberIds[0];

  // Verificar que existe el otro profesional y está activo.
  const other = await prisma.professional.findUnique({
    where: { id: otherId },
    select: { id: true, active: true },
  });
  if (!other || !other.active) {
    return NextResponse.json({ error: "Destinatario no válido" }, { status: 400 });
  }

  // Buscar DM existente con exactly esos dos miembros.
  const existing = await prisma.chatChannel.findFirst({
    where: {
      kind: "dm",
      AND: [
        { members: { some: { professionalId: user.id } } },
        { members: { some: { professionalId: otherId } } },
      ],
    },
    select: { id: true, members: { select: { professionalId: true } } },
  });
  if (existing && existing.members.length === 2) {
    return NextResponse.json({ id: existing.id, reused: true });
  }

  const channel = await prisma.chatChannel.create({
    data: { kind: "dm", createdById: user.id },
  });
  await prisma.chatMember.createMany({
    data: [
      { channelId: channel.id, professionalId: user.id },
      { channelId: channel.id, professionalId: otherId },
    ],
  });
  return NextResponse.json({ id: channel.id });
}
