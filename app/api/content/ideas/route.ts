import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function canAccess(role: string): boolean {
  return role === "ceo" || role === "setter";
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const d = await req.json();
  const idea = await prisma.contentIdea.create({
    data: {
      title: d.title,
      description: d.description || null,
      funnelStage: d.funnelStage || "educate",
      bodyZone: d.bodyZone || null,
      suggestedFormat: d.suggestedFormat || null,
    },
  });
  return NextResponse.json(idea);
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, ...rest } = await req.json();
  const update: any = {};
  if (rest.title !== undefined) update.title = rest.title;
  if (rest.description !== undefined) update.description = rest.description || null;
  if (rest.funnelStage !== undefined) update.funnelStage = rest.funnelStage;
  if (rest.bodyZone !== undefined) update.bodyZone = rest.bodyZone || null;
  if (rest.suggestedFormat !== undefined) update.suggestedFormat = rest.suggestedFormat || null;
  if (rest.used !== undefined) update.used = !!rest.used;
  if (rest.usedPieceId !== undefined) update.usedPieceId = rest.usedPieceId || null;
  const idea = await prisma.contentIdea.update({ where: { id }, data: update });
  return NextResponse.json(idea);
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await prisma.contentIdea.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
