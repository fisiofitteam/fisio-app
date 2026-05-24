/**
 * GET /api/content/pieces/to-record
 *
 * Devuelve todas las piezas en estado "script" (guion listo, pendientes de
 * grabar/diseñar), ordenadas por fecha de publicación ascendente (más próxima
 * primero). La fecha se deriva de week.startDate + (dayOfWeek - 1).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { piecePublishDate } from "@/lib/content-formats";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (user.role !== "ceo" && user.role !== "setter") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pieces = await prisma.contentPiece.findMany({
    where: { status: "script" },
    include: {
      week: {
        select: {
          id: true,
          weekNumber: true,
          year: true,
          centralTheme: true,
          bodyZone: true,
          startDate: true,
        },
      },
    },
  });

  // Ordenar en JS por fecha de publicación derivada
  const sorted = pieces
    .map((p) => ({ ...p, _publishDate: piecePublishDate(p.week.startDate, p.dayOfWeek) }))
    .sort((a, b) => {
      const aTime = a._publishDate?.getTime() ?? 0;
      const bTime = b._publishDate?.getTime() ?? 0;
      return aTime - bTime;
    });

  return NextResponse.json({
    pieces: sorted.map((p) => ({
      id: p.id,
      dayOfWeek: p.dayOfWeek,
      format: p.format,
      title: p.title,
      hook: p.hook,
      publishDate: p._publishDate?.toISOString() ?? null,
      recordingLocation: p.recordingLocation,
      recordingOutfit: p.recordingOutfit,
      week: {
        id: p.week.id,
        weekNumber: p.week.weekNumber,
        year: p.week.year,
        centralTheme: p.week.centralTheme,
        bodyZone: p.week.bodyZone,
      },
    })),
  });
}
