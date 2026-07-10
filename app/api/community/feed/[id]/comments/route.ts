import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCommunityActor } from "@/lib/community-actor";

const COMMENT_INCLUDE = {
  patient: { select: { fullName: true, photoUrl: true } },
  professional: { select: { fullName: true, photoUrl: true } },
} as const;

type SerializedComment = {
  id: string;
  body: string;
  imageUrl: string | null;
  parentId: string | null;
  createdAt: string;
  authorName: string;
  authorPhotoUrl: string | null;
  isPatient: boolean;
};

function serialize(c: any): SerializedComment {
  return {
    id: c.id,
    body: c.body,
    imageUrl: (c as any).imageUrl ?? null,
    parentId: (c as any).parentId ?? null,
    createdAt: c.createdAt.toISOString(),
    authorName: c.patient?.fullName ?? c.professional?.fullName ?? "Anónimo",
    authorPhotoUrl: c.patient?.photoUrl ?? c.professional?.photoUrl ?? null,
    isPatient: !!c.patientId,
  };
}

// GET /api/community/feed/[id]/comments — comentarios de un post (cronológico).
// Incluye replies como registros normales; el frontend los anida por parentId.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const actor = await getCommunityActor();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const comments = await prisma.communityComment.findMany({
    where: { postId: params.id },
    orderBy: { createdAt: "asc" },
    include: COMMENT_INCLUDE,
  });
  return NextResponse.json(comments.map(serialize));
}

// POST /api/community/feed/[id]/comments — añade comentario o respuesta.
// body: { body, imageUrl?, parentId? }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const actor = await getCommunityActor();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const body = typeof b?.body === "string" ? b.body.trim() : "";
  const imageUrl = typeof b?.imageUrl === "string" && b.imageUrl.trim() ? b.imageUrl.trim() : null;
  const parentId = typeof b?.parentId === "string" && b.parentId ? b.parentId : null;
  if (!body && !imageUrl) {
    return NextResponse.json({ error: "El comentario está vacío." }, { status: 400 });
  }

  // Guard: si viene parentId, el comentario padre debe existir y pertenecer al mismo post.
  if (parentId) {
    const parent = await prisma.communityComment.findUnique({
      where: { id: parentId },
      select: { postId: true },
    });
    if (!parent || parent.postId !== params.id) {
      return NextResponse.json({ error: "Comentario padre no válido" }, { status: 400 });
    }
  }

  const created = await prisma.communityComment.create({
    data: {
      postId: params.id,
      patientId: actor.kind === "patient" ? actor.patientId : null,
      professionalId: actor.kind === "professional" ? actor.professionalId : null,
      body: body || "",
      imageUrl,
      parentId,
    } as any,
    include: COMMENT_INCLUDE,
  });
  return NextResponse.json(serialize(created));
}
