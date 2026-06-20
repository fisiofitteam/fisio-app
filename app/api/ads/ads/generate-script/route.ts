/**
 * POST /api/ads/ads/generate-script
 *
 * Genera un guion estructurado (hook + script + cta) para un anuncio concreto.
 * Usa el AiAdsBrief (system prompt completo si está, si no los campos
 * estructurados) y los datos del propio Ad (formato, hook seed, contexto libre).
 *
 * Body: { adId, hookSeed?, durationSec?, freeContext? }
 * Devuelve: { hook, script, cta, ctaUrlSuggestion?, alternativeHooks: string[] }
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
  const system = buildAdsSystemPrompt(brief);

  const hookSeed = String(data?.hookSeed ?? ad.hook ?? "").trim();
  const durationSec = Number(data?.durationSec ?? 30) || 30;
  const freeContext = String(data?.freeContext ?? "").trim();

  const campaign = ad.adset.campaign;
  const objLabel = OBJECTIVE_LABELS[campaign.objective as AdObjective] ?? campaign.objective;
  const formatLabel = AD_FORMAT_LABELS[ad.format as AdFormat] ?? ad.format;

  const userPrompt = `Genera un guion de anuncio con estos parámetros:

CAMPAÑA: ${campaign.name}
OBJETIVO DE LA CAMPAÑA: ${objLabel}
FORMATO DEL ANUNCIO: ${formatLabel}
NOMBRE DEL ANUNCIO: ${ad.name}
DURACIÓN APROX: ${durationSec}s
${hookSeed ? `HOOK SEED (inspiración): ${hookSeed}` : ""}
${freeContext ? `CONTEXTO LIBRE: ${freeContext}` : ""}
${campaign.notes ? `NOTAS DE LA CAMPAÑA: ${campaign.notes}` : ""}

REGLAS DEL OUTPUT (importante):
- Devuelve SOLO un objeto JSON válido, sin envoltura markdown ni texto antes/después.
- "hook" engancha en los primeros 3 segundos.
- "script" es el guion completo en formato conversacional, con cortes/timestamps si ayuda.
- "cta" es la llamada a la acción corta.
- "ctaUrlSuggestion" es la URL sugerida (típicamente https://fisiofitteam.com/agenda con UTM).
- "alternativeHooks" son 3-4 hooks alternativos para A/B testear.

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
      return NextResponse.json({ raw: text, _parseError: true });
    }
    return NextResponse.json(parsed);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Error generando con IA" }, { status: 500 });
  }
}
