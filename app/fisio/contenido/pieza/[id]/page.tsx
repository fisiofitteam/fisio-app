import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { PieceEditor } from "@/components/PieceEditor";
import { metaConfigured, getMediaInsights, getRecentMedia, type MetaPost } from "@/lib/meta";

export const dynamic = "force-dynamic";

export default async function PiecePage({ params }: { params: { id: string } }) {
  const user = (await getActiveProfessional())!;
  if (user.role !== "ceo" && user.role !== "setter") redirect("/fisio");

  const piece = await prisma.contentPiece.findUnique({
    where: { id: params.id },
    include: {
      week: true,
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

  // ── Instagram: sincroniza métricas si la pieza está vinculada; si no, sugiere
  // el post por fecha de publicación (week.startDate + dayOfWeek). ──────────────
  let metrics = {
    reach: piece.metricsReach, saves: piece.metricsSaves,
    shares: piece.metricsShares, comments: piece.metricsComments, likes: piece.metricsLikes,
    filledAt: piece.metricsFilledAt?.toISOString() ?? null,
  };
  let igSuggestion: MetaPost | null = null;
  let igRecent: MetaPost[] = [];

  if (metaConfigured()) {
    if (piece.igMediaId) {
      try {
        const m = await getMediaInsights(piece.igMediaId);
        const now = new Date();
        await prisma.contentPiece.update({
          where: { id: piece.id },
          data: { metricsReach: m.reach, metricsSaves: m.saved, metricsShares: m.shares, metricsComments: m.comments, metricsLikes: m.likes, metricsFilledAt: now },
        });
        metrics = { reach: m.reach, saves: m.saved, shares: m.shares, comments: m.comments, likes: m.likes, filledAt: now.toISOString() };
      } catch {}
    } else {
      try {
        igRecent = await getRecentMedia(15);
        const pub = new Date(piece.week.startDate);
        pub.setUTCDate(pub.getUTCDate() + (piece.dayOfWeek - 1));
        const pubKey = pub.toISOString().slice(0, 10);
        igSuggestion = igRecent.find((p) => p.timestamp.slice(0, 10) === pubKey) ?? null;
      } catch {}
    }
  }

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
        metricsReach: metrics.reach,
        metricsSaves: metrics.saves,
        metricsShares: metrics.shares,
        metricsComments: metrics.comments,
        metricsLikes: metrics.likes,
        metricsDmKeyword: piece.metricsDmKeyword,
        metricsConversions: piece.metricsConversions,
        metricsFilledAt: metrics.filledAt,
        igMediaId: piece.igMediaId,
      }}
      instagram={{
        metaEnabled: metaConfigured(),
        suggestion: igSuggestion,
        recent: igRecent,
      }}
      week={{
        id: piece.week.id,
        centralTheme: piece.week.centralTheme,
        leadMagnetKeyword: piece.week.leadMagnetKeyword,
      }}
      prevId={prevId}
      nextId={nextId}
      canUseAI={user.role === "ceo"}
    />
  );
}
