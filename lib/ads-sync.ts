// Sincroniza el status local de AdCampaign / AdSet / Ad con el effective_status
// devuelto por Meta. Llamado al cargar /fisio/anuncios/campanas (best-effort:
// si Meta falla, el panel sigue funcionando con los datos locales).

import { prisma } from "@/lib/prisma";
import { getAllEntityStatuses, metaConfigured } from "@/lib/meta";

/**
 * Mapea el effective_status de Meta a nuestro enum local.
 * - ACTIVE → active
 * - PAUSED, IN_PROCESS, CAMPAIGN_PAUSED, ADSET_PAUSED → paused
 * - ARCHIVED, DELETED → finished
 * - Resto → null (no tocamos el local)
 */
function mapStatus(meta: string): "active" | "paused" | "finished" | null {
  const v = meta.toUpperCase();
  if (v === "ACTIVE") return "active";
  if (v.includes("PAUSED") || v === "IN_PROCESS") return "paused";
  if (v === "ARCHIVED" || v === "DELETED") return "finished";
  return null;
}

export type SyncReport = {
  campaigns: number;
  adsets: number;
  ads: number;
  error?: string;
};

export async function syncMetaStatuses(): Promise<SyncReport> {
  if (!metaConfigured()) return { campaigns: 0, adsets: 0, ads: 0, error: "Meta no configurado" };

  let campaignsUpdated = 0;
  let adsetsUpdated = 0;
  let adsUpdated = 0;

  try {
    // ── Campañas ──
    const campaigns = await prisma.adCampaign.findMany({
      where: { metaCampaignId: { not: null } },
      select: { id: true, metaCampaignId: true, status: true },
    });
    if (campaigns.length > 0) {
      const statuses = await getAllEntityStatuses("campaigns");
      for (const c of campaigns) {
        const newStatus = mapStatus(statuses.get(c.metaCampaignId!) ?? "");
        if (newStatus && newStatus !== c.status) {
          await prisma.adCampaign.update({ where: { id: c.id }, data: { status: newStatus } });
          campaignsUpdated++;
        }
      }
    }

    // ── AdSets ──
    const adsets = await prisma.adSet.findMany({
      where: { metaAdsetId: { not: null } },
      select: { id: true, metaAdsetId: true, status: true },
    });
    if (adsets.length > 0) {
      const statuses = await getAllEntityStatuses("adsets");
      for (const s of adsets) {
        const newStatus = mapStatus(statuses.get(s.metaAdsetId!) ?? "");
        if (newStatus && newStatus !== s.status) {
          await prisma.adSet.update({ where: { id: s.id }, data: { status: newStatus } });
          adsetsUpdated++;
        }
      }
    }

    // ── Ads ──
    const ads = await prisma.ad.findMany({
      where: { metaAdId: { not: null } },
      select: { id: true, metaAdId: true, status: true },
    });
    if (ads.length > 0) {
      const statuses = await getAllEntityStatuses("ads");
      for (const a of ads) {
        const newStatus = mapStatus(statuses.get(a.metaAdId!) ?? "");
        if (newStatus && newStatus !== a.status) {
          await prisma.ad.update({ where: { id: a.id }, data: { status: newStatus } });
          adsUpdated++;
        }
      }
    }
  } catch (e: any) {
    console.error("[ads-sync] error:", e?.message ?? e);
    return { campaigns: campaignsUpdated, adsets: adsetsUpdated, ads: adsUpdated, error: e?.message ?? "Error sync Meta" };
  }

  return { campaigns: campaignsUpdated, adsets: adsetsUpdated, ads: adsUpdated };
}
