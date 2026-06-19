// Helpers server-safe para el sistema de anuncios. Sin "use client".

export type AdObjective =
  | "traffic"
  | "conversions"
  | "leads"
  | "engagement"
  | "awareness"
  | "video_views";

export type CampaignStatus = "idea" | "active" | "paused" | "finished";
export type AdSetStatus = CampaignStatus;
export type AdStatus =
  | "idea"
  | "brief"
  | "recording"
  | "editing"
  | "scheduled"
  | "active"
  | "paused"
  | "finished";

export type AdFormat = "video" | "image" | "carousel" | "story";

export const OBJECTIVE_LABELS: Record<AdObjective, string> = {
  traffic: "Tráfico",
  conversions: "Conversiones",
  leads: "Leads",
  engagement: "Interacción",
  awareness: "Reconocimiento",
  video_views: "Reproducciones",
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  idea: "Idea",
  active: "Activa",
  paused: "Pausada",
  finished: "Finalizada",
};

export const AD_STATUS_LABELS: Record<AdStatus, string> = {
  idea: "Idea",
  brief: "Brief",
  recording: "Grabación",
  editing: "Edición",
  scheduled: "Programado",
  active: "Activo",
  paused: "Pausado",
  finished: "Finalizado",
};

export const AD_STATUS_COLOR: Record<AdStatus, string> = {
  idea: "bg-neutral-100 text-neutral-700",
  brief: "bg-blue-100 text-blue-700",
  recording: "bg-amber-100 text-amber-700",
  editing: "bg-purple-100 text-purple-700",
  scheduled: "bg-indigo-100 text-indigo-700",
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-orange-100 text-orange-700",
  finished: "bg-neutral-200 text-neutral-600",
};

export const AD_FORMAT_LABELS: Record<AdFormat, string> = {
  video: "Vídeo",
  image: "Imagen",
  carousel: "Carrusel",
  story: "Story",
};

export const OBJECTIVES: AdObjective[] = ["conversions", "leads", "traffic", "engagement", "awareness", "video_views"];
export const CAMPAIGN_STATUSES: CampaignStatus[] = ["idea", "active", "paused", "finished"];
export const AD_STATUSES: AdStatus[] = ["idea", "brief", "recording", "editing", "scheduled", "active", "paused", "finished"];
export const AD_FORMATS: AdFormat[] = ["video", "image", "carousel", "story"];

/** ¿Este rol puede gestionar anuncios? */
export function canManageAds(role: string): boolean {
  return role === "ceo";
}

/**
 * Slug seguro para usar como utm_campaign. Ej: "Hombro Q3 2026" → "hombro_q3_2026".
 */
export function utmSlug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

/**
 * Construye una URL con UTMs añadidos. Si la URL ya trae query, los agrega
 * sin perder los existentes (sobreescribe si colisionan).
 *
 * Devuelve string vacío si baseUrl no parsea.
 */
export function withUtms(
  baseUrl: string,
  utms: { campaign?: string; source?: string; medium?: string; content?: string },
): string {
  try {
    const u = new URL(baseUrl);
    if (utms.campaign) u.searchParams.set("utm_campaign", utms.campaign);
    if (utms.source) u.searchParams.set("utm_source", utms.source);
    if (utms.medium) u.searchParams.set("utm_medium", utms.medium);
    if (utms.content) u.searchParams.set("utm_content", utms.content);
    return u.toString();
  } catch {
    return "";
  }
}

/** Parse JSON tolerante a basura, devuelve fallback si falla. */
export function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
