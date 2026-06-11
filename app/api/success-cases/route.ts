import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function canManage(role: string): boolean {
  return role === "ceo" || role === "head_success";
}

/**
 * GET /api/success-cases — listado. Todos los profesionales pueden listarlos
 * (los necesitan en el selector al enviar). Filtramos active=true.
 */
export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cases = await prisma.successCase.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(cases);
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { name, injury, youtubeUrl, notes } = await req.json();
  if (!name?.trim() || !injury?.trim() || !youtubeUrl?.trim()) {
    return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 });
  }
  const created = await prisma.successCase.create({
    data: {
      name: name.trim(),
      injury: injury.trim(),
      youtubeUrl: youtubeUrl.trim(),
      notes: notes?.trim() || null,
    },
  });
  return NextResponse.json(created);
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id, name, injury, youtubeUrl, notes, active } = await req.json();
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const updated = await prisma.successCase.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: String(name).trim() }),
      ...(injury !== undefined && { injury: String(injury).trim() }),
      ...(youtubeUrl !== undefined && { youtubeUrl: String(youtubeUrl).trim() }),
      ...(notes !== undefined && { notes: notes?.trim() || null }),
      ...(active !== undefined && { active: !!active }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await prisma.successCase.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
