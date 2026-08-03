/**
 * POST /api/carousel-maker/generate
 *
 * Genera un carrusel con IA a partir de un brief. Usa la biblioteca del user
 * como referencia (few-shot) para replicar tono. Guarda el resultado como
 * Carousel con status="draft" y devuelve la fila.
 *
 * Body: { brief: string, category?: string, targetSlides?: number, title?: string }
 * Response: { id: string, ... slides ... caption ... title }
 *
 * Requiere ANTHROPIC_API_KEY. maxDuration=120s (Opus con 3 few-shots
 * puede tardar 20-60s).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { generateCarousel, type LibraryEntry } from "@/lib/carousel-maker/ai";
import { CAROUSEL_CATEGORIES } from "@/lib/carousel-maker/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function canManage(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "fisio";
}

function normalizeCategory(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const valid = CAROUSEL_CATEGORIES.map((c) => c.value);
  return valid.includes(v as any) ? v : null;
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({} as any));
  const brief = typeof b.brief === "string" ? b.brief.trim() : "";
  if (!brief) return NextResponse.json({ error: "Falta el brief." }, { status: 400 });
  if (brief.length < 20) return NextResponse.json({ error: "El brief es muy corto — cuéntame al menos qué tema y qué ángulo." }, { status: 400 });

  const category = normalizeCategory(b.category);
  const targetSlides =
    typeof b.targetSlides === "number" && b.targetSlides >= 3 && b.targetSlides <= 15
      ? Math.round(b.targetSlides)
      : null;

  // Traemos toda la biblioteca; el helper decide cuáles usar como few-shot.
  const library = await (prisma as any).carouselLibraryEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const libraryEntries: LibraryEntry[] = library.map((e: any) => ({
    id: e.id,
    topic: e.topic,
    category: e.category,
    slidesJson: e.slidesJson,
    captionText: e.captionText,
  }));

  if (libraryEntries.length === 0) {
    return NextResponse.json({
      error: "Necesito al menos 1 carrusel en biblioteca para poder imitar tu tono. Añade uno primero en /fisio/contenido/carrusel-maker/biblioteca.",
    }, { status: 400 });
  }

  let generated;
  try {
    generated = await generateCarousel({ brief, category, targetSlides }, libraryEntries);
  } catch (e: any) {
    console.error("[carousel-maker/generate] fallo IA:", e);
    return NextResponse.json({ error: e?.message ?? "Error generando el carrusel." }, { status: 500 });
  }

  const title = typeof b.title === "string" && b.title.trim() ? b.title.trim() : generated.title;

  const draft = await (prisma as any).carousel.create({
    data: {
      title,
      brief,
      category,
      slidesJson: JSON.stringify(generated.slides),
      captionText: generated.caption,
      status: "draft",
      createdById: user.id,
    },
  });

  return NextResponse.json({
    id: draft.id,
    title: draft.title,
    brief: draft.brief,
    category: draft.category,
    slides: generated.slides,
    caption: generated.caption,
    status: draft.status,
    createdAt: draft.createdAt.toISOString(),
  });
}
