// Cliente de la Graph API de Meta (Instagram + Marketing/Ads).
// Las credenciales viven en variables de entorno (no en el código):
//   META_ACCESS_TOKEN   → token de larga duración (idealmente de System User)
//   META_IG_USER_ID     → ID de la cuenta de Instagram Business
//   META_AD_ACCOUNT_ID  → ID de la cuenta publicitaria (sin el prefijo "act_")
//   META_GRAPH_VERSION  → opcional, por defecto v19.0
const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v19.0"}`;

export function metaConfig() {
  return {
    token: process.env.META_ACCESS_TOKEN || "",
    igUserId: process.env.META_IG_USER_ID || "",
    adAccountId: process.env.META_AD_ACCOUNT_ID || "",
  };
}
export function metaConfigured(): boolean {
  return !!process.env.META_ACCESS_TOKEN;
}

async function graphGet(path: string, params: Record<string, string>): Promise<any> {
  const { token } = metaConfig();
  if (!token) throw new Error("Meta no configurado (falta META_ACCESS_TOKEN)");
  const qs = new URLSearchParams({ ...params, access_token: token }).toString();
  const res = await fetch(`${GRAPH}/${path}?${qs}`, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok || data?.error) {
    throw new Error(data?.error?.message || `Error Graph API (${res.status})`);
  }
  return data;
}

// ── Instagram ────────────────────────────────────────────────────────────────

// Datos de la cuenta: username, seguidores totales, nº de publicaciones.
export async function getInstagramAccount(): Promise<{ username: string; followersCount: number; mediaCount: number }> {
  const { igUserId } = metaConfig();
  if (!igUserId) throw new Error("Falta META_IG_USER_ID");
  const d = await graphGet(igUserId, { fields: "username,followers_count,media_count" });
  return { username: d.username, followersCount: d.followers_count ?? 0, mediaCount: d.media_count ?? 0 };
}

// Nuevos seguidores en los últimos N días (suma del insight diario follower_count).
export async function getNewFollowers(days = 30): Promise<number> {
  const { igUserId } = metaConfig();
  if (!igUserId) throw new Error("Falta META_IG_USER_ID");
  const since = Math.floor((Date.now() - days * 86400000) / 1000);
  const until = Math.floor(Date.now() / 1000);
  const d = await graphGet(`${igUserId}/insights`, {
    metric: "follower_count",
    period: "day",
    since: String(since),
    until: String(until),
  });
  const values: { value: number }[] = d?.data?.[0]?.values ?? [];
  return values.reduce((a, v) => a + (v.value || 0), 0);
}

// Publicaciones recientes con sus métricas.
export type MetaPost = {
  id: string;
  caption: string;
  timestamp: string;
  permalink: string;
  mediaType: string;
  likes: number;
  comments: number;
  reach: number;
  saved: number;
  shares: number;
};
export async function getRecentMedia(limit = 12): Promise<MetaPost[]> {
  const { igUserId } = metaConfig();
  if (!igUserId) throw new Error("Falta META_IG_USER_ID");
  const d = await graphGet(`${igUserId}/media`, {
    fields: "caption,timestamp,permalink,media_type,like_count,comments_count,insights.metric(reach,saved,shares)",
    limit: String(limit),
  });
  const items: any[] = d?.data ?? [];
  return items.map((m) => {
    const ins: Record<string, number> = {};
    for (const i of m.insights?.data ?? []) ins[i.name] = i.values?.[0]?.value ?? 0;
    return {
      id: m.id,
      caption: (m.caption || "").slice(0, 120),
      timestamp: m.timestamp,
      permalink: m.permalink,
      mediaType: m.media_type,
      likes: m.like_count ?? 0,
      comments: m.comments_count ?? 0,
      reach: ins.reach ?? 0,
      saved: ins.saved ?? 0,
      shares: ins.shares ?? 0,
    };
  });
}

// Métricas de UNA publicación concreta (por su media id).
export async function getMediaInsights(mediaId: string): Promise<{ reach: number; saved: number; shares: number; likes: number; comments: number }> {
  const d = await graphGet(mediaId, {
    fields: "like_count,comments_count,insights.metric(reach,saved,shares)",
  });
  const ins: Record<string, number> = {};
  for (const i of d.insights?.data ?? []) ins[i.name] = i.values?.[0]?.value ?? 0;
  return {
    reach: ins.reach ?? 0,
    saved: ins.saved ?? 0,
    shares: ins.shares ?? 0,
    likes: d.like_count ?? 0,
    comments: d.comments_count ?? 0,
  };
}

// ── Anuncios (Marketing API) ───────────────────────────────────────────────────

// Gasto por campaña en un rango de fechas (YYYY-MM-DD).
export type AdCampaign = { campaignId: string; name: string; spend: number };
export async function getCampaignInsights(since: string, until: string): Promise<AdCampaign[]> {
  const { adAccountId } = metaConfig();
  if (!adAccountId) throw new Error("Falta META_AD_ACCOUNT_ID");
  const acct = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const d = await graphGet(`${acct}/insights`, {
    level: "campaign",
    fields: "campaign_id,campaign_name,spend",
    time_range: JSON.stringify({ since, until }),
    limit: "100",
  });
  const items: any[] = d?.data ?? [];
  return items.map((c) => ({
    campaignId: c.campaign_id,
    name: c.campaign_name || "(sin nombre)",
    spend: c.spend ? Math.round(Number(c.spend)) : 0,
  }));
}

