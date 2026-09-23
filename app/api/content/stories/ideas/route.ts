/**
 * POST /api/content/stories/ideas
 *
 * Crea una nueva idea colgada de un slot (día de la semana).
 * Order = MAX(order) + 1 dentro del slot para que aparezca al final.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function canAccess(role: string): boolean {
  return role === "ceo" || role === "setter";
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const templateSlotId = String(body?.templateSlotId ?? "").trim();
  const text = String(body?.text ?? "").trim().slice(0, 2000);

  if (!templateSlotId) return NextResponse.json({ error: "templateSlotId requerido" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "text requerido" }, { status: 400 });

  const slot = await prisma.storyTemplateSlot.findUnique({ where: { id: templateSlotId } });
  if (!slot) return NextResponse.json({ error: "Slot no existe" }, { status: 404 });

  const maxOrder = await prisma.storyIdea.aggregate({
    where: { templateSlotId },
    _max: { order: true },
  });

  const idea = await prisma.storyIdea.create({
    data: {
      templateSlotId,
      text,
      order: (maxOrder._max.order ?? 0) + 1,
    },
  });

  return NextResponse.json({ ok: true, idea });
}
