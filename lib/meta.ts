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
