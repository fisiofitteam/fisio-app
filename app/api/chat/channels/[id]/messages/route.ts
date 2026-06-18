import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canAccessChannel, ensureMembership } from "@/lib/chat";

const PAGE_SIZE = 50;

/**
 * GET /api/chat/channels/[id]/messages?before=<iso>
 *
 * Devuelve los últimos PAGE_SIZE mensajes anteriores a `before` (o desde el
 * más reciente si no viene), ordenados ASC por createdAt para pintar tal cual.
 *
 * Si el canal es público y el user no es miembro, lazy-init de membership
 * para empezar a llevarle lastReadAt.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await canAccessChannel(params.id, user.id);
  if (!access.ok) {
    if (access.kind === "public") {
      // Sólo entraría aquí si el canal está archivado.
      return NextResponse.json({ error: "Canal no disponible" }, { status: 404 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (access.kind === "public") {
    await ensureMembership(params.id, user.id);
  }

  const beforeIso = req.nextUrl.searchParams.get("before");
  const before = beforeIso ? new Date(beforeIso) : undefined;

  const messages = await prisma.chatMessage.findMany({
    where: {
      channelId: params.id,
      ...(before ? { createdAt: { lt: before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    select: {
      id: true,
      authorId: true,
      authorName: true,
      body: true,
      mentions: true,
      createdAt: true,
      editedAt: true,
      deletedAt: true,
    },
  });

  // Devolvemos ASC para que el cliente pinte de arriba a abajo.
  return NextResponse.json({
    messages: messages.reverse().map((m) => ({
      id: m.id,
      authorId: m.authorId,
      authorName: m.authorName,
      body: m.deletedAt ? "" : m.body,
      mentions: safeParseStringArray(m.mentions),
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt?.toISOString() ?? null,
      deletedAt: m.deletedAt?.toISOString() ?? null,
    })),
  });
}

/**
 * POST /api/chat/channels/[id]/messages
 * Body: { body: string, mentions?: string[] }  // mentions = professionalIds
 *
 * Crea el mensaje + TeamNotification a cada mencionado con type='chat_mention'.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await canAccessChannel(params.id, user.id);
  if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (access.kind === "public") await ensureMembership(params.id, user.id);

  const data = await req.json().catch(() => ({}));
  const body = typeof data?.body === "string" ? data.body.trim() : "";
  if (!body) return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });

  // Validar menciones: deben ser IDs de profesionales activos y, en privados/
  // DMs, miembros del canal. En públicos, cualquier profesional vale.
  const rawMentions: string[] = Array.isArray(data?.mentions)
    ? data.mentions.filter((x: unknown) => typeof x === "string")
    : [];

  let validMentions: string[] = [];
  if (rawMentions.length > 0) {
    const pros = await prisma.professional.findMany({
      where: { id: { in: rawMentions }, active: true },
      select: { id: true },
    });
    let candidateIds = pros.map((p) => p.id);
    if (access.kind !== "public") {
      const members = await prisma.chatMember.findMany({
        where: { channelId: params.id, professionalId: { in: candidateIds } },
        select: { professionalId: true },
      });
      candidateIds = members.map((m) => m.professionalId);
    }
    // Dedup y sin auto-mención.
    validMentions = Array.from(new Set(candidateIds.filter((id) => id !== user.id)));
  }

  const message = await prisma.chatMessage.create({
    data: {
      channelId: params.id,
      authorId: user.id,
      authorName: user.fullName,
      body,
      mentions: JSON.stringify(validMentions),
    },
    select: {
      id: true,
      authorId: true,
      authorName: true,
      body: true,
      mentions: true,
      createdAt: true,
    },
  });

  // El propio autor pasa a "leído hasta este momento" automáticamente.
  await prisma.chatMember.upsert({
    where: { channelId_professionalId: { channelId: params.id, professionalId: user.id } },
    create: { channelId: params.id, professionalId: user.id, lastReadAt: message.createdAt },
    update: { lastReadAt: message.createdAt },
  });

  // Notificaciones de mención. La integración fina con notification-types y la
  // campanita la cerramos en su tarea propia; aquí ya dejamos las filas creadas.
  if (validMentions.length > 0) {
    const channel = await prisma.chatChannel.findUnique({
      where: { id: params.id },
      select: { name: true, kind: true },
    });
    const channelLabel =
      channel?.kind === "dm"
        ? `chat con ${user.fullName}`
        : channel?.name
        ? `#${channel.name}`
        : "un canal";
    await prisma.teamNotification.createMany({
      data: validMentions.map((targetId) => ({
        targetProfessionalId: targetId,
        type: "chat_mention",
        title: `Te ha mencionado ${user.fullName}`,
        body: `En ${channelLabel}: ${truncate(body, 120)}`,
        actionUrl: `/fisio/chat?canal=${params.id}`,
      })),
    });
  }

  return NextResponse.json({
    id: message.id,
    authorId: message.authorId,
    authorName: message.authorName,
    body: message.body,
    mentions: validMentions,
    createdAt: message.createdAt.toISOString(),
    editedAt: null,
    deletedAt: null,
  });
}

/**
 * PATCH /api/chat/channels/[id]/messages
 * Body: { messageId, body }
 * Solo el autor puede editar; sin cambio de menciones (de momento).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await canAccessChannel(params.id, user.id);
  if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const data = await req.json().catch(() => ({}));
  const messageId = typeof data?.messageId === "string" ? data.messageId : "";
  const body = typeof data?.body === "string" ? data.body.trim() : "";
  if (!messageId || !body) return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });

  const existing = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: { authorId: true, channelId: true, deletedAt: true },
  });
  if (!existing || existing.channelId !== params.id || existing.deletedAt) {
    return NextResponse.json({ error: "Mensaje no encontrado" }, { status: 404 });
  }
  if (existing.authorId !== user.id) {
    return NextResponse.json({ error: "Solo el autor puede editar" }, { status: 403 });
  }
  const updated = await prisma.chatMessage.update({
    where: { id: messageId },
    data: { body, editedAt: new Date() },
    select: { id: true, body: true, editedAt: true },
  });
  return NextResponse.json({
    id: updated.id,
    body: updated.body,
    editedAt: updated.editedAt!.toISOString(),
  });
}

/**
 * DELETE /api/chat/channels/[id]/messages?messageId=...
 * Soft-delete: marca deletedAt. Solo el autor (o CEO/HS) puede borrar.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await canAccessChannel(params.id, user.id);
  if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const messageId = req.nextUrl.searchParams.get("messageId");
  if (!messageId) return NextResponse.json({ error: "messageId requerido" }, { status: 400 });

  const existing = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: { authorId: true, channelId: true },
  });
  if (!existing || existing.channelId !== params.id) {
    return NextResponse.json({ error: "Mensaje no encontrado" }, { status: 404 });
  }
  const isAuthor = existing.authorId === user.id;
  const isManager = user.role === "ceo" || user.role === "head_success";
  if (!isAuthor && !isManager) {
    return NextResponse.json({ error: "No puedes borrar este mensaje" }, { status: 403 });
  }
  await prisma.chatMessage.update({
    where: { id: messageId },
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}

function safeParseStringArray(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
