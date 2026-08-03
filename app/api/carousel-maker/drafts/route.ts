/**
 * CRUD de Carousel (drafts generados por IA o creados a mano).
 *
 * GET  ?id=xxx           → un draft concreto
 * GET  ?status=draft     → listado (default status="draft"; acepta "all")
 * PATCH  { id, title?, brief?, category?, slidesJson?, captionText?, status? }
 * DELETE ?id=xxx
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { CAROUSEL_CATEGORIES } from "@/lib/carousel-maker/types";

function canManage(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "fisio";
}

function normalizeCategory(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const valid = CAROUSEL_CATEGORIES.map((c) => c.value);
  return valid.includes(v as any) ? v : null;
}

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const draft = await (prisma as any).carousel.findUnique({ where: { id } });
    if (!draft) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
    return NextResponse.json(draft);
  }

  const status = req.nextUrl.searchParams.get("status") ?? "draft";
  const where: any = status === "all" ? {} : { status };
  const drafts = await (prisma as any).carousel.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return NextResponse.json(drafts);
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({} as any));
  if (!b?.id) return NextResponse.json({ error: "Falta id." }, { status: 400 });

  const data: any = {};
  if (typeof b.title === "string") data.title = b.title.trim();
  if (typeof b.brief === "string") data.brief = b.brief.trim();
  if (b.category !== undefined) data.category = normalizeCategory(b.category);
  if (typeof b.slidesJson === "string") {
    try { JSON.parse(b.slidesJson); data.slidesJson = b.slidesJson; }
    catch { return NextResponse.json({ error: "slidesJson no es JSON válido." }, { status: 400 }); }
  }
  if (typeof b.captionText === "string") data.captionText = b.captionText;
  if (typeof b.visualJson === "string") {
    try { JSON.parse(b.visualJson); data.visualJson = b.visualJson; }
    catch { return NextResponse.json({ error: "visualJson no es JSON válido." }, { status: 400 }); }
  }
  if (typeof b.status === "string" && ["draft", "published", "archived"].includes(b.status)) {
    data.status = b.status;
  }

  const updated = await (prisma as any).carousel.update({ where: { id: b.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id." }, { status: 400 });
  await (prisma as any).carousel.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
