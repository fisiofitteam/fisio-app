import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { COMMUNITY_CATEGORY_VALUES } from "@/lib/community";

function canCommunity(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "fisio";
}

// GET /api/community/ideas — ideas disponibles (no usadas).
export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canCommunity(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ideas = await prisma.communityIdea.findMany({
    where: { used: false },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(ideas);
}

// POST /api/community/ideas — body: { category, text }
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canCommunity(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!COMMUNITY_CATEGORY_VALUES.includes(b?.category)) {
    return NextResponse.json({ error: "Categoría no válida" }, { status: 400 });
  }
  const text = typeof b?.text === "string" ? b.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Escribe la idea" }, { status: 400 });

  const created = await prisma.communityIdea.create({
    data: { category: b.category, text, createdById: user.id },
  });
  return NextResponse.json(created);
}

// PATCH /api/community/ideas — body: { id, category?, text? }
export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canCommunity(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b?.id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const data: any = {};
  if (b.category !== undefined && COMMUNITY_CATEGORY_VALUES.includes(b.category)) data.category = b.category;
  if (b.text !== undefined) data.text = String(b.text).trim();

  const updated = await prisma.communityIdea.update({ where: { id: b.id }, data });
  return NextResponse.json(updated);
}

// DELETE /api/community/ideas?id=xxx
export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canCommunity(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  await prisma.communityIdea.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