// Tipos de "acción" que contamos como resultado (leads / mensajes).
const RESULT_ACTION_TYPES = new Set([
  "lead",
  "onsite_conversion.lead_grouped",
  "leadgen.other",
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.messaging_first_reply",
]);

export type AdRow = {
  id: string;
  name: string;
  spend: number;
  reach: number;
  impressions: number;
  frequency: number;
  clicks: number;
  linkClicks: number;
  ctr: number;        // %
  cpc: number;        // €
  cpm: number;        // €
  results: number;
  costPerResult: number | null;
};

// Insights de anuncios a nivel campaña / conjunto / anuncio, opcionalmente
// filtrados por su padre (para el desglose).
export async function getAdsInsights(opts: {
  level: "campaign" | "adset" | "ad";
  since: string;
  until: string;
  parentField?: "campaign" | "adset";
  parentId?: string;
}): Promise<AdRow[]> {
  const { adAccountId } = metaConfig();
  if (!adAccountId) throw new Error("Falta META_AD_ACCOUNT_ID");
  const acct = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

  const nameField = opts.level === "campaign" ? "campaign_id,campaign_name" : opts.level === "adset" ? "adset_id,adset_name" : "ad_id,ad_name";
  const params: Record<string, string> = {
    level: opts.level,
    fields: `${nameField},spend,reach,impressions,frequency,clicks,inline_link_clicks,ctr,cpc,cpm,actions`,
    time_range: JSON.stringify({ since: opts.since, until: opts.until }),
    limit: "200",
  };
  if (opts.parentField && opts.parentId) {
    params.filtering = JSON.stringify([{ field: `${opts.parentField}.id`, operator: "IN", value: [opts.parentId] }]);
  }

  const d = await graphGet(`${acct}/insights`, params);
  const items: any[] = d?.data ?? [];
  return items.map((r) => {
    let results = 0;
    for (const a of r.actions ?? []) {
      if (RESULT_ACTION_TYPES.has(a.action_type)) results += Number(a.value) || 0;
    }
    const spend = r.spend ? Number(r.spend) : 0;
    return {
      id: r.campaign_id || r.adset_id || r.ad_id || "",
      name: r.campaign_name || r.adset_name || r.ad_name || "(sin nombre)",
      spend: Math.round(spend),
      reach: Number(r.reach) || 0,
      impressions: Number(r.impressions) || 0,
      frequency: r.frequency ? Math.round(Number(r.frequency) * 10) / 10 : 0,
      clicks: Number(r.clicks) || 0,
      linkClicks: Number(r.inline_link_clicks) || 0,
      ctr: r.ctr ? Math.round(Number(r.ctr) * 100) / 100 : 0,
      cpc: r.cpc ? Math.round(Number(r.cpc) * 100) / 100 : 0,
      cpm: r.cpm ? Math.round(Number(r.cpm) * 100) / 100 : 0,
      results,
      costPerResult: results > 0 ? Math.round((spend / results) * 100) / 100 : null,
    };
  });
}

// Estado actual de todas las campañas / adsets / ads de la cuenta. Devuelve
// un mapa id → effective_status. Usado para sincronizar nuestro status local.
export async function getAllEntityStatuses(
  entity: "campaigns" | "adsets" | "ads",
): Promise<Map<string, string>> {
  const { adAccountId } = metaConfig();
  if (!adAccountId) throw new Error("Falta META_AD_ACCOUNT_ID");
  const acct = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const result = new Map<string, string>();
  let next: string | null = `${acct}/${entity}?fields=id,effective_status&limit=200`;
  let safety = 10; // paginación máxima
  while (next && safety-- > 0) {
    const res = await fetch(`${GRAPH}/${next}${next.includes("?") ? "&" : "?"}access_token=${metaConfig().token}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || data?.error) throw new Error(data?.error?.message || "Error sync Meta");
    for (const item of data?.data ?? []) {
      if (item?.id) result.set(item.id, String(item.effective_status ?? "UNKNOWN"));
    }
    next = data?.paging?.next?.replace(`${GRAPH}/`, "") ?? null;
  }
  return result;
}

// Gasto total en anuncios en un rango de fechas (YYYY-MM-DD).
export async function getAdSpend(since: string, until: string): Promise<number> {
  const { adAccountId } = metaConfig();
  if (!adAccountId) throw new Error("Falta META_AD_ACCOUNT_ID");
  const acct = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  const d = await graphGet(`${acct}/insights`, {
    fields: "spend",
    time_range: JSON.stringify({ since, until }),
  });
  const spend = d?.data?.[0]?.spend;
  return spend ? Math.round(Number(spend)) : 0;
}
