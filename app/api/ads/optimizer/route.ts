import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canManageAds, utmSlug } from "@/lib/ads";
import { getAdsInsights, metaConfigured } from "@/lib/meta";
import { getPeriodRange, type Period } from "@/lib/finance";
import { getAttributionByCampaign, computeRoas, computeCac } from "@/lib/ads-roas";

const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 4000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY");
  _client = new Anthropic({ apiKey });
  return _client;
}

/** GET: devuelve el último run guardado. */
export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canManageAds(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const last = await prisma.adOptimizerRun.findFirst({ orderBy: { createdAt: "desc" } });
  if (!last) return NextResponse.json({ run: null });
  return NextResponse.json({
    run: {
      id: last.id,
      period: last.period,
      summary: last.summary,
      recommendations: safeParse(last.recommendations),
      createdAt: last.createdAt.toISOString(),
    },
  });
}

/**
 * POST: ejecuta el análisis. Junta los datos por campaña/adset/ad del periodo,
 * cruza con la atribución real (UTMs → Lead → Sale), pasa todo a Claude Opus
 * y guarda el resultado en AdOptimizerRun.
 *
 * Body: { period?: "month" | "quarter" | "year" }  (por defecto "month")
 */
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageAds(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!metaConfigured()) {
    return NextResponse.json({ error: "Meta no configurado" }, { status: 503 });
  }

  const data = await req.json().catch(() => ({}));
  const period: Period = ["month", "quarter", "year"].includes(data?.period) ? data.period : "month";
  const { start, end, label } = getPeriodRange(period);

  // 1) Insights por campaña + adset + ad
  let campaignsMeta: any[] = [];
  let adsetsMeta: any[] = [];
  let adsMeta: any[] = [];
  try {
    [campaignsMeta, adsetsMeta, adsMeta] = await Promise.all([
      getAdsInsights({ level: "campaign", since: ymd(start), until: ymd(end) }),
      getAdsInsights({ level: "adset", since: ymd(start), until: ymd(end) }),
      getAdsInsights({ level: "ad", since: ymd(start), until: ymd(end) }),
    ]);
  } catch (e: any) {
    return NextResponse.json({ error: `Meta API: ${e.message}` }, { status: 502 });
  }

  // 2) Atribución real
  const attribution = await getAttributionByCampaign(start, end);
  const attrByUtm = new Map(attribution.map((a) => [a.utmCampaign, a]));

  // 3) Campañas locales para enriquecer
  const localCampaigns = await prisma.adCampaign.findMany({
    select: { id: true, name: true, metaCampaignId: true, status: true, adSets: { select: { id: true, name: true, metaAdsetId: true, ads: { select: { id: true, name: true, metaAdId: true } } } } },
  });
  const localCampaignByMetaId = new Map<string, { id: string; name: string; status: string }>();
  const localAdSetByMetaId = new Map<string, { id: string; name: string }>();
  const localAdByMetaId = new Map<string, { id: string; name: string }>();
  for (const c of localCampaigns) {
    if (c.metaCampaignId) localCampaignByMetaId.set(c.metaCampaignId, { id: c.id, name: c.name, status: c.status });
    for (const s of c.adSets) {
      if (s.metaAdsetId) localAdSetByMetaId.set(s.metaAdsetId, { id: s.id, name: s.name });
      for (const a of s.ads) {
        if (a.metaAdId) localAdByMetaId.set(a.metaAdId, { id: a.id, name: a.name });
      }
    }
  }

  // 4) Componer payload para Claude
  const campaignsPayload = campaignsMeta.map((m: any) => {
    const local = localCampaignByMetaId.get(m.id);
    const utmKey = local ? utmSlug(local.name) : utmSlug(m.name);
    const attr = attrByUtm.get(utmKey);
    const revenue = attr?.revenue ?? 0;
    return {
      metaId: m.id,
      metaName: m.name,
      localId: local?.id ?? null,
      localStatus: local?.status ?? null,
      spend: m.spend,
      impressions: m.impressions,
      reach: m.reach,
      ctr: m.ctr,
      cpc: m.cpc,
      results: m.results,
      costPerResult: m.costPerResult,
      attribLeads: attr?.leadsCount ?? 0,
      attribWon: attr?.wonCount ?? 0,
      attribRevenue: revenue,
      roasReal: computeRoas(m.spend, revenue),
      cacReal: computeCac(m.spend, attr?.wonCount ?? 0),
    };
  });
  const adsetsPayload = adsetsMeta.map((m: any) => {
    const local = localAdSetByMetaId.get(m.id);
    return {
      metaId: m.id,
      metaName: m.name,
      localId: local?.id ?? null,
      spend: m.spend,
      impressions: m.impressions,
      reach: m.reach,
      ctr: m.ctr,
      cpc: m.cpc,
      frequency: m.frequency,
      results: m.results,
      costPerResult: m.costPerResult,
    };
  });
  const adsPayload = adsMeta.map((m: any) => {
    const local = localAdByMetaId.get(m.id);
    return {
      metaId: m.id,
      metaName: m.name,
      localId: local?.id ?? null,
      spend: m.spend,
      impressions: m.impressions,
      ctr: m.ctr,
      cpc: m.cpc,
      frequency: m.frequency,
      results: m.results,
      costPerResult: m.costPerResult,
    };
  });

  // Si no hay datos, atajamos sin gastar tokens
  if (campaignsPayload.length === 0) {
    const saved = await prisma.adOptimizerRun.create({
      data: {
        period,
        summary: `No hay campañas con datos en ${label}.`,
        recommendations: JSON.stringify([]),
        createdById: user.id,
      },
    });
    return NextResponse.json({
      run: {
        id: saved.id,
        period: saved.period,
        summary: saved.summary,
        recommendations: [],
        createdAt: saved.createdAt.toISOString(),
      },
    });
  }

  // 5) Prompt + llamada a Claude
  const system = `Eres un analista senior de Meta Ads especializado en servicios de salud / fisioterapia online.
Recibes datos del último periodo. Debes detectar oportunidades concretas y devolver acciones específicas, no genéricas.

REGLAS:
- Identifica con prioridad ALTA acciones que ahorren dinero ya (pausar ads con CPL inflado) o que aumenten ingresos (escalar ROAS alto).
- Identifica con prioridad MEDIA optimizaciones (renovar creatividad, ajustar audiencia).
- Prioridad BAJA = sugerencias generales.
- Cada recomendación debe citar el dato concreto que la respalda.
- ROAS real (atribuido con UTM + ventas) pesa más que métricas Meta vanidosas (CTR, impresiones). Si no hay leads atribuidos pero sí gasto alto, sugiere "revisar atribución (¿UTMs configurados?)".
- Si la frequency > 3 o el ad lleva mucho tiempo activo con CTR cayendo, recomienda renovar creatividad.
- Si CAC > LTV razonable, recomienda pausar.
- No inventes números.

DEVUELVE SOLO JSON válido (sin markdown), con este formato:
{
  "summary": "Frase corta resumiendo el periodo y la salud general",
  "recommendations": [
    {
      "priority": "high" | "medium" | "low",
      "entity": "campaign" | "adset" | "ad",
      "entityId": "<localId si lo tienen, si no el metaId>",
      "entityName": "<nombre>",
      "action": "pause" | "scale_up" | "scale_down" | "renew_creative" | "broaden_audience" | "narrow_audience" | "review_targeting" | "review_attribution" | "other",
      "actionLabel": "Texto del botón",
      "reason": "Por qué, con el dato concreto",
      "suggestedNext": "Qué hacer después (opcional)"
    }
  ]
}`;

  const userPrompt = `Periodo analizado: ${label}.

CAMPAÑAS (${campaignsPayload.length}):
${JSON.stringify(campaignsPayload, null, 2)}

ADSETS (${adsetsPayload.length}):
${JSON.stringify(adsetsPayload, null, 2)}

ADS (${adsPayload.length}):
${JSON.stringify(adsPayload, null, 2)}

Analiza y devuelve el JSON.`;

  let parsed: { summary: string; recommendations: any[] };
  try {
    const resp = await client().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = resp.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(cleaned);
    if (!parsed.summary || !Array.isArray(parsed.recommendations)) {
      throw new Error("Estructura inesperada");
    }
  } catch (e: any) {
    return NextResponse.json({ error: `IA: ${e.message}` }, { status: 500 });
  }

  // 6) Persistimos
  const saved = await prisma.adOptimizerRun.create({
    data: {
      period,
      summary: parsed.summary,
      recommendations: JSON.stringify(parsed.recommendations),
      createdById: user.id,
    },
  });
  return NextResponse.json({
    run: {
      id: saved.id,
      period: saved.period,
      summary: saved.summary,
      recommendations: parsed.recommendations,
      createdAt: saved.createdAt.toISOString(),
    },
  });
}

function safeParse(raw: string): any[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
