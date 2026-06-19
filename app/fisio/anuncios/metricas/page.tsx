import { prisma } from "@/lib/prisma";
import { getPeriodRange, type Period } from "@/lib/finance";
import { metaConfigured, getAdsInsights } from "@/lib/meta";
import { getAttributionByCampaign, computeRoas, computeCac } from "@/lib/ads-roas";
import { AdsMetricsPanel } from "@/components/AdsMetricsPanel";
import { utmSlug } from "@/lib/ads";

export const dynamic = "force-dynamic";
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export default async function MetricasPage({ searchParams }: { searchParams: { period?: string } }) {
  const period: Period = (["month", "quarter", "year"].includes(searchParams.period ?? "")
    ? (searchParams.period as Period)
    : "month");
  const { start, end, label } = getPeriodRange(period);

  if (!metaConfigured()) {
    return (
      <div className="card text-sm text-neutral-600">
        Meta no está conectado. Configura la integración en <strong>Ajustes → Integraciones → Meta</strong> y vuelve aquí para ver insights.
      </div>
    );
  }

  // 1) Insights Meta por campaña
  let campaignsMeta: any[] = [];
  let error: string | null = null;
  try {
    campaignsMeta = await getAdsInsights({ level: "campaign", since: ymd(start), until: ymd(end) });
  } catch (e: any) {
    error = e.message;
  }

  // 2) Campañas locales del sistema (para enlazar Meta → nuestra ficha)
  const localCampaigns = await prisma.adCampaign.findMany({
    select: { id: true, name: true, metaCampaignId: true },
  });
  const byMetaId = new Map<string, { id: string; name: string }>();
  const byUtmSlug = new Map<string, { id: string; name: string }>();
  for (const c of localCampaigns) {
    if (c.metaCampaignId) byMetaId.set(c.metaCampaignId, { id: c.id, name: c.name });
    byUtmSlug.set(utmSlug(c.name), { id: c.id, name: c.name });
  }

  // 3) Atribución desde leads (utm_campaign)
  const attribution = await getAttributionByCampaign(start, end);
  const attrByUtm = new Map(attribution.map((a) => [a.utmCampaign, a]));

  // 4) Construimos la tabla por campaña Meta enriquecida
  const rows = campaignsMeta.map((m: any) => {
    const local = byMetaId.get(m.id);
    // Intentar atribución por: (a) si la campaña Meta tiene id local, usar utm de su nombre local; (b) si no, intentar con el slug del nombre Meta.
    const utmKey = local ? utmSlug(local.name) : utmSlug(m.name);
    const attr = attrByUtm.get(utmKey);
    const revenue = attr?.revenue ?? 0;
    return {
      metaId: m.id as string,
      name: m.name as string,
      localId: local?.id ?? null,
      spend: m.spend as number,
      reach: m.reach as number,
      impressions: m.impressions as number,
      clicks: m.clicks as number,
      ctr: m.ctr as number,
      cpc: m.cpc as number,
      results: m.results as number,
      costPerResult: m.costPerResult as number | null,
      leadsAttr: attr?.leadsCount ?? 0,
      wonAttr: attr?.wonCount ?? 0,
      revenueAttr: revenue,
      roasReal: computeRoas(m.spend, revenue),
      cacReal: computeCac(m.spend, attr?.wonCount ?? 0),
    };
  });

  // 5) Totales globales
  const totals = rows.reduce(
    (acc, r) => ({
      spend: acc.spend + r.spend,
      impressions: acc.impressions + r.impressions,
      reach: acc.reach + r.reach,
      clicks: acc.clicks + r.clicks,
      leads: acc.leads + r.leadsAttr,
      won: acc.won + r.wonAttr,
      revenue: acc.revenue + r.revenueAttr,
    }),
    { spend: 0, impressions: 0, reach: 0, clicks: 0, leads: 0, won: 0, revenue: 0 },
  );

  return (
    <AdsMetricsPanel
      period={period}
      periodLabel={label}
      rows={rows}
      totals={totals}
      error={error}
    />
  );
}
