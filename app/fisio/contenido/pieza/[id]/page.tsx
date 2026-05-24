import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { PieceEditor } from "@/components/PieceEditor";

export default async function PiecePage({ params }: { params: { id: string } }) {
  const user = (await getActiveProfessional())!;
  if (user.role !== "ceo" && user.role !== "setter") redirect("/fisio");

  const piece = await prisma.contentPiece.findUnique({
    where: { id: params.id },
    include: {
      week: true,
      supportStories: { orderBy: { order: "asc" } },
    },
  });
  if (!piece) notFound();

  // Hermanas (mismas semana) para navegación
  const siblings = await prisma.contentPiece.findMany({
    where: { weekId: piece.weekId },
    orderBy: { dayOfWeek: "asc" },
    select: { id: true, dayOfWeek: true, format: true, status: true },
  });

  const idx = siblings.findIndex((s) => s.id === piece.id);
  const prevId = idx > 0 ? siblings[idx - 1].id : null;
  const nextId = idx < siblings.length - 1 ? siblings[idx + 1].id : null;

  const blocks = JSON.parse(piece.blocks) as { id: string; label: string; content: string; order: number }[];

  return (
    <PieceEditor
      piece={{
        id: piece.id,
        weekId: piece.weekId,
        dayOfWeek: piece.dayOfWeek,
        format: piece.format,
        title: piece.title,
        goals: piece.goals,
        goal: piece.goal,
        ctaType: piece.ctaType,
        dmKeyword: piece.dmKeyword,
        hook: piece.hook,
        blocks,
        caption: piece.caption,
        recordingLocation: piece.recordingLocation,
        recordingOutfit: piece.recordingOutfit,
        recordingMaterial: piece.recordingMaterial,
        consentSigned: piece.consentSigned,
        finalFileUrl: piece.finalFileUrl,
        editorNotes: piece.editorNotes,
        status: piece.status,
        scheduledAt: piece.scheduledAt?.toISOString() ?? null,
        metricsReach: piece.metricsReach,
        metricsSaves: piece.metricsSaves,
        metricsShares: piece.metricsShares,
        metricsComments: piece.metricsComments,
        metricsDmKeyword: piece.metricsDmKeyword,
        metricsConversions: piece.metricsConversions,
        metricsFilledAt: piece.metricsFilledAt?.toISOString() ?? null,
      }}
      week={{
        id: piece.week.id,
        centralTheme: piece.week.centralTheme,
        leadMagnetKeyword: piece.week.leadMagnetKeyword,
      }}
      stories={piece.supportStories.map((s) => ({
        id: s.id,
        description: s.description,
        published: s.published,
        order: s.order,
      }))}
      prevId={prevId}
      nextId={nextId}
    />
  );
}
