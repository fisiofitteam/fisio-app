/**
 * POST /api/content/marketer/apply
 *
 * Añade UNA pieza de la propuesta del Marketer IA al calendario. Reutiliza
 * la ContentWeek si ya existe (misma weekNumber + year), o la crea con los
 * datos que la IA propuso.
 *
 * Body:
 *   {
 *     week: {
 *       year: number,
 *       weekNumber: number,
 *       centralTheme: string,
 *       bodyZone: string,
 *       weekType: "educativa" | "objeciones" | "lanzamiento" | "recuperacion",
 *       limitingBeliefs?: string[]
 *     },
 *     piece: {
 *       dayOfWeek: number,       // 1..7
 *       format: string,          // "reel" | "carousel" | ...
 *       title: string,
 *       hook: string,            // se guarda como primer bloque del guion
 *       goals: string[]
 *     }
 *   }
 *
 * Respuesta: { ok, pieceId, weekId, weekCreated }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { isoWeekRange } from "@/lib/content-templates";

const ALLOWED_GOALS = ["atraer", "conectar", "educar", "convertir", "lanzamiento"] as const;
const ALLOWED_FORMATS = ["reel", "carousel", "infographic", "image", "live"] as const;
const ALLOWED_WEEK_TYPES = ["educativa", "objeciones", "lanzamiento", "recuperacion"] as const;

function canAccess(role: string): boolean {
  return role === "ceo" || role === "setter";
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const weekIn = body?.week ?? {};
  const pieceIn = body?.piece ?? {};

  const year = Math.round(Number(weekIn.year));
  const weekNumber = Math.round(Number(weekIn.weekNumber));
  if (!year || !weekNumber || weekNumber < 1 || weekNumber > 53) {
    return NextResponse.json({ error: "year y weekNumber válidos requeridos" }, { status: 400 });
  }

  const dayOfWeek = Math.round(Number(pieceIn.dayOfWeek));
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
    return NextResponse.json({ error: "dayOfWeek debe ser 1..7" }, { status: 400 });
  }

  const format = String(pieceIn.format ?? "");
  if (!ALLOWED_FORMATS.includes(format as any)) {
    return NextResponse.json({ error: `format debe ser uno de: ${ALLOWED_FORMATS.join(", ")}` }, { status: 400 });
  }

  const title = typeof pieceIn.title === "string" ? pieceIn.title.trim() : "";
  const hook = typeof pieceIn.hook === "string" ? pieceIn.hook.trim() : "";
  const goalsRaw = Array.isArray(pieceIn.goals) ? pieceIn.goals : [];
  const goals = goalsRaw
    .map((g: unknown) => String(g))
    .filter((g: string) => (ALLOWED_GOALS as readonly string[]).includes(g));

  // Reutiliza o crea la semana.
  let week = await prisma.contentWeek.findFirst({ where: { year, weekNumber } });
  let weekCreated = false;
  if (!week) {
    const weekType = ALLOWED_WEEK_TYPES.includes(weekIn.weekType) ? weekIn.weekType : "educativa";
    const limitingBeliefs = Array.isArray(weekIn.limitingBeliefs) ? weekIn.limitingBeliefs.map(String) : [];
    const { start, end } = isoWeekRange(year, weekNumber);
    week = await prisma.contentWeek.create({
      data: {
        year,
        weekNumber,
        startDate: start,
        endDate: end,
        centralTheme: String(weekIn.centralTheme ?? "").trim() || "",
        bodyZone: String(weekIn.bodyZone ?? "mixta").trim() || "mixta",
        weekType,
        limitingBeliefs: JSON.stringify(limitingBeliefs),
        mixValue: 50,
        mixBeliefs: 30,
        mixConversion: 20,
        status: "planning",
      },
    });
    weekCreated = true;
  }

  // La "idea principal" viene en `hook` — la guardamos en piece.hook, que
  // es el campo que el editor muestra en el cuadro amarillo "💡 Idea
  // principal". El guion (blocks) SE DEJA VACÍO porque cuando el fisio
  // pulse "Generar con IA" dentro de la pieza, se rellena solo con los
  // planos (Plano 1, Plano 2…) y no queremos duplicidad.
  const piece = await prisma.contentPiece.create({
    data: {
      weekId: week.id,
      dayOfWeek,
      format,
      title: title || null,
      hook: hook || null,
      goals: JSON.stringify(goals),
      goal: "",
      ctaType: "",
      dmKeyword: week.leadMagnetKeyword ?? null,
      blocks: "[]",
      status: "idea",
    },
  });

  return NextResponse.json({
    ok: true,
    pieceId: piece.id,
    weekId: week.id,
    weekCreated,
  });
}
