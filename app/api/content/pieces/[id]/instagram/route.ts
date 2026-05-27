import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getMediaInsights } from "@/lib/meta";

function canAccess(role: string) {
  return role === "ceo" || role === "setter";
}

// POST /api/content/pieces/[id]/instagram
//   body { mediaId }        → vincula el post y sincroniza métricas
//   body { action:"unlink"} → desvincula
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));

  if (b?.action === "unlink") {
    await prisma.contentPiece.update({ where: { id: params.id }, data: { igMediaId: null } });
    return NextResponse.json({ ok: true, unlinked: true });
  }

  const mediaId = typeof b?.mediaId === "string" ? b.mediaId : "";
  if (!mediaId) return NextResponse.json({ error: "mediaId requerido" }, { status: 400 });

  try {
    const m = await getMediaInsights(mediaId);
    const updated = await prisma.contentPiece.update({
      where: { id: params.id },
      data: {
        igMediaId: mediaId,
        metricsReach: m.reach,
        metricsSaves: m.saved,
        metricsShares: m.shares,
        metricsComments: m.comments,
        metricsFilledAt: new Date(),
      },
      select: { metricsReach: true, metricsSaves: true, metricsShares: true, metricsComments: true },
    });
    return NextResponse.json({ ok: true, metrics: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
