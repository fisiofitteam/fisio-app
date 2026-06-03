import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCommunityActor } from "@/lib/community-actor";

const COMMENT_INCLUDE = {
  patient: { select: { fullName: true, photoUrl: true } },
  professional: { select: { fullName: true, photoUrl: true } },
} as const;

// GET /api/community/feed/[id]/comments — comentarios de un post (cronológico).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const actor = await getCommunityActor();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const comments = await prisma.communityComment.findMany({
    where: { postId: params.id },
    orderBy: { createdAt: "asc" },
    include: COMMENT_INCLUDE,
  });
  return NextResponse.json(
    comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      authorName: c.patient?.fullName ?? c.professional?.fullName ?? "Anónimo",
      authorPhotoUrl: c.patient?.photoUrl ?? c.professional?.photoUrl ?? null,
      isPatient: !!c.patientId,
    }))
  );
}

// POST /api/community/feed/[id]/comments — añade un comentario. body: { body }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const actor = await getCommunityActor();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const body = typeof b?.body === "string" ? b.body.trim() : "";
  if (!body) return NextResponse.json({ error: "El comentario está vacío." }, { status: 400 });

  const created = await prisma.communityComment.create({
    data: {
      postId: params.id,
      patientId: actor.kind === "patient" ? actor.patientId : null,
      professionalId: actor.kind === "professional" ? actor.professionalId : null,
      body,
    },
    include: COMMENT_INCLUDE,
  });
  return NextResponse.json({
    id: created.id,
    body: created.body,
    createdAt: created.createdAt.toISOString(),
    authorName: created.patient?.fullName ?? created.professional?.fullName ?? "Anónimo",
    authorPhotoUrl: created.patient?.photoUrl ?? created.professional?.photoUrl ?? null,
    isPatient: !!created.patientId,
  });
}
