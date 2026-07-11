/**
 * /api/rolling-program-types
 *
 * GET     → lista tipos personalizados (ej. "FisioFit Hybrid").
 * POST    → crea tipo. body: { name, description?, aiBriefPrompt? }.
 * PATCH   → edita. body: { id, name?, description?, aiBriefPrompt?, active? }.
 * DELETE  → ?id=X. Si hay programas usándolo, se desasocian (typeId=null)
 *           antes de borrar el tipo.
 *
 * Solo CEO / head_success.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function canManage(role: string): boolean {
  return role === "ceo" || role === "head_success";
}

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await (prisma as any).rollingProgramType.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { programs: true } } },
  });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const name = (b?.name ?? "").toString().trim();
  if (!name) return NextResponse.json({ error: "Nombre obligatorio" }, { status: 400 });

  const description = (b?.description ?? "").toString().trim() || null;
  const aiBriefPrompt = (b?.aiBriefPrompt ?? "").toString().trim() || null;

  const created = await (prisma as any).rollingProgramType.create({
    data: { name, description, aiBriefPrompt },
  }).catch((e: any) => {
    if (e?.code === "P2002") return null;
    throw e;
  });
  if (!created) return NextResponse.json({ error: "Ya existe un tipo con ese nombre" }, { status: 409 });

  return NextResponse.json({ ok: true, id: created.id });
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const id = (b?.id ?? "").toString();
  if (!id) return NextResponse.json({ error: "id obligatorio" }, { status: 400 });

  const data: any = {};
  if (b.name !== undefined) data.name = String(b.name).trim();
  if (b.description !== undefined) data.description = String(b.description).trim() || null;
  if (b.aiBriefPrompt !== undefined) data.aiBriefPrompt = String(b.aiBriefPrompt).trim() || null;
  if (b.active !== undefined) data.active = !!b.active;

  const updated = await (prisma as any).rollingProgramType.update({ where: { id }, data });
  return NextResponse.json({ ok: true, id: updated.id });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obligatorio" }, { status: 400 });

  await prisma.$transaction(async (tx) => {
    // Desasocia programas que usen este tipo (typeId -> null)
    await (tx as any).rollingProgram.updateMany({ where: { typeId: id }, data: { typeId: null } });
    await (tx as any).rollingProgramType.delete({ where: { id } });
  });
  return NextResponse.json({ ok: true });
}
