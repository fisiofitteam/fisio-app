/**
 * POST /api/content/cases/[id]/piece
 *
 * Genera un guion de pieza de contenido (carousel | stories | reel) a
 * partir de los 4 apartados narrativos del ClinicalCase. Devuelve JSON
 * estructurado — NO persiste en el calendario editorial. El CEO copia
 * el guion o lo usa como base en el editor de piezas.
 *
 * Body: { format: "carousel" | "stories" | "reel" }
 */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

const MODEL = "claude-sonnet-4-6";
const MAX_OUTPUT_TOKENS = 3500;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada.");
  _client = new Anthropic({ apiKey });
  return _client;
}

const SYSTEM_PROMPT_BASE = `Eres el copywriter de contenido de FisioFit Team. Tu trabajo es tomar la HISTORIA REAL de un atleta y convertirla en una pieza de Instagram que emocione, conecte y mueva a la accion.

Recibiras el caso completo (los 4 apartados narrativos: como estaba / proceso / obstaculos / logros) y un formato objetivo. Devuelve la pieza EXCLUSIVAMENTE via la tool "submit_piece".

TONO — FisioFit:
- Historia humana primero, datos despues (y sin cifras concretas). Cuenta como SE SENTIA el atleta, no que numeros tenia.
- **NO uses escalas numericas** ("dolor 7/10", "RPE 8", "adherencia 85%"). Traducelo a lenguaje humano.
- **NO nombres programas tecnicos** ("RECUPERA", "CONSOLIDA", "ADVANCE"). Di "el proceso", "el plan", "cuando empezo con nosotros".
- **NO uses jerga medica pura**. Si hay diagnostico, traducelo a lenguaje llano.
- Directo, sin humo. Cero adjetivos vacios ("brutal", "epico", "insano", "increible").
- Empatico. Frases cortas. Ritmo de lectura rapido.
- Hablamos de "atleta" o "paciente", NO de "cliente".
- Cero promesas magicas ni "quema" ni referencias esteticas — hablamos de RENDIMIENTO y BIENESTAR.
- Las CITAS del paciente son ORO. Usalas literales entre comillas si aparecen en el caso. NUNCA inventes citas.
- NO inventes datos ni logros que no esten en el caso.

FRAMEWORK NARRATIVO (aplicable a todos los formatos):
- HOOK: contradice una creencia comun O nombra un sentimiento que la audiencia tiene ("Llevas meses con dolor y ya no sabes si esto se cura?").
- Contexto emocional del punto de partida (que sentia, que temia, lo que ya habia probado sin exito).
- El punto de inflexion / que descubrio en el proceso.
- Resultado humano (como se siente ahora, que vuelve a hacer, la seguridad recuperada). Los hitos concretos van como CIERRE, no como titular.
- CTA final: DM con palabra clave, link en bio, o "cuentame por DM que te esta pasando".`;

const CAROUSEL_INSTRUCTIONS = `FORMATO: CAROUSEL (6-10 slides). Cada slide es una imagen cuadrada 4:5 con texto sobre-impreso.

Devuelve la tool con:
- title: titulo interno de trabajo (max 60 chars).
- hook: hook literal del slide 1 (max 90 chars, punchy, contradictorio o dato).
- caption: pie de post completo para Instagram (200-500 chars, incluye CTA + hashtags opcionales al final).
- slides: array de 6-10 objetos { title (max 40 chars), body (60-180 chars) }.
  * Slide 1: HOOK a pantalla completa (poco body).
  * Slides 2-3: contexto del problema (que le pasaba, lo que ya habia probado).
  * Slides 4-6: proceso / punto de inflexion / que hicimos distinto.
  * Slide 7-8: resultado + una cita del paciente si la hay.
  * Ultimo slide: CTA claro ("¿Tienes este mismo dolor? Escribeme HOMBRO por DM").
- ctaHint: nota corta sobre que palabra clave / link sugieres para la conversion.`;

const STORIES_INSTRUCTIONS = `FORMATO: SECUENCIA DE STORIES (5-8 stories consecutivas). Cada story es vertical, texto breve, ritmo rapido.

Devuelve la tool con:
- title: titulo interno.
- hook: hook del story 1 (max 70 chars).
- caption: NO aplica en stories, deja vacio "".
- slides: array de 5-8 objetos { title (opcional, max 30 chars), body (30-120 chars) }.
  * Story 1: hook + gancho visual sugerido en title (ej. "Foto del atleta antes").
  * Story 2-3: dolor / punto de partida en frases muy cortas.
  * Story 4-6: proceso + inflexion, una idea por story.
  * Story 7-8: resultado + CTA con sticker de link / DM.
- ctaHint: sticker sugerido (encuesta, pregunta, link).`;

