/**
 * GET/POST /api/cron/sync-content-metrics
 *
 * Cron diario que trae las últimas ~50 publicaciones de Instagram y actualiza
 * las métricas de cada ContentPiece publicada:
 *  1. Si igMediaId ya está vinculado → refresca métricas (reach/saves/etc).
 *  2. Si no está vinculado → intenta emparejar por fecha (±1,5 días) + formato.
 *     Si hay match único, guarda el igMediaId y vuelca las métricas.
 *
 * Protección: Vercel Cron envía Authorization: Bearer $CRON_SECRET.
 * Modo manual (desde UI CEO/setter): se puede llamar con ?manual=1 y sesión.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRecentMedia, getMediaInsights, metaConfigured } from "@/lib/meta";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Mapeo entre formato interno de ContentPiece y media_type de Instagram Graph.
// - "reel" → VIDEO (los reels aparecen como VIDEO en Graph, y también coincide
//   con vídeos normales; para MVP nos vale — casi todos los vídeos son reels).
// - "carousel" → CAROUSEL_ALBUM.
// - "image"/"infographic" → IMAGE.
// - "live" → no se retorna vía /media por lo general; skip.
const FORMAT_TO_IG_TYPE: Record<string, string[]> = {
  reel: ["VIDEO"],
  carousel: ["CAROUSEL_ALBUM"],
  image: ["IMAGE"],
  infographic: ["IMAGE"],
  live: [],
};

async function handler(req: NextRequest) {
  const isManual = req.nextUrl.searchParams.get("manual") === "1";
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const isLocal = process.env.NODE_ENV !== "production";

  if (isManual) {
    // Modo manual: exige sesión CEO/setter/head_success.
    const user = await getActiveProfessional();
    if (!user || (user.role !== "ceo" && user.role !== "head_success" && user.role !== "setter")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (cronSecret) {
    if (auth !== `Bearer ${cronSecret}` && !isLocal) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!metaConfigured()) {
    return NextResponse.json({ ok: false, reason: "meta_not_configured" });
  }

  // 1. Trae las 50 publicaciones más recientes.
  let media: Awaited<ReturnType<typeof getRecentMedia>>;
  try {
    media = await getRecentMedia(50);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `meta_error: ${e?.message ?? "?"}` }, { status: 502 });
  }
  if (media.length === 0) return NextResponse.json({ ok: true, mediaFetched: 0, refreshed: 0, matched: 0, ambiguous: 0 });

  const mediaById = new Map(media.map((m) => [m.id, m]));
  const now = new Date();

  // 2. Refrescar piezas ya vinculadas.
  const linkedPieces = await prisma.contentPiece.findMany({
    where: { igMediaId: { not: null } },
  });
  const alreadyLinkedIds = new Set(linkedPieces.map((p) => p.igMediaId!).filter(Boolean));

  let refreshed = 0;
  let refreshFailed = 0;
  for (const p of linkedPieces) {
    const mediaId = p.igMediaId!;
    const m = mediaById.get(mediaId);
    try {
      let reach = 0, saved = 0, shares = 0, likes = 0, comments = 0;
      if (m) {
        reach = m.reach; saved = m.saved; shares = m.shares; likes = m.likes; comments = m.comments;
      } else {
        // Publicación fuera del batch reciente — pedimos insights sueltos.
        const ins = await getMediaInsights(mediaId);
        reach = ins.reach; saved = ins.saved; shares = ins.shares; likes = ins.likes; comments = ins.comments;
      }
      await prisma.contentPiece.update({
        where: { id: p.id },
        data: {
          metricsReach: reach,
          metricsSaves: saved,
          metricsShares: shares,
          metricsLikes: likes,
          metricsComments: comments,
          metricsFilledAt: now,
        },
      });
      refreshed++;
    } catch {
      refreshFailed++;
    }
  }

  // 3. Emparejar piezas publicadas sin vincular por fecha + formato.
  const unlinkedPublished = await prisma.contentPiece.findMany({
    where: { status: "published", igMediaId: null },
    include: { week: { select: { startDate: true } } },
  });

  let matched = 0;
  let ambiguous = 0;
  for (const p of unlinkedPublished) {
    // Fecha teórica de publicación: startDate del ContentWeek + (dayOfWeek - 1) días.
    const pDate = new Date(p.week.startDate);
    pDate.setUTCDate(pDate.getUTCDate() + (p.dayOfWeek - 1));

    const acceptedTypes = new Set(FORMAT_TO_IG_TYPE[p.format] ?? []);
    if (acceptedTypes.size === 0) continue;

    const candidates = media.filter((m) => {
      if (alreadyLinkedIds.has(m.id)) return false;
      if (!acceptedTypes.has(m.mediaType)) return false;
      const mDate = new Date(m.timestamp);
      const diffDays = Math.abs(mDate.getTime() - pDate.getTime()) / 86400000;
      return diffDays <= 1.5;
    });

    if (candidates.length === 1) {
      const m = candidates[0];
      await prisma.contentPiece.update({
        where: { id: p.id },
        data: {
          igMediaId: m.id,
          metricsReach: m.reach,
          metricsSaves: m.saved,
          metricsShares: m.shares,
          metricsLikes: m.likes,
          metricsComments: m.comments,
          metricsFilledAt: now,
        },
      });
      alreadyLinkedIds.add(m.id);
      matched++;
    } else if (candidates.length > 1) {
      ambiguous++;
    }
  }

  return NextResponse.json({
    ok: true,
    mediaFetched: media.length,
    refreshed,
    refreshFailed,
    matched,
    ambiguous,
    unlinkedRemaining: unlinkedPublished.length - matched,
  });
}

export async function GET(req: NextRequest) { return handler(req); }
export async function POST(req: NextRequest) { return handler(req); }
