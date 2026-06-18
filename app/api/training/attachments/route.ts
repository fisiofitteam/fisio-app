import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canManageTraining } from "@/lib/training";

const VALID_KINDS = ["pdf", "link", "image"] as const;
type AttachmentKind = (typeof VALID_KINDS)[number];

function normalizeKind(value: unknown): AttachmentKind | null {
  if (typeof value !== "string") return null;
  return (VALID_KINDS as readonly string[]).includes(value) ? (value as AttachmentKind) : null;
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageTraining(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const data = await req.json().catch(() => ({}));
  const lessonId = typeof data?.lessonId === "string" ? data.lessonId : "";
  const kind = normalizeKind(data?.kind);
  const url = typeof data?.url === "string" ? data.url.trim() : "";
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  if (!lessonId || !kind || !url || !name) {
    return NextResponse.json({ error: "lessonId, kind, url y name requeridos" }, { status: 400 });
  }

  const lastOrder = await prisma.trainingLessonAttachment.findFirst({
    where: { lessonId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const created = await prisma.trainingLessonAttachment.create({
    data: { lessonId, kind, url, name, order: (lastOrder?.order ?? 0) + 1 },
  });
  return NextResponse.json({ id: created.id });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageTraining(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  await prisma.trainingLessonAttachment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
