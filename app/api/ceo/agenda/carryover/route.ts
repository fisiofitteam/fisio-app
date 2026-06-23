/**
 * Arrastra ítems pendientes del día anterior a hoy.
 *
 * POST body: { ids: string[] }
 *   - Cada id es un CeoQuickAgendaItem del día de ayer.
 *   - Para cada uno, creamos una copia hoy (mismo content), pero en las "7
 *     rápidas" (important=false) con `carriedOver=true`. Después borramos el
 *     de ayer para que el historial quede limpio (el usuario ya decidió).
 *
 * Si un slot rápido de hoy (order 0..6) está libre, lo usa; si no, va al
 * siguiente order disponible (más allá de 6, no visible pero se conserva).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canUseCeoPersonal, startOfDayUtc } from "@/lib/ceo-personal";

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const data = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(data?.ids) ? data.ids.filter((x: unknown) => typeof x === "string") : [];
  if (ids.length === 0) return NextResponse.json({ ok: true, created: 0 });

  const today = startOfDayUtc();
  // Validamos propiedad y obtenemos contenidos
  const items = await prisma.ceoQuickAgendaItem.findMany({
    where: { id: { in: ids }, professionalId: user.id },
  });

  // ¿Qué orders quickies están ya ocupados hoy?
  const todayQuickies = await prisma.ceoQuickAgendaItem.findMany({
    where: { professionalId: user.id, date: today, important: false },
    orderBy: { order: "asc" },
    select: { order: true },
  });
  const occupied = new Set(todayQuickies.map((q) => q.order));
  let nextSlot = 0;
  function nextFreeOrder(): number {
    while (occupied.has(nextSlot)) nextSlot++;
    const o = nextSlot;
    occupied.add(o);
    nextSlot++;
    return o;
  }

  let created = 0;
  for (const it of items) {
    const order = nextFreeOrder();
    await prisma.ceoQuickAgendaItem.create({
      data: {
        professionalId: user.id,
        date: today,
        content: it.content,
        order,
        important: false,
        carriedOver: true,
      },
    });
    created++;
  }
  // Borramos los de ayer para que no vuelvan a aparecer en el popup
  await prisma.ceoQuickAgendaItem.deleteMany({
    where: { id: { in: ids }, professionalId: user.id },
  });

  return NextResponse.json({ ok: true, created });
}
