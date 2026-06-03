import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { COMMUNITY_CATEGORY_VALUES } from "@/lib/community";

function canCommunity(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "fisio";
}

// Parsea "YYYY-MM-DD" a Date en UTC midnight.
function parseDay(s: unknown): Date | null {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00.000Z");
  return isNaN(d.getTime()) ? null : d;
}

// GET /api/community/posts?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canCommunity(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const from = parseDay(req.nextUrl.searchParams.get("from"));
  const to = parseDay(req.nextUrl.searchParams.get("to"));
  const where: any = {};
  if (from && to) where.date = { gte: from, lt: to };

  const posts = await prisma.communityPost.findMany({ where, orderBy: { date: "asc" } });
  return NextResponse.json(posts);
}

// POST /api/community/posts
// body: { date: "YYYY-MM-DD", category, assignedToId?, text?, fromIdeaId? }
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canCommunity(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const date = parseDay(b?.date);
  if (!date) return NextResponse.json({ error: "Fecha no válida" }, { status: 400 });
  if (!COMMUNITY_CATEGORY_VALUES.includes(b?.category)) {
    return NextResponse.json({ error: "Categoría no válida" }, { status: 400 });
  }

  const existing = await prisma.communityPost.findUnique({ where: { date } });
  if (existing) return NextResponse.json({ error: "Ese día ya tiene un post planificado." }, { status: 409 });

  const created = await prisma.$transaction(async (tx) => {
    const post = await tx.communityPost.create({
      data: {
        date,
        category: b.category,
        assignedToId: b.assignedToId || null,
        text: b.text?.trim() || null,
        createdById: user.id,
      },
    });
    // Si viene de una idea del banco, la marcamos usada.
    if (b.fromIdeaId) {
      await tx.communityIdea.update({ where: { id: b.fromIdeaId }, data: { used: true } }).catch(() => {});
    }
    return post;
  });

  return NextResponse.json(created);
}

// PATCH /api/community/posts — body: { id, category?, assignedToId?, text?, done? }
export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canCommunity(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b?.id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const data: any = {};
  if (b.category !== undefined && COMMUNITY_CATEGORY_VALUES.includes(b.category)) data.category = b.category;
  if (b.assignedToId !== undefined) data.assignedToId = b.assignedToId || null;
  if (b.text !== undefined) data.text = b.text?.trim() || null;
  if (b.done !== undefined) data.done = !!b.done;

  const updated = await prisma.communityPost.update({ where: { id: b.id }, data });
  return NextResponse.json(updated);
}

// DELETE /api/community/posts?id=xxx
export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canCommunity(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  await prisma.communityPost.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
