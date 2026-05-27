import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { metaConfigured, getCampaignInsights } from "@/lib/meta";

function monthRange() {
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const until = now.toISOString().slice(0, 10);
  return { since, until, year: now.getUTCFullYear(), month: now.getUTCMonth() };
}

// GET — campañas del mes con su gasto y su clasificación (follow/conversion).
export async function GET() {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!metaConfigured()) return NextResponse.json({ configured: false });

  const { since, until } = monthRange();
  try {
    const campaigns = await getCampaignInsights(since, until);
    const tags = await prisma.adCampaignTag.findMany({ where: { campaignId: { in: campaigns.map((c) => c.campaignId) } } });
    const tagByCampaign = new Map(tags.map((t) => [t.campaignId, t.bucket]));
    return NextResponse.json({
      configured: true,
      campaigns: campaigns.map((c) => ({ ...c, bucket: tagByCampaign.get(c.campaignId) ?? "" })),
    });
  } catch (e: any) {
    return NextResponse.json({ configured: true, error: e.message });
  }
}

// POST — { campaignId, bucket } clasificar  |  { action:"sync-month" } volcar al mes
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!metaConfigured()) return NextResponse.json({ error: "Meta no configurado" }, { status: 400 });

  const b = await req.json().catch(() => ({}));

  if (b?.action === "sync-month") {
    const { since, until, year, month } = monthRange();
    try {
      const campaigns = await getCampaignInsights(since, until);
      const tags = await prisma.adCampaignTag.findMany();
      const bucketOf = new Map(tags.map((t) => [t.campaignId, t.bucket]));
      let follow = 0, conversion = 0;
      for (const c of campaigns) {
        const bk = bucketOf.get(c.campaignId);
        if (bk === "follow") follow += c.spend;
        else if (bk === "conversion") conversion += c.spend;
      }
      await prisma.businessMonthlyInput.upsert({
        where: { year_month: { year, month } },
        create: { year, month, adsSpend: follow, adsConversion: conversion },
        update: { adsSpend: follow, adsConversion: conversion },
      });
      return NextResponse.json({ ok: true, follow, conversion });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
  }

  const campaignId = typeof b?.campaignId === "string" ? b.campaignId : "";
  const bucket = b?.bucket;
  if (!campaignId) return NextResponse.json({ error: "campaignId requerido" }, { status: 400 });
  if (bucket === "follow" || bucket === "conversion") {
    await prisma.adCampaignTag.upsert({
      where: { campaignId },
      create: { campaignId, bucket },
      update: { bucket },
    });
  } else {
    await prisma.adCampaignTag.deleteMany({ where: { campaignId } });
  }
  return NextResponse.json({ ok: true });
}
