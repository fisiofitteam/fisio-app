// Lógica del análisis IA reusable desde el endpoint POST manual y desde el
// cron diario. Junta insights Meta + ROAS atribuido + tendencia y pasa
// todo a Claude Opus. Persiste el resultado en AdOptimizerRun.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { utmSlug } from "@/lib/ads";
import { getAdsInsights, metaConfigured } from "@/lib/meta";
import { getPeriodRange, getPreviousPeriodRange, type Period } from "@/lib/finance";
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

export type OptimizerResult = {
  runId: string;
  period: Period;
  summary: string;
  recommendations: any[];
  createdAt: Date;
};

export async function runOptimizer(period: Period, createdById: string | null): Promise<OptimizerResult> {
  if (!metaConfigured()) throw new Error("Meta no configurado");

  const { start, end, label } = getPeriodRange(period);
  const prev = getPreviousPeriodRange(period);

  const [campaignsMeta, adsetsMeta, adsMeta, campaignsPrev] = await Promise.all([
    getAdsInsights({ level: "campaign", since: ymd(start), until: ymd(end) }),
    getAdsInsights({ level: "adset", since: ymd(start), until: ymd(end) }),
    getAdsInsights({ level: "ad", since: ymd(start), until: ymd(end) }),
    getAdsInsights({ level: "campaign", since: ymd(prev.start), until: ymd(prev.end) }),
  ]);
  const campaignsPrevById = new Map(campaignsPrev.map((c: any) => [c.id, c]));

  const [attribution, attributionPrev] = await Promise.all([
    getAttributionByCampaign(start, end),
    getAttributionByCampaign(prev.start, prev.end),
  ]);
  const attrByUtm = new Map(attribution.map((a) => [a.utmCampaign, a]));
  const attrPrevByUtm = new Map(attributionPrev.map((a) => [a.utmCampaign, a]));

  const localCampaigns = await prisma.adCampaign.findMany({
    select: {
      id: true, name: true, metaCampaignId: true, status: true,
      adSets: {
        select: {
          id: true, name: true, metaAdsetId: true,
          ads: { select: { id: true, name: true, metaAdId: true } },
        },
      },
    },
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

  const campaignsPayload = campaignsMeta.map((m: any) => {
    const local = localCampaignByMetaId.get(m.id);
    const utmKey = local ? utmSlug(local.name) : utmSlug(m.name);
    const attr = attrByUtm.get(utmKey);
    const attrPrev = attrPrevByUtm.get(utmKey);
    const revenue = attr?.revenue ?? 0;
    const revenuePrev = attrPrev?.revenue ?? 0;
    const prevMeta = campaignsPrevById.get(m.id) as any;
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
      previous: prevMeta ? {
        spend: prevMeta.spend,
        ctr: prevMeta.ctr,
        cpc: prevMeta.cpc,
        results: prevMeta.results,
        costPerResult: prevMeta.costPerResult,
        attribLeads: attrPrev?.leadsCount ?? 0,
        attribWon: attrPrev?.wonCount ?? 0,
        attribRevenue: revenuePrev,
        roasReal: computeRoas(prevMeta.spend, revenuePrev),
      } : null,
    };
  });

  const adsetsPayload = adsetsMeta.map((m: any) => ({
    metaId: m.id,
    metaName: m.name,
    localId: localAdSetByMetaId.get(m.id)?.id ?? null,
    spend: m.spend,
    impressions: m.impressions,
    reach: m.reach,
    ctr: m.ctr,
    cpc: m.cpc,
    frequency: m.frequency,
    results: m.results,
    costPerResult: m.costPerResult,
  }));
  const adsPayload = adsMeta.map((m: any) => ({
    metaId: m.id,
    metaName: m.name,
    localId: localAdByMetaId.get(m.id)?.id ?? null,
    spend: m.spend,
    impressions: m.impressions,
    ctr: m.ctr,
    cpc: m.cpc,
    frequency: m.frequency,
    results: m.results,
    costPerResult: m.costPerResult,
  }));

  if (campaignsPayload.length === 0) {
    const saved = await prisma.adOptimizerRun.create({
      data: {
        period,
        summary: `No hay campañas con datos en ${label}.`,
        recommendations: JSON.stringify([]),
        createdById,
      },
    });
    return { runId: saved.id, period, summary: saved.summary, recommendations: [], createdAt: saved.createdAt };
  }

  const system = `Eres un analista senior de Meta Ads especializado en servicios de salud / fisioterapia online.
Recibes datos del último periodo Y del periodo anterior (campo "previous") para que puedas detectar tendencia.
Debes detectar oportunidades concretas y devolver acciones específicas, no genéricas.

REGLAS:
- Identifica con prioridad ALTA acciones que ahorren dinero ya (pausar ads con CPL inflado) o que aumenten ingresos (escalar ROAS alto).
- Identifica con prioridad MEDIA optimizaciones (renovar creatividad, ajustar audiencia).
- Prioridad BAJA = sugerencias generales.
- Cada recomendación debe citar el dato concreto que la respalda, idealmente comparando con el periodo anterior si hay datos.
- En el resumen menciona la tendencia: gasto vs periodo anterior, leads vs anterior, ROAS subiendo/bajando.
- ROAS real (atribuido con UTM + ventas) pesa más que métricas Meta vanidosas (CTR, impresiones). Si no hay leads atribuidos pero sí gasto alto, sugiere "revisar atribución (¿UTMs configurados?)".
- Si la frequency > 3 o el ad lleva mucho tiempo activo con CTR cayendo respecto al periodo anterior, recomienda renovar creatividad.
- Si CAC > LTV razonable, recomienda pausar.
- No inventes números.

DEVUELVE SOLO JSON válido (sin markdown):
{
  "summary": "Frase corta resumiendo el periodo, la salud general Y la tendencia vs periodo anterior",
  "recommendations": [
    {
      "priority": "high" | "medium" | "low",
      "entity": "campaign" | "adset" | "ad",
      "entityId": "<localId si existe, si no metaId>",
      "entityName": "<nombre>",
      "action": "pause" | "scale_up" | "scale_down" | "renew_creative" | "broaden_audience" | "narrow_audience" | "review_targeting" | "review_attribution" | "other",
      "actionLabel": "Texto del botón",
      "reason": "Por qué, con el dato concreto",
      "suggestedNext": "Qué hacer después (opcional)"
    }
  ]
}`;

  const userPrompt = `Periodo analizado: ${label}. Periodo anterior para comparar: ${prev.label}.

CAMPAÑAS (${campaignsPayload.length}):
${JSON.stringify(campaignsPayload, null, 2)}

ADSETS (${adsetsPayload.length}):
${JSON.stringify(adsetsPayload, null, 2)}

ADS (${adsPayload.length}):
${JSON.stringify(adsPayload, null, 2)}

Analiza y devuelve el JSON.`;

  const resp = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });
  const text = resp.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed.summary || !Array.isArray(parsed.recommendations)) {
    throw new Error("Estructura inesperada de la IA");
  }

  const saved = await prisma.adOptimizerRun.create({
    data: {
      period,
      summary: parsed.summary,
      recommendations: JSON.stringify(parsed.recommendations),
      createdById,
    },
  });
  return {
    runId: saved.id,
    period,
    summary: parsed.summary,
    recommendations: parsed.recommendations,
    createdAt: saved.createdAt,
  };
}
