/**
 * PATCH /api/content/stories/slots/[id]
 *
 * Actualiza el nombre / emoji / color de un slot de la plantilla
 * (día de la semana). Solo esos tres campos son editables — el
 * dayOfWeek es fijo.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function canAccess(role: string): boolean {
  return role === "ceo" || role === "setter";
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const update: { formatName?: string; emoji?: string | null; color?: string | null } = {};
  if (typeof body?.formatName === "string") update.formatName = body.formatName.trim().slice(0, 120);
  if (body?.emoji !== undefined) update.emoji = body.emoji ? String(body.emoji).slice(0, 8) : null;
  if (body?.color !== undefined) update.color = body.color ? String(body.color).slice(0, 20) : null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const slot = await prisma.storyTemplateSlot.update({
    where: { id: params.id },
    data: update,
  });
  return NextResponse.json({ ok: true, slot });
}
