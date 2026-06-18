// Helpers de chat de equipo. Server-safe (sin "use client").
// Lógica reusada entre endpoints API y Server Components.

import { prisma } from "@/lib/prisma";

export type ChatKind = "public" | "private" | "dm";

export function isChatKind(v: unknown): v is ChatKind {
  return v === "public" || v === "private" || v === "dm";
}

/** ¿Este rol puede crear canales públicos o privados? */
export function canCreateChannel(role: string): boolean {
  return role === "ceo" || role === "head_success";
}

/**
 * Garantiza que el usuario tenga una membresía en el canal. Útil para canales
 * PÚBLICOS donde no creamos miembros al crear el canal (lazy-init); cuando un
 * profesional abre el canal por primera vez, le creamos su ChatMember para
 * poder llevar lastReadAt.
 *
 * No-op si ya existe la membresía.
 */
export async function ensureMembership(channelId: string, professionalId: string): Promise<void> {
  await prisma.chatMember.upsert({
    where: { channelId_professionalId: { channelId, professionalId } },
    create: { channelId, professionalId },
    update: {},
  });
}

/**
 * ¿El usuario puede ver/postear en este canal?
 *  - public: cualquier profesional activo.
 *  - private/dm: solo si tiene ChatMember.
 *
 * Devuelve true/false. Si necesita lazy-init de membership en public,
 * el caller debe llamar a ensureMembership por separado.
 */
export async function canAccessChannel(
  channelId: string,
  professionalId: string,
): Promise<{ ok: boolean; kind: ChatKind | null }> {
  const ch = await prisma.chatChannel.findUnique({
    where: { id: channelId },
    select: { kind: true, archivedAt: true },
  });
  if (!ch) return { ok: false, kind: null };
  const kind = ch.kind as ChatKind;
  if (ch.archivedAt) return { ok: false, kind };
  if (kind === "public") return { ok: true, kind };
  const member = await prisma.chatMember.findUnique({
    where: { channelId_professionalId: { channelId, professionalId } },
    select: { id: true },
  });
  return { ok: !!member, kind };
}

/**
 * Resuelve el "otro participante" en un DM dado un viewerId. Útil para mostrar
 * en el sidebar el nombre del otro lado de la conversación.
 */
export function dmOtherMember<T extends { professionalId: string }>(
  members: T[],
  viewerId: string,
): T | null {
  return members.find((m) => m.professionalId !== viewerId) ?? null;
}
