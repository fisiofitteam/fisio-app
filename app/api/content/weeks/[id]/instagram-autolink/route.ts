import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { metaConfigured, getRecentMedia, getMediaInsights } from "@/lib/meta";

function canAccess(role: string) {
  return role === "ceo" || role === "setter";
}

// POST /api/content/weeks/[id]/instagram-autolink
// Vincula automáticamente las piezas de la semana (sin vincular) con el post de
// Instagram cuya fecha coincide. Solo enlaza cuando hay UN post ese día (sin
// ambigüedad) y sincroniza sus métricas. Devuelve { linked, skipped }.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!metaConfigured()) return NextResponse.json({ error: "Meta no configurado" }, { status: 400 });

  const week = await prisma.contentWeek.findUnique({
    where: { id: params.id },
    include: { pieces: { where: { igMediaId: null }, select: { id: true, dayOfWeek: true } } },
  });
  if (!week) return NextResponse.json({ error: "Semana no encontrada" }, { status: 404 });

  let media;
  try { media = await getRecentMedia(30); } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 502 }); }

  // Agrupar posts por día (YYYY-MM-DD)
  const byDay = new Map<string, typeof media>();
  for (const m of media) {
    const k = m.timestamp.slice(0, 10);
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(m);
  }

  let linked = 0, skipped = 0;
  for (const p of week.pieces) {
    const pub = new Date(week.startDate);
    pub.setUTCDate(pub.getUTCDate() + (p.dayOfWeek - 1));
    const key = pub.toISOString().slice(0, 10);
    const candidates = byDay.get(key) ?? [];
    if (candidates.length !== 1) { skipped++; continue; } // 0 o varios → ambiguo, manual
    const post = candidates[0];
    try {
      const ins = await getMediaInsights(post.id);
      await prisma.contentPiece.update({
        where: { id: p.id },
        data: {
          igMediaId: post.id,
          metricsReach: ins.reach, metricsSaves: ins.saved, metricsShares: ins.shares,
          metricsComments: ins.comments, metricsLikes: ins.likes, metricsFilledAt: new Date(),
        },
      });
      linked++;
    } catch { skipped++; }
  }

  return NextResponse.json({ ok: true, linked, skipped });
}
