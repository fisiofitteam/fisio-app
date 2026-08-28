/**
 * PATCH /api/content/cases/[id]
 *
 * Actualiza los apartados narrativos + sus videos + consent. Cualquier
 * campo omitido en el body se deja como esta.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

type VideoRef = { url: string; caption?: string };

function sanitizeVideos(input: unknown): VideoRef[] | null {
  if (input === undefined) return null;
  if (!Array.isArray(input)) return [];
  return input
    .map((v: any) => ({
      url: typeof v?.url === "string" ? v.url.trim() : "",
      caption: typeof v?.caption === "string" ? v.caption.trim() : "",
    }))
    .filter((v) => v.url.length > 0);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  const data: any = {};
  if (typeof body.initialSituation === "string") data.initialSituation = body.initialSituation;
  if (typeof body.process === "string") data.process = body.process;
  if (typeof body.obstacles === "string") data.obstacles = body.obstacles;
  if (typeof body.achievements === "string") data.achievements = body.achievements;
  if (typeof body.insight === "string") data.insight = body.insight;
  if (typeof body.notes === "string") data.notes = body.notes || null;
  if (typeof body.consentSigned === "boolean") {
    data.consentSigned = body.consentSigned;
    if (body.consentSigned) data.consentSignedAt = new Date();
  }

  const vidsA = sanitizeVideos(body.initialSituationVideos);
  if (vidsA !== null) data.initialSituationVideos = JSON.stringify(vidsA);
  const vidsB = sanitizeVideos(body.processVideos);
  if (vidsB !== null) data.processVideos = JSON.stringify(vidsB);
  const vidsC = sanitizeVideos(body.obstaclesVideos);
  if (vidsC !== null) data.obstaclesVideos = JSON.stringify(vidsC);
  const vidsD = sanitizeVideos(body.achievementsVideos);
  if (vidsD !== null) data.achievementsVideos = JSON.stringify(vidsD);

  const updated = await (prisma as any).clinicalCase.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json({ ok: true, caseId: updated.id });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const row = await (prisma as any).clinicalCase.findUnique({ where: { id: params.id } });
  if (!row) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const parseVids = (raw: string | null | undefined): VideoRef[] => {
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.filter((v: any) => v && typeof v.url === "string");
    } catch { return []; }
  };

  return NextResponse.json({
    id: row.id,
    athleteName: row.athleteName,
    injury: row.injury,
    insight: row.insight,
    notes: row.notes,
    consentSigned: row.consentSigned,
    consentSignedAt: row.consentSignedAt,
    patientId: row.patientId,
    initialSituation: row.initialSituation,
    process: row.process,
    obstacles: row.obstacles,
    achievements: row.achievements,
    initialSituationVideos: parseVids(row.initialSituationVideos),
    processVideos: parseVids(row.processVideos),
    obstaclesVideos: parseVids(row.obstaclesVideos),
    achievementsVideos: parseVids(row.achievementsVideos),
    aiDraftedAt: row.aiDraftedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
