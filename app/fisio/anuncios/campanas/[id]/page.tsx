import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CampaignAdsView } from "@/components/CampaignAdsView";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const campaign = await prisma.adCampaign.findUnique({
    where: { id: params.id },
    include: {
      adSets: {
        include: {
          ads: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!campaign) notFound();

  const ads = campaign.adSets.flatMap((s) => s.ads).map((a) => ({
    id: a.id,
    name: a.name,
    format: a.format as any,
    status: a.status as any,
    hook: a.hook,
    cta: a.cta,
    finalFileUrl: a.finalFileUrl,
    metaAdId: a.metaAdId,
    createdAt: a.createdAt.toISOString(),
  }));

  return (
    <div>
      <Link href="/fisio/anuncios/campanas" className="text-xs text-neutral-500 hover:text-neutral-900">
        ← Volver a campañas
      </Link>
      <CampaignAdsView
        campaign={{
          id: campaign.id,
          name: campaign.name,
          status: campaign.status as any,
          objective: campaign.objective,
          metaCampaignId: campaign.metaCampaignId,
          dailyBudget: campaign.dailyBudget,
          notes: campaign.notes,
        }}
        ads={ads}
      />
    </div>
  );
}
