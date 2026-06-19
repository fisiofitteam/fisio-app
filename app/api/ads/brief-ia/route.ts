import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getActiveProfessional } from "@/lib/session";
import { getAiBrief } from "@/lib/ai-brief";
import { canManageAds } from "@/lib/ads";

const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 4000;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY");
  _client = new Anthropic({ apiKey });
  return _client;
}

/**
 * POST /api/ads/brief-ia
 * Body: { objective, audience, hookSeed?, durationSec?, productNotes?, freeContext? }
 *
 * Devuelve un guion de anuncio estructurado en plano (hook + cuerpo + CTA),
 * generado con Claude Opus usando la voz de marca aprendida en AiContentBrief.
 *
 * Salida JSON: { hook, script, cta, ctaUrlSuggestion, alternativeHooks: string[] }
 */
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageAds(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await req.json().catch(() => ({}));
  const objective = String(data?.objective ?? "conversions");
  const audience = String(data?.audience ?? "").trim();
  const hookSeed = String(data?.hookSeed ?? "").trim();
  const durationSec = Number(data?.durationSec ?? 30) || 30;
  const productNotes = String(data?.productNotes ?? "").trim();
  const freeContext = String(data?.freeContext ?? "").trim();

  if (!audience) {
    return NextResponse.json({ error: "Audiencia obligatoria" }, { status: 400 });
  }

  const brief = await getAiBrief();

  const system = `Eres un copy de respuesta directa especializado en anuncios para servicios de salud y deporte. Trabajas con FisioFit Team, un servicio de fisioterapia online para deportistas (sobre todo CrossFit). El equipo está liderado por Ales Faus.

VOZ DE MARCA:
${brief?.brand ?? "(sin definir)"}

TONO:
${brief?.voiceTone ?? "(sin definir)"}

QUÉ HACER:
${brief?.dos ?? "(sin definir)"}

QUÉ NO HACER:
${brief?.donts ?? "(sin definir)"}

ESTRUCTURA RECOMENDADA:
${brief?.structureHints ?? "(sin definir)"}

EJEMPLOS BUENOS:
${brief?.goodExamples ?? "(sin definir)"}

EJEMPLOS MALOS:
${brief?.badExamples ?? "(sin definir)"}

REGLAS DEL OUTPUT:
- Devuelve SOLO un objeto JSON válido, sin envoltura markdown ni texto antes/después.
- El campo "hook" tiene que enganchar en los primeros 3 segundos (pregunta, dato chocante, identificación con dolor).
- El campo "script" es el guion completo del vídeo en estilo conversacional, con cortes/timestamps si ayuda.
- El campo "cta" es una llamada a la acción corta, no agresiva.
- "ctaUrlSuggestion" es el destino sugerido (típicamente la landing /agenda).
- "alternativeHooks" son 3-4 hooks alternativos para A/B testear.`;

  const userPrompt = `Genera un guion de anuncio con estos parámetros:

OBJETIVO: ${objective}
AUDIENCIA: ${audience}
${hookSeed ? `HOOK SEED (inspiración): ${hookSeed}` : ""}
DURACIÓN APROX: ${durationSec}s
${productNotes ? `NOTAS DEL PRODUCTO: ${productNotes}` : ""}
${freeContext ? `CONTEXTO LIBRE: ${freeContext}` : ""}

Estructura JSON esperada:
{
  "hook": "...",
  "script": "...",
  "cta": "...",
  "ctaUrlSuggestion": "https://fisiofitteam.com/agenda",
  "alternativeHooks": ["...", "...", "..."]
}`;

  try {
    const resp = await client().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = resp.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Si la IA no devuelve JSON limpio, devolvemos el texto crudo para que el user lo aproveche manualmente.
      return NextResponse.json({ raw: text, _parseError: true });
    }
    return NextResponse.json(parsed);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Error generando con IA" }, { status: 500 });
  }
}
