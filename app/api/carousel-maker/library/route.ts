/**
 * CRUD de CarouselLibraryEntry — los carruseles publicados que sirven de
 * referencia al generador de IA. Solo CEO / head_success / fisios manejan
 * el contenido de comunidad, mismos privilegios que /api/community/posts.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { parseCarouselText } from "@/lib/carousel-maker/parse";
import { CAROUSEL_CATEGORIES } from "@/lib/carousel-maker/types";

function canManage(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "fisio";
}

function normalizeCategory(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const valid = CAROUSEL_CATEGORIES.map((c) => c.value);
  return valid.includes(v as any) ? v : null;
}

// GET /api/carousel-maker/library?limit=50
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const limit = Math.min(200, Number(req.nextUrl.searchParams.get("limit") ?? "50") || 50);
  const entries = await (prisma as any).carouselLibraryEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return NextResponse.json(entries);
}

// POST /api/carousel-maker/library
// body: { topic, category?, rawText?, slidesJson?, captionText? }
//   rawText → lo parseamos con parseCarouselText y guardamos slides + caption.
//   O bien mandas directamente slidesJson + captionText.
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({} as any));
  const topic = typeof b.topic === "string" ? b.topic.trim() : "";
  if (!topic) return NextResponse.json({ error: "Falta el tema del carrusel." }, { status: 400 });

  const category = normalizeCategory(b.category);

  let slidesJson: string;
  let captionText: string | null = null;

  if (typeof b.rawText === "string" && b.rawText.trim()) {
    const parsed = parseCarouselText(b.rawText);
    if (parsed.slides.length === 0) {
      return NextResponse.json({ error: "No he detectado slides en el texto. Asegúrate de encabezar cada uno con 'Slide 1', 'Slide 2', etc." }, { status: 400 });
    }
    slidesJson = JSON.stringify(parsed.slides);
    captionText = parsed.caption;
  } else if (typeof b.slidesJson === "string" && b.slidesJson) {
    try {
      const arr = JSON.parse(b.slidesJson);
      if (!Array.isArray(arr) || arr.length === 0) throw new Error("slidesJson vacío");
      slidesJson = b.slidesJson;
      captionText = typeof b.captionText === "string" ? b.captionText : null;
    } catch {
      return NextResponse.json({ error: "slidesJson no es un JSON válido." }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "Necesito rawText o slidesJson." }, { status: 400 });
  }

  const entry = await (prisma as any).carouselLibraryEntry.create({
    data: {
      topic,
      category,
      slidesJson,
      captionText,
      createdById: user.id,
    },
  });
  return NextResponse.json(entry);
}

// PATCH /api/carousel-maker/library
// body: { id, topic?, category?, rawText? o slidesJson?, captionText? }
export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({} as any));
  if (!b?.id) return NextResponse.json({ error: "Falta id." }, { status: 400 });

  const data: any = {};
  if (typeof b.topic === "string") data.topic = b.topic.trim();
  if (b.category !== undefined) data.category = normalizeCategory(b.category);
  if (typeof b.rawText === "string") {
    const parsed = parseCarouselText(b.rawText);
    if (parsed.slides.length > 0) data.slidesJson = JSON.stringify(parsed.slides);
    if (parsed.caption !== null) data.captionText = parsed.caption;
  } else if (typeof b.slidesJson === "string") {
    try {
      JSON.parse(b.slidesJson);
      data.slidesJson = b.slidesJson;
    } catch {
      return NextResponse.json({ error: "slidesJson no es un JSON válido." }, { status: 400 });
    }
  }
  if (typeof b.captionText === "string") data.captionText = b.captionText;

  const updated = await (prisma as any).carouselLibraryEntry.update({ where: { id: b.id }, data });
  return NextResponse.json(updated);
}

// DELETE /api/carousel-maker/library?id=xxx
export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id." }, { status: 400 });
  await (prisma as any).carouselLibraryEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
