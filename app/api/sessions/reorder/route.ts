/**
 * POST /api/sessions/reorder
 *
 * Reordena las sesiones de un mismo día del calendario del paciente.
 * Recibe una lista completa (todas las sessionIds de ese día) en el orden
 * deseado. Persiste el índice en el campo ProgramSession.dayOrder — todas
 * las vistas del paciente ordenan por (scheduledDate ASC, dayOrder ASC).
 *
 * Body:
 *   { orderedSessionIds: string[] }
 *
 * Solo miembros del equipo con acceso al panel clínico.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !["ceo", "head_success", "fisio"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const ids: unknown = body?.orderedSessionIds;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "orderedSessionIds vacío" }, { status: 400 });
  }
  const orderedIds = ids.map((x) => String(x));

  // Actualizamos en transacción para que no queden dayOrder inconsistentes
  // si algo falla a la mitad.
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.programSession.update({
        where: { id },
        data: { dayOrder: index },
      })
    )
  );

  return NextResponse.json({ ok: true, count: orderedIds.length });
}
