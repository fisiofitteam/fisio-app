/**
 * Devuelve los ítems de la agenda del día anterior (Madrid TZ) que quedaron
 * SIN completar — para mostrarlos al usuario en un popup al abrir el panel
 * y que decida qué hacer (traer a hoy, marcar hecho o tirar).
 *
 * GET /api/ceo/agenda/yesterday-pending → { items, importantItems, date }
 *
 * Sólo se consideran "pendientes" los que tienen content no vacío y
 * completedAt = null.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canUseCeoPersonal, startOfYesterdayUtc } from "@/lib/ceo-personal";

export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canUseCeoPersonal(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const date = startOfYesterdayUtc();
  const all = await prisma.ceoQuickAgendaItem.findMany({
    where: {
      professionalId: user.id,
      date,
      completedAt: null,
      content: { not: "" },
    },
    orderBy: [{ important: "desc" }, { order: "asc" }],
  });
  const importantItems = all.filter((i) => i.important);
  const items = all.filter((i) => !i.important);
  return NextResponse.json({ items, importantItems, date: date.toISOString() });
}
