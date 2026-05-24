import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { COMMUNITY_CATEGORY_VALUES, parseCategories } from "@/lib/community";

function canCommunity(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "fisio";
}

function shape(i: any) {
  return { id: i.id, categories: parseCategories(i.categories), text: i.text };
}

// Normaliza una lista de categorías recibida del cliente.
function cleanCategories(input: unknown): string[] {
  const arr = Array.isArray(input) ? input : [];
  const valid = arr.map((c) => String(c)).filter((c) => COMMUNITY_CATEGORY_VALUES.includes(c));
  return Array.from(new Set(valid));
}

// GET /api/community/ideas — ideas disponibles (no usadas).
export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canCommunity(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ideas = await prisma.communityIdea.findMany({ where: { used: false }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(ideas.map(shape));
}

// POST /api/community/ideas — body: { categories: string[], text }
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canCommunity(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const categories = cleanCategories(b?.categories);
  if (categories.length === 0) return NextResponse.json({ error: "Elige al menos una categoría" }, { status: 400 });
  const text = typeof b?.text === "string" ? b.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Escribe la idea" }, { status: 400 });

  const created = await prisma.communityIdea.create({
    data: { categories: JSON.stringify(categories), text, createdById: user.id },
  });
  return NextResponse.json(shape(created));
}

// PATCH /api/community/ideas — body: { id, categories?, text? }
export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canCommunity(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b?.id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const data: any = {};
  if (b.categories !== undefined) {
    const categories = cleanCategories(b.categories);
    if (categories.length === 0) return NextResponse.json({ error: "Elige al menos una categoría" }, { status: 400 });
    data.categories = JSON.stringify(categories);
  }
  if (b.text !== undefined) data.text = String(b.text).trim();

  const updated = await prisma.communityIdea.update({ where: { id: b.id }, data });
  return NextResponse.json(shape(updated));
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