const REEL_INSTRUCTIONS = `FORMATO: GUION DE REEL (30-60 seg, vertical). Devuelve texto de planos + texto sobreimpreso + audio/voz en off.

Devuelve la tool con:
- title: titulo interno.
- hook: primeros 3 segundos LITERALES (max 80 chars) — debe hacer parar el scroll.
- caption: pie de reel para Instagram (200-500 chars, incluye CTA + 3-5 hashtags).
- slides: array de 5-8 objetos { title (nombre del plano: "Plano 1 · Atleta en camara"), body (voz en off + texto sobreimpreso separados por " | ") }.
  * Plano 1: hook (0-3s).
  * Plano 2-3: contexto rapido (3-8s).
  * Plano 4-5: proceso / lo distinto (8-20s).
  * Plano 6-7: resultado + prueba visual (20-45s).
  * Ultimo plano: CTA hablado + texto sobreimpreso (45-60s).
- ctaHint: linea final del reel + accion pedida al espectador.`;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const format = String(body?.format ?? "").toLowerCase();
  if (!["carousel", "stories", "reel"].includes(format)) {
    return NextResponse.json({ error: "format debe ser carousel | stories | reel" }, { status: 400 });
  }

  const caseRow = await (prisma as any).clinicalCase.findUnique({ where: { id: params.id } });
  if (!caseRow) return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });

  if (!caseRow.initialSituation && !caseRow.process && !caseRow.achievements) {
    return NextResponse.json(
      { error: "El caso todavia no tiene contenido narrativo. Genera primero el borrador con IA." },
      { status: 400 },
    );
  }

  const instructions =
    format === "carousel" ? CAROUSEL_INSTRUCTIONS :
    format === "stories" ? STORIES_INSTRUCTIONS :
    REEL_INSTRUCTIONS;

  const systemPrompt = `${SYSTEM_PROMPT_BASE}\n\n${instructions}`;

  const tool: Anthropic.Tool = {
    name: "submit_piece",
    description: "Devuelve el guion de la pieza de contenido.",
    input_schema: {
      type: "object",
      required: ["title", "hook", "caption", "slides", "ctaHint"],
      properties: {
        title: { type: "string" },
        hook: { type: "string" },
        caption: { type: "string" },
        slides: {
          type: "array",
          items: {
            type: "object",
            required: ["title", "body"],
            properties: {
              title: { type: "string" },
              body: { type: "string" },
            },
          },
        },
        ctaHint: { type: "string" },
      },
    },
  };

  const userPayload = {
    caseData: {
      athleteName: caseRow.athleteName,
      injury: caseRow.injury,
      initialSituation: caseRow.initialSituation ?? "",
      process: caseRow.process ?? "",
      obstacles: caseRow.obstacles ?? "",
      achievements: caseRow.achievements ?? "",
    },
    format,
  };

  try {
    const msg = await client().messages.create({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      tools: [tool],
      tool_choice: { type: "tool", name: "submit_piece" },
      messages: [{ role: "user", content: JSON.stringify(userPayload) }],
    });

    const toolUse = msg.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
    if (!toolUse) return NextResponse.json({ error: "La IA no devolvio la pieza" }, { status: 502 });

    const parsed = toolUse.input as any;
    return NextResponse.json({
      ok: true,
      format,
      title: String(parsed.title ?? "").trim(),
      hook: String(parsed.hook ?? "").trim(),
      caption: String(parsed.caption ?? "").trim(),
      slides: Array.isArray(parsed.slides)
        ? parsed.slides.slice(0, 12).map((s: any) => ({
            title: String(s?.title ?? "").trim(),
            body: String(s?.body ?? "").trim(),
          }))
        : [],
      ctaHint: String(parsed.ctaHint ?? "").trim(),
    });
  } catch (e: any) {
    console.error("[cases/piece]", e);
    return NextResponse.json({ error: e?.message ?? "Error generando la pieza" }, { status: 500 });
  }
}
