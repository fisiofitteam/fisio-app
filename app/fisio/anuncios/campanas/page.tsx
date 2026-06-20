import { prisma } from "@/lib/prisma";
import { CampaignsList } from "@/components/CampaignsList";
import { syncMetaStatuses } from "@/lib/ads-sync";

export const dynamic = "force-dynamic";

export default async function CampanasPage() {
  // Best-effort: sincroniza status local de las campañas/adsets/ads que
  // tengan metaXxxId. Si Meta no responde, seguimos con los datos locales.
  await syncMetaStatuses().catch(() => null);

  const campaigns = await prisma.adCampaign.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      adSets: { select: { id: true, ads: { select: { id: true, status: true } } } },
    },
  });

  const list = campaigns.map((c) => {
    const ads = c.adSets.flatMap((s) => s.ads);
    return {
      id: c.id,
      name: c.name,
      objective: c.objective,
      status: c.status as any,
      metaCampaignId: c.metaCampaignId,
      startDate: c.startDate?.toISOString() ?? null,
      endDate: c.endDate?.toISOString() ?? null,
      dailyBudget: c.dailyBudget,
      totalBudget: c.totalBudget,
      notes: c.notes,
      adsCount: ads.length,
      activeCount: ads.filter((a) => a.status === "active").length,
      inProductionCount: ads.filter((a) => ["idea", "brief", "recording", "editing", "scheduled"].includes(a.status)).length,
    };
  });

  return <CampaignsList campaigns={list} />;
}
