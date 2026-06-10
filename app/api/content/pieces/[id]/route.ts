/**
 * DELETE /api/content/pieces/[id] — borra una pieza de contenido.
 *
 * Solo CEO (la pestaña Contenido la puede gestionar setter, pero borrar
 * piezas es decisión de cabeza). Borrado físico — la pieza desaparece de
 * la semana y del calendario.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Solo el CEO puede borrar piezas" }, { status: 403 });
  }

  const piece = await prisma.contentPiece.findUnique({
    where: { id: params.id },
    select: { id: true, title: true, format: true, weekId: true },
  });
  if (!piece) {
    return NextResponse.json({ error: "Pieza no encontrada" }, { status: 404 });
  }

  await prisma.contentPiece.delete({ where: { id: piece.id } });

  return NextResponse.json({ ok: true, deleted: piece });
}
