/**
 * POST /api/ads/ads/generate-script
 *
 * Genera un guion estructurado para un anuncio, en el mismo formato que el
 * generador de Contenido (blocks + hookVariations) + CTA + ctaUrlSuggestion.
 *
 * Soporta iteración: si se manda `previousResult` y `iterationInstruction`,
 * la IA refina la versión anterior en lugar de generar de cero.
 *
 * Body:
 *   { adId, instructions, hook?, freeNote?, previousResult?, iterationInstruction? }
 *
 * Devuelve:
 *   { blocks: [{label, content}], hookVariations: string[], cta, ctaUrlSuggestion }
 */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canManageAds } from "@/lib/ads";
import { getAiAdsBrief, buildAdsSystemPrompt } from "@/lib/ai-ads-brief";
import { OBJECTIVE_LABELS, AD_FORMAT_LABELS, type AdFormat, type AdObjective } from "@/lib/ads";

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

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageAds(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await req.json().catch(() => ({}));
  const adId = typeof data?.adId === "string" ? data.adId : "";
  if (!adId) return NextResponse.json({ error: "adId requerido" }, { status: 400 });

  const ad = await prisma.ad.findUnique({
    where: { id: adId },
    include: { adset: { include: { campaign: true } } },
  });
  if (!ad) return NextResponse.json({ error: "Ad no encontrado" }, { status: 404 });

  const brief = await getAiAdsBrief();
  const baseSystem = buildAdsSystemPrompt(brief);

  // Añadimos las reglas estructurales del output al system para no contaminar
  // el system custom del usuario con detalles del JSON esperado.
  const system = `${baseSystem}

REGLAS DEL OUTPUT (importantes, siempre se cumplen):
- Devuelve SOLO un objeto JSON válido, sin markdown ni texto antes/después.
- "blocks" es un array de bloques del guion. Cada bloque: { "label": "...", "content": "..." }. Mínimo 3 bloques (Hook, Desarrollo, Cierre/CTA) y máximo 6.
- Si el usuario te da hook literal en el input, úsalo TAL CUAL como contenido del primer bloque "Hook" (sin reformularlo).
- "hookVariations" son 3-4 hooks alternativos potentes para A/B testear (cortos, < 80 caracteres).
- "cta" es el texto del CTA del anuncio (1 frase corta).
- "ctaUrlSuggestion" es la URL sugerida (típicamente https://fisiofitteam.com/agenda con UTMs como utm_source=meta&utm_campaign=...).

Estructura JSON exacta:
{
  "blocks": [{ "label": "Hook", "content": "..." }, { "label": "Desarrollo", "content": "..." }, ...],
  "hookVariations": ["...", "...", "..."],
  "cta": "...",
  "ctaUrlSuggestion": "https://..."
}`;

  const instructions = String(data?.instructions ?? "").trim();
  const hookSeed = String(data?.hook ?? ad.hook ?? "").trim();
  const freeNote = String(data?.freeNote ?? "").trim();
  const previousResult = data?.previousResult ?? null;
  const iterationInstruction = String(data?.iterationInstruction ?? "").trim();

  if (!instructions && !iterationInstruction) {
    return NextResponse.json({ error: "Necesitas darle instrucciones" }, { status: 400 });
  }

  const campaign = ad.adset.campaign;
  const objLabel = OBJECTIVE_LABELS[campaign.objective as AdObjective] ?? campaign.objective;
  const formatLabel = AD_FORMAT_LABELS[ad.format as AdFormat] ?? ad.format;

  let userPrompt: string;
  if (previousResult && iterationInstruction) {
    userPrompt = `Refina la generación anterior según este ajuste:

AJUSTE A APLICAR: ${iterationInstruction}

RESULTADO ANTERIOR:
${JSON.stringify(previousResult, null, 2)}

CONTEXTO ORIGINAL:
- Campaña: ${campaign.name} (objetivo: ${objLabel})
- Anuncio: ${ad.name} (formato: ${formatLabel})
${hookSeed ? `- Hook seed original: ${hookSeed}` : ""}
${instructions ? `- Instrucciones originales: ${instructions}` : ""}

Devuelve el JSON refinado conservando lo que funcionaba.`;
  } else {
    userPrompt = `Genera un guion de anuncio con estos parámetros:

CAMPAÑA: ${campaign.name}
OBJETIVO DE LA CAMPAÑA: ${objLabel}
FORMATO DEL ANUNCIO: ${formatLabel}
NOMBRE DEL ANUNCIO: ${ad.name}
${campaign.notes ? `NOTAS DE LA CAMPAÑA: ${campaign.notes}` : ""}

INSTRUCCIONES DEL USUARIO:
${instructions}

${hookSeed ? `HOOK QUE EL USUARIO QUIERE USAR LITERAL (úsalo como bloque Hook tal cual): "${hookSeed}"` : ""}
${freeNote ? `NOTA / AJUSTE DE TONO: ${freeNote}` : ""}

Devuelve el JSON con la estructura indicada.`;
  }

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
      return NextResponse.json({ raw: text, _parseError: true }, { status: 500 });
    }
    return NextResponse.json(parsed);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Error generando con IA" }, { status: 500 });
  }
}
