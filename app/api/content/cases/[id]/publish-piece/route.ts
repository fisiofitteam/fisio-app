/**
 * POST /api/content/cases/[id]/publish-piece
 *
 * Convierte el guion generado por /piece en un editable listo para abrir
 * en el editor VISUAL adecuado segun el formato:
 *
 *   - carousel → fila Carousel + redirect a /fisio/contenido/carrusel-maker/[id]/visual
 *   - stories  → fila ContentStoryTemplate + redirect a /fisio/contenido/story-maker?edit=[id]
 *   - reel     → fila ContentPiece (calendario editorial) + redirect a /fisio/contenido/pieza/[id]
 *
 * La fecha (body.date, YYYY-MM-DD) SOLO se usa para reel — carrusel y
 * stories no tienen slot de calendario en su editor propio.
 *
 * Body:
 *   {
 *     format: "carousel" | "stories" | "reel",
 *     generated: { title, hook, caption, slides: [{title, body}], ctaHint },
 *     date?: "YYYY-MM-DD"   // solo para reel
 *   }
 *
 * Respuesta: { ok: true, editorUrl }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { isoWeekRange } from "@/lib/content-templates";

export const dynamic = "force-dynamic";

function canAccess(role: string): boolean {
  return role === "ceo" || role === "setter";
}

function isoWeekFromDate(date: Date): { year: number; weekNumber: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), weekNumber };
}

function dayOfWeekIso(date: Date): number {
  const dow = date.getDay();
  return dow === 0 ? 7 : dow;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const format = String(body?.format ?? "").toLowerCase();
  if (!["carousel", "stories", "reel"].includes(format)) {
    return NextResponse.json({ error: "format debe ser carousel | stories | reel" }, { status: 400 });
  }

  const generated = body?.generated;
  if (!generated || typeof generated !== "object") {
    return NextResponse.json({ error: "generated requerido" }, { status: 400 });
  }
  const title = typeof generated.title === "string" ? generated.title.trim() : "";
  const hook = typeof generated.hook === "string" ? generated.hook.trim() : "";
  const caption = typeof generated.caption === "string" ? generated.caption.trim() : "";
  const ctaHint = typeof generated.ctaHint === "string" ? generated.ctaHint.trim() : "";
  const slidesRaw: Array<{ title?: string; body?: string }> = Array.isArray(generated.slides) ? generated.slides : [];

  const caseRow = await (prisma as any).clinicalCase.findUnique({
    where: { id: params.id },
    select: { id: true, athleteName: true, injury: true },
  });
  if (!caseRow) return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });

  const workingTitle = title || `${caseRow.athleteName} · ${format}`;

  // ─────────────────────────── CARRUSEL ───────────────────────────
  if (format === "carousel") {
    // Cada slide del guion → objeto { n, title, subtitle, body } que
    // parseSlides() de carousel-maker sabe leer. El hook lo ponemos como
    // slide 1 si no viene ya como slide[0].
    const carouselSlides: any[] = [];
    let n = 1;
    if (hook && slidesRaw[0] && !slidesRaw[0].title?.includes(hook.slice(0, 20))) {
      carouselSlides.push({ n: n++, title: hook, body: "" });
    }
    for (const s of slidesRaw) {
      carouselSlides.push({
        n: n++,
        title: (s.title ?? "").trim() || undefined,
        body: (s.body ?? "").trim() || undefined,
      });
    }
    if (ctaHint) {
      carouselSlides.push({ n: n++, title: "🎯 CTA", body: ctaHint });
    }

    const draft = await (prisma as any).carousel.create({
      data: {
        title: workingTitle.slice(0, 200),
        brief: `Caso de éxito: ${caseRow.athleteName} · ${caseRow.injury}`.slice(0, 500),
        category: null,
        slidesJson: JSON.stringify(carouselSlides),
        captionText: caption || null,
        status: "draft",
        createdById: user.id,
      },
    });

    return NextResponse.json({
      ok: true,
      editorUrl: `/fisio/contenido/carrusel-maker/${draft.id}/visual`,
    });
  }

  // ─────────────────────────── STORIES ───────────────────────────
  if (format === "stories") {
    // Cada slide del guion → un Slide con un TextElement centrado sobre
    // fondo negro. El CEO afinará el visual desde el editor.
    const storySlides = slidesRaw.map((s, i) => {
      const heading = (s.title ?? "").trim();
      const body = (s.body ?? "").trim();
      const combined = heading && body ? `${heading}\n\n${body}` : (body || heading || `Story ${i + 1}`);
      return {
        bgColor: "#0A0A0A",
        bgOverlayOpacity: 0,
        bgGradient: "none",
        elements: [
          {
            id: `t-${i}-${Math.random().toString(36).slice(2, 8)}`,
            type: "text",
            x: 50,
            y: 50,
            width: 80,
            content: combined,
            font: "Antonio",
            size: 68,
            weight: 700,
            color: "#F5F5F5",
            bgColor: "",
            align: "center",
            shadow: false,
            uppercase: false,
            letterSpacing: 0,
          },
        ],
      };
    });

    // Story de HOOK inicial si viene y no aparece ya en slide 1.
    if (hook && !storySlides[0]?.elements[0]?.content?.includes(hook.slice(0, 20))) {
      storySlides.unshift({
        bgColor: "#FBBF24",
        bgOverlayOpacity: 0,
        bgGradient: "none",
        elements: [
          {
            id: `t-hook-${Math.random().toString(36).slice(2, 8)}`,
            type: "text",
            x: 50,
            y: 50,
            width: 85,
            content: hook,
            font: "Antonio",
            size: 88,
            weight: 900,
            color: "#0A0A0A",
            bgColor: "",
            align: "center",
            shadow: false,
            uppercase: true,
            letterSpacing: 0,
          },
        ],
      });
    }

    // CTA final si viene.
    if (ctaHint) {
      storySlides.push({
        bgColor: "#0A0A0A",
        bgOverlayOpacity: 0,
        bgGradient: "none",
        elements: [
          {
            id: `t-cta-${Math.random().toString(36).slice(2, 8)}`,
            type: "text",
            x: 50,
            y: 50,
            width: 80,
            content: ctaHint,
            font: "Antonio",
            size: 62,
            weight: 700,
            color: "#FBBF24",
            bgColor: "",
            align: "center",
            shadow: false,
            uppercase: false,
            letterSpacing: 0,
          },
        ],
      });
    }

    const template = await (prisma as any).contentStoryTemplate.create({
      data: {
        name: workingTitle.slice(0, 200),
        description: `Caso de éxito · ${caseRow.athleteName}`.slice(0, 500),
        jsonSlides: JSON.stringify({ slides: storySlides, aiSlots: [] }),
        createdById: user.id,
      },
    });

    return NextResponse.json({
      ok: true,
      editorUrl: `/fisio/contenido/story-maker?edit=${template.id}`,
    });
  }

  // ─────────────────────────── REEL ───────────────────────────
  // Reel usa el flujo original: crear ContentPiece en la semana de la
  // fecha elegida y redirigir al editor de guion tradicional.
  let date: Date;
  if (typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    date = new Date(body.date + "T12:00:00Z");
  } else {
    date = new Date();
  }
  const { year, weekNumber } = isoWeekFromDate(date);
  const dayOfWeek = dayOfWeekIso(date);

  let week = await prisma.contentWeek.findFirst({ where: { year, weekNumber } });
  if (!week) {
    const { start, end } = isoWeekRange(year, weekNumber);
    week = await prisma.contentWeek.create({
      data: {
        year,
        weekNumber,
        startDate: start,
        endDate: end,
        centralTheme: `Caso · ${caseRow.athleteName}`.slice(0, 100),
        bodyZone: "mixta",
        weekType: "educativa",
        limitingBeliefs: "[]",
        mixValue: 50,
        mixBeliefs: 30,
        mixConversion: 20,
        status: "planning",
      },
    });
  }

  const blocks = slidesRaw.map((s, i) => {
    const slideTitle = (s.title ?? "").trim();
    const slideBody = (s.body ?? "").trim();
    return {
      id: `slide-${i + 1}-${Math.random().toString(36).slice(2, 8)}`,
      label: slideTitle || `Plano ${i + 1}`,
      content: slideBody,
      order: i,
    };
  });
  if (ctaHint && !caption.includes(ctaHint)) {
    blocks.push({
      id: `cta-${Math.random().toString(36).slice(2, 8)}`,
      label: "🎯 CTA",
      content: ctaHint,
      order: blocks.length,
    });
  }

  const piece = await prisma.contentPiece.create({
    data: {
      weekId: week.id,
      dayOfWeek,
      format: "reel",
      title: workingTitle,
      hook: hook || null,
      caption: caption || null,
      goal: "",
      goals: JSON.stringify(["convertir"]),
      ctaType: "",
      dmKeyword: week.leadMagnetKeyword ?? null,
      blocks: JSON.stringify(blocks),
      status: "script",
    },
  });

  return NextResponse.json({
    ok: true,
    editorUrl: `/fisio/contenido/pieza/${piece.id}`,
  });
}
