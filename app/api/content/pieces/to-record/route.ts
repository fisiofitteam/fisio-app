/**
 * GET /api/content/pieces/to-record
 *
 * Devuelve todas las piezas en estado "script" (guion listo, pendientes de
 * grabar/diseñar), ordenadas por fecha programada ascendente (más próxima
 * primero).
 *
 * Pensado para la pestaña "Para grabar": ver de un vistazo todo lo que
 * Ales tiene que producir en el box, sin tener que navegar entre semanas.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (user.role !== "ceo" && user.role !== "setter") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pieces = await prisma.contentPiece.findMany({
    where: { status: "script" },
    orderBy: [
      { scheduledAt: "asc" },
      { dayOfWeek: "asc" },
    ],
    include: {
      week: {
        select: {
          id: true,
          weekNumber: true,
          year: true,
          centralTheme: true,
          bodyZone: true,
        },
      },
    },
  });

  return NextResponse.json({
    pieces: pieces.map((p) => ({
      id: p.id,
      dayOfWeek: p.dayOfWeek,
      format: p.format,
      title: p.title,
      hook: p.hook,
      scheduledAt: p.scheduledAt?.toISOString() ?? null,
      recordingLocation: p.recordingLocation,
      recordingOutfit: p.recordingOutfit,
      week: p.week,
    })),
  });
}
