/**
 * GET /api/content/stories
 *
 * Devuelve los 7 slots de la plantilla semanal de historias, cada uno
 * con sus ideas ordenadas por (done ASC → pendientes primero, order ASC).
 *
 * La primera vez que se llama, crea los 7 slots por defecto vacíos para
 * que el CEO solo tenga que editar el nombre de cada día. Idempotente.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function canAccess(role: string): boolean {
  return role === "ceo" || role === "setter";
}

const DEFAULT_SLOTS: { dayOfWeek: number; formatName: string; emoji: string }[] = [
  { dayOfWeek: 1, formatName: "Formato lunes", emoji: "☕" },
  { dayOfWeek: 2, formatName: "Formato martes", emoji: "💬" },
  { dayOfWeek: 3, formatName: "Formato miércoles", emoji: "🎯" },
  { dayOfWeek: 4, formatName: "Formato jueves", emoji: "📚" },
  { dayOfWeek: 5, formatName: "Formato viernes", emoji: "🔥" },
  { dayOfWeek: 6, formatName: "Formato sábado", emoji: "🎬" },
  { dayOfWeek: 7, formatName: "Formato domingo", emoji: "🌅" },
];

async function ensureSlots(): Promise<void> {
  const count = await prisma.storyTemplateSlot.count();
  if (count >= 7) return;
  for (const s of DEFAULT_SLOTS) {
    await prisma.storyTemplateSlot.upsert({
      where: { dayOfWeek: s.dayOfWeek },
      update: {},
      create: s,
    });
  }
}

export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureSlots();

  const slots = await prisma.storyTemplateSlot.findMany({
    orderBy: { dayOfWeek: "asc" },
    include: {
      ideas: {
        orderBy: [{ done: "asc" }, { order: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  return NextResponse.json({ ok: true, slots });
}
