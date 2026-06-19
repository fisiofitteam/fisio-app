import { prisma } from "@/lib/prisma";
import { CampaignsTree } from "@/components/CampaignsTree";
import { syncMetaStatuses } from "@/lib/ads-sync";

export const dynamic = "force-dynamic";

export default async function CampanasPage() {
  // Best-effort: sincroniza status local de campañas/adsets/ads enlazadas con
  // Meta. Si Meta falla, ignoramos y seguimos con los datos locales.
  await syncMetaStatuses().catch(() => null);

  const campaigns = await prisma.adCampaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      adSets: {
        orderBy: { createdAt: "asc" },
        include: {
          ads: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              name: true,
              format: true,
              status: true,
              hook: true,
              finalFileUrl: true,
              metaAdId: true,
              ctaUrl: true,
            },
          },
        },
      },
    },
  });

  return (
    <CampaignsTree
      campaigns={campaigns.map((c) => ({
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
        adSets: c.adSets.map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status as any,
          metaAdsetId: s.metaAdsetId,
          dailyBudget: s.dailyBudget,
          startDate: s.startDate?.toISOString() ?? null,
          endDate: s.endDate?.toISOString() ?? null,
          ads: s.ads.map((a) => ({
            id: a.id,
            name: a.name,
            format: a.format as any,
            status: a.status as any,
            hook: a.hook,
            finalFileUrl: a.finalFileUrl,
            metaAdId: a.metaAdId,
            ctaUrl: a.ctaUrl,
          })),
        })),
      }))}
    />
  );
}
