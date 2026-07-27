import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { COMMUNITY_CATEGORY_VALUES, parseCategories } from "@/lib/community";
import { notifyProfessional } from "@/lib/notifications";

function canCommunity(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "fisio";
}

// El cliente espera `categories` como array (parseado). Prisma lo guarda como
// string JSON en el campo. Sin esta normalización el frontend intenta .map()
// sobre un string y crashea.
function serializePost(p: any) {
  return {
    id: p.id,
    date: p.date instanceof Date ? p.date.toISOString() : p.date,
    category: p.category,
    categories: parseCategories(p.categories ?? "[]"),
    assignedToId: p.assignedToId,
    text: p.text,
    note: p.note ?? null,
    done: p.done,
  };
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
  return NextResponse.json(posts.map(serializePost));
}

/** Normaliza el body {category, categories} a un array validado.
 *  Aceptamos ambos por retrocompat: si viene `categories` como array lo
 *  usamos, si no fallback a `category` singular. Devolvemos {first, json}
 *  para poder guardar el campo legacy `category` con la primera y el nuevo
 *  `categories` como JSON string. */
function normalizeCategories(b: any): { first: string; json: string } | null {
  const VALID = COMMUNITY_CATEGORY_VALUES as ReadonlyArray<string>;
  let cats: string[] = [];
  if (Array.isArray(b?.categories)) {
    cats = b.categories.filter((c: any) => typeof c === "string" && VALID.includes(c));
  } else if (typeof b?.category === "string" && VALID.includes(b.category)) {
    cats = [b.category];
  }
  if (cats.length === 0) return null;
  // deduplicamos y limitamos a 5 (el máximo posible = número de categorías).
  cats = Array.from(new Set(cats)).slice(0, 5);
  return { first: cats[0], json: JSON.stringify(cats) };
}

// POST /api/community/posts
// body: { date: "YYYY-MM-DD", category o categories: string[], assignedToId?, text?, note?, fromIdeaId? }
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canCommunity(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const date = parseDay(b?.date);
  if (!date) return NextResponse.json({ error: "Fecha no válida" }, { status: 400 });
  const cats = normalizeCategories(b);
  if (!cats) return NextResponse.json({ error: "Categoría no válida" }, { status: 400 });

  const existing = await prisma.communityPost.findUnique({ where: { date } });
  if (existing) return NextResponse.json({ error: "Ese día ya tiene un post planificado." }, { status: 409 });

  const created = await prisma.$transaction(async (tx) => {
    const post = await tx.communityPost.create({
      data: {
        date,
        category: cats.first,
        categories: cats.json,
        assignedToId: b.assignedToId || null,
        text: b.text?.trim() || null,
        note: b.note?.trim() || null,
        createdById: user.id,
      },
    });
    // Si viene de una idea del banco, la marcamos usada.
    if (b.fromIdeaId) {
      await tx.communityIdea.update({ where: { id: b.fromIdeaId }, data: { used: true } }).catch(() => {});
    }
    return post;
  });

  await notifyAssignedIfNeeded({
    assignedToId: created.assignedToId,
    previousAssignedToId: null,
    actorId: user.id,
    postId: created.id,
    dateISO: created.date.toISOString(),
  });

  return NextResponse.json(serializePost(created));
}

// PATCH /api/community/posts — body: { id, category?, categories?, assignedToId?, text?, note?, done? }
export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canCommunity(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b?.id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const data: any = {};
  if (b.category !== undefined || b.categories !== undefined) {
    const cats = normalizeCategories(b);
    if (cats) {
      data.category = cats.first;
      data.categories = cats.json;
    }
  }
  if (b.assignedToId !== undefined) data.assignedToId = b.assignedToId || null;
  if (b.text !== undefined) data.text = b.text?.trim() || null;
  if (b.note !== undefined) data.note = b.note?.trim() || null;
  if (b.done !== undefined) data.done = !!b.done;

  // Necesitamos el previous assignedToId para saber si el cambio de asignación
  // implica notificar a alguien nuevo.
  const previous = await prisma.communityPost.findUnique({
    where: { id: b.id },
    select: { assignedToId: true },
  });
  const updated = await prisma.communityPost.update({ where: { id: b.id }, data });

  if (b.assignedToId !== undefined) {
    await notifyAssignedIfNeeded({
      assignedToId: updated.assignedToId,
      previousAssignedToId: previous?.assignedToId ?? null,
      actorId: user.id,
      postId: updated.id,
      dateISO: updated.date.toISOString(),
    });
  }

  return NextResponse.json(serializePost(updated));
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

/**
 * Avisa en la campanita al fisio recién asignado a un post. Se salta el aviso
 * cuando el usuario se asigna un post a sí mismo (habitualmente el fisio
 * arrastra la idea del banco y se la queda: ahí no queremos ruido).
 */
async function notifyAssignedIfNeeded(params: {
  assignedToId: string | null;
  previousAssignedToId: string | null;
  actorId: string;
  postId: string;
  dateISO: string;
}) {
  const { assignedToId, previousAssignedToId, actorId, postId, dateISO } = params;
  if (!assignedToId) return;
  if (assignedToId === previousAssignedToId) return;
  if (assignedToId === actorId) return;
  const day = new Date(dateISO).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  await notifyProfessional({
    professionalId: assignedToId,
    type: "community_post_assigned",
    title: "Te han asignado un post",
    body: `Post de comunidad para el ${day}.`,
    actionUrl: `/fisio/comunidad/plan?post=${postId}`,
  }).catch((err) => {
    console.error("[community/posts] notifyProfessional failed", err);
  });
}
