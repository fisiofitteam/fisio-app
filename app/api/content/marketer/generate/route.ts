/**
 * POST /api/content/marketer/generate
 *
 * Marketer IA: recibe un brief del CEO ("lanzamiento X día, 2 semanas
 * antes, 3 reels + 1 carrusel/sem") y devuelve una propuesta de estrategia
 * con semanas y piezas. NO persiste nada — el CEO decide qué añadir con
 * el endpoint /apply.
 *
 * Body:
 *   {
 *     brief: string,               // texto libre del CEO
 *     targetDate?: string,         // YYYY-MM-DD (lanzamiento, opcional)
 *     weeksAhead?: number,         // cuántas semanas planificar (1-8, default 2)
 *     piecesPerWeek?: {            // mezcla por semana
 *       reel?: number;
 *       carousel?: number;
 *       infographic?: number;
 *       image?: number;
 *       live?: number;
 *     }
 *   }
 *
 * Respuesta:
 *   {
 *     ok: true,
 *     strategy: string,            // resumen del arco narrativo (2-4 frases)
 *     weeks: [{
 *       weekOffset: number,        // 0 = semana que viene, 1 = la siguiente...
 *       centralTheme: string,
 *       bodyZone: string,
 *       weekType: "educativa" | "objeciones" | "lanzamiento" | "recuperacion",
 *       limitingBeliefs: string[],
 *       pieces: [{
 *         dayOfWeek: number,       // 1..7
 *         format: "reel" | "carousel" | "infographic" | "image" | "live",
 *         title: string,
 *         hook: string,
 *         goals: string[],
 *         rationale: string        // 1-2 frases: por qué esta pieza aquí
 *       }]
 *     }]
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getAiBrief } from "@/lib/ai-brief";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";
const MAX_OUTPUT_TOKENS = 6000;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada.");
  _client = new Anthropic({ apiKey });
  return _client;
}

function canAccess(role: string): boolean {
  return role === "ceo" || role === "setter";
}

function systemPrompt(brief: Awaited<ReturnType<typeof getAiBrief>>): string {
  return [
    "Eres el Marketer IA de FisioFit Team, una clínica de fisioterapia online para atletas de CrossFit.",
    "Tu trabajo: diseñar estrategias de contenido de Instagram accionables — semanas con tema central + piezas concretas (hook + objetivo + rationale).",
    "",
    "CONTEXTO DE LA MARCA:",
    brief.brand || "(sin brief configurado)",
    "",
    "TONO DE VOZ:",
    brief.voiceTone || "cercano, profesional, sin postureo médico, sin promesas absolutas",
    "",
    "SÍ HACER:",
    brief.dos || "",
    "",
    "NO HACER:",
    brief.donts || "",
    "",
    "ESTRUCTURA HABITUAL DE UNA SEMANA:",
    brief.structureHints || "Lunes pregunta/dolor, Martes mito, Miércoles ejercicio, Jueves caso, Viernes CTA/lead magnet",
    "",
    "OBJETIVOS DE PIEZA (elige 1-2 por pieza):",
    "  - atraer: hook de alcance frío, tema polémico o gancho fuerte",
    "  - conectar: contenido personal, historia, vulnerabilidad",
    "  - educar: mito/verdad, técnica, ejercicio, tutorial",
    "  - convertir: CTA a lead magnet o programa, testimonio, resultado",
    "  - lanzamiento: pieza de un bloque de lanzamiento (recordatorio, urgencia, apertura, cierre)",
    "",
    "TIPOS DE SEMANA:",
    "  - educativa: mezcla estándar, sin lanzamiento activo",
    "  - objeciones: rebatir creencias limitantes de la audiencia",
    "  - lanzamiento: promoción activa de un programa o servicio nuevo",
    "  - recuperacion: bajar intensidad tras lanzamiento, sanar la audiencia",
    "",
    "FORMATOS DISPONIBLES:",
    "  - reel: vídeo corto vertical (default para alcance)",
    "  - carousel: 6-10 slides de imagen o texto (default para educar/profundizar)",
    "  - infographic: pieza estática única (menos común)",
    "  - image: foto suelta (personal/behind the scenes)",
    "  - live: directo",
    "",
    "IMPORTANTE:",
    "- Responde SOLO con la herramienta `submit_strategy`, sin texto adicional.",
    "- Si el CEO especifica una fecha de lanzamiento, alinea la semana de lanzamiento con ella.",
    "- Si el CEO pide una mezcla concreta (ej. 3 reels + 1 carrusel/semana), respétala exactamente.",
    "- Titles cortos y específicos. Hook = frase de apertura literal (no descripción del hook).",
    "- Rationale en 1-2 frases explicando por qué esa pieza en ese slot.",
  ].join("\n");
}

function buildUserPrompt(input: {
  brief: string;
  targetDate?: string;
  weeksAhead: number;
  piecesPerWeek?: Record<string, number>;
  recentThemes: string[];
}): string {
  const mix = input.piecesPerWeek && Object.keys(input.piecesPerWeek).length > 0
    ? Object.entries(input.piecesPerWeek)
        .filter(([, n]) => n && n > 0)
        .map(([f, n]) => `${n}× ${f}`)
        .join(" + ")
    : "libre — decide tú la mezcla óptima";
  const themesLine = input.recentThemes.length > 0
    ? `\n\nTEMAS RECIENTES YA TRATADOS (evita repetirlos exactos):\n${input.recentThemes.slice(0, 12).map((t) => `- ${t}`).join("\n")}`
    : "";
  return [
    `BRIEF DEL CEO:\n${input.brief.trim()}`,
    input.targetDate ? `\nFECHA OBJETIVO (lanzamiento): ${input.targetDate}` : "",
    `\nHORIZONTE: ${input.weeksAhead} semana${input.weeksAhead === 1 ? "" : "s"} a partir del próximo lunes.`,
    `\nMEZCLA POR SEMANA: ${mix}`,
    themesLine,
    "\n\nGenera la estrategia usando la herramienta `submit_strategy`.",
  ].join("");
}

async function handle(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const briefText = typeof body?.brief === "string" ? body.brief.trim() : "";
  if (briefText.length < 10) {
    return NextResponse.json({ error: "Escribe un brief más detallado (mínimo 10 caracteres)" }, { status: 400 });
  }
  const weeksAhead = Math.max(1, Math.min(8, Math.round(Number(body?.weeksAhead) || 2)));
  const targetDate = typeof body?.targetDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.targetDate)
    ? body.targetDate
    : undefined;
  const piecesPerWeek = (body?.piecesPerWeek && typeof body.piecesPerWeek === "object")
    ? body.piecesPerWeek
    : undefined;

  // Contexto: temas recientes ya tratados (últimas 6 semanas) para evitar repetir.
  const recentWeeks = await prisma.contentWeek.findMany({
    orderBy: { startDate: "desc" },
    take: 6,
    select: { centralTheme: true, bodyZone: true },
  });
  const recentThemes = recentWeeks
    .map((w) => w.centralTheme?.trim())
    .filter((t): t is string => !!t);

  const brief = await getAiBrief();

  // Tool para forzar JSON estructurado.
  const tool: Anthropic.Tool = {
    name: "submit_strategy",
    description: "Envía la estrategia de contenido propuesta al panel del CEO.",
    input_schema: {
      type: "object",
      required: ["strategy", "weeks"],
      properties: {
        strategy: { type: "string", description: "Resumen del arco narrativo (2-4 frases)." },
        weeks: {
          type: "array",
          items: {
            type: "object",
            required: ["weekOffset", "centralTheme", "bodyZone", "weekType", "pieces"],
            properties: {
              weekOffset: { type: "number", description: "0 = semana que viene, 1 = la siguiente..." },
              centralTheme: { type: "string" },
              bodyZone: { type: "string", description: "Ej. hombro, rodilla, lumbar, mixta" },
              weekType: {
                type: "string",
                enum: ["educativa", "objeciones", "lanzamiento", "recuperacion"],
              },
              limitingBeliefs: {
                type: "array",
                items: { type: "string" },
                description: "Creencias limitantes que se atacan esta semana",
              },
              pieces: {
                type: "array",
                items: {
                  type: "object",
                  required: ["dayOfWeek", "format", "title", "hook", "goals", "rationale"],
                  properties: {
                    dayOfWeek: { type: "number", description: "1=Lun ... 7=Dom" },
                    format: {
                      type: "string",
                      enum: ["reel", "carousel", "infographic", "image", "live"],
                    },
                    title: { type: "string" },
                    hook: { type: "string" },
                    goals: {
                      type: "array",
                      items: {
                        type: "string",
                        enum: ["atraer", "conectar", "educar", "convertir", "lanzamiento"],
                      },
                    },
                    rationale: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  try {
    const msg = await client().messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt(brief),
      tools: [tool],
      tool_choice: { type: "tool", name: "submit_strategy" },
      messages: [
        {
          role: "user",
          content: buildUserPrompt({
            brief: briefText,
            targetDate,
            weeksAhead,
            piecesPerWeek,
            recentThemes,
          }),
        },
      ],
    });

    // Extraer el tool_use.
    const toolUse = msg.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
    if (!toolUse) {
      return NextResponse.json({ error: "La IA no devolvió estrategia" }, { status: 502 });
    }
    const parsed = toolUse.input as any;
    return NextResponse.json({
      ok: true,
      strategy: String(parsed.strategy ?? ""),
      weeks: Array.isArray(parsed.weeks) ? parsed.weeks : [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error generando estrategia" }, { status: 500 });
  }
}

export { handle as POST };
