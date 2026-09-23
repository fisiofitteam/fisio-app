/**
 * PATCH /api/content/stories/ideas/[id]
 *   Edita texto, toggle done, o reordena.
 *
 * DELETE /api/content/stories/ideas/[id]
 *   Borra la idea.
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
  const update: {
    text?: string;
    done?: boolean;
    doneAt?: Date | null;
    order?: number;
  } = {};
  if (typeof body?.text === "string") update.text = body.text.slice(0, 2000);
  if (typeof body?.done === "boolean") {
    update.done = body.done;
    update.doneAt = body.done ? new Date() : null;
  }
  if (typeof body?.order === "number" && Number.isFinite(body.order)) {
    update.order = Math.max(0, Math.floor(body.order));
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const idea = await prisma.storyIdea.update({
    where: { id: params.id },
    data: update,
  });
  return NextResponse.json({ ok: true, idea });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.storyIdea.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
