import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AdEditor } from "@/components/AdEditor";

export const dynamic = "force-dynamic";

export default async function AdEditorPage({ params }: { params: { id: string } }) {
  const ad = await prisma.ad.findUnique({
    where: { id: params.id },
    include: {
      adset: {
        select: {
          id: true,
          name: true,
          campaign: { select: { id: true, name: true, metaCampaignId: true } },
        },
      },
    },
  });
  if (!ad) notFound();

  return (
    <AdEditor
      ad={{
        id: ad.id,
        name: ad.name,
        format: ad.format as any,
        status: ad.status as any,
        hook: ad.hook,
        script: ad.script,
        cta: ad.cta,
        ctaUrl: ad.ctaUrl,
        finalFileUrl: ad.finalFileUrl,
        editorNotes: ad.editorNotes,
        recordingLocation: ad.recordingLocation,
        recordingOutfit: ad.recordingOutfit,
        recordingMaterial: ad.recordingMaterial,
        consentSigned: ad.consentSigned,
        metaAdId: ad.metaAdId,
      }}
      breadcrumb={{
        adsetName: ad.adset.name,
        campaignName: ad.adset.campaign.name,
        campaignId: ad.adset.campaign.id,
      }}
    />
  );
}
