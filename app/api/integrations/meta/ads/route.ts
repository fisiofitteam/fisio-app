import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import {
  metaConfigured,
  getCampaignInsights,
  getDailyNewFollowers,
  getInstagramAccount,
} from "@/lib/meta";

function monthRange(year?: number, month?: number) {
  const now = new Date();
  const y = year ?? now.getUTCFullYear();
  const m = month ?? now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  // Fin del mes: si es el mes en curso, hasta hoy; si es pasado, último día del mes.
  const isCurrent = y === now.getUTCFullYear() && m === now.getUTCMonth();
  const end = isCurrent ? now : new Date(Date.UTC(y, m + 1, 0));
  const since = start.toISOString().slice(0, 10);
  const until = end.toISOString().slice(0, 10);
  return { since, until, year: y, month: m, isCurrent };
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
    const reqYear = Number.isInteger(b?.year) ? Number(b.year) : undefined;
    const reqMonth = Number.isInteger(b?.month) ? Number(b.month) : undefined;
    if (reqMonth != null && (reqMonth < 0 || reqMonth > 11)) {
      return NextResponse.json({ error: "month debe ir de 0 a 11" }, { status: 400 });
    }
    const { since, until, year, month, isCurrent } = monthRange(reqYear, reqMonth);
    try {
      // Gasto por bucket (usa las clasificaciones ya hechas por el CEO).
      const campaigns = await getCampaignInsights(since, until);
      const tags = await prisma.adCampaignTag.findMany();
      const bucketOf = new Map(tags.map((t) => [t.campaignId, t.bucket]));
      let follow = 0, conversion = 0;
      for (const c of campaigns) {
        const bk = bucketOf.get(c.campaignId);
        if (bk === "follow") follow += c.spend;
        else if (bk === "conversion") conversion += c.spend;
      }

      // Followers: IG solo devuelve últimos 30 días — para el mes en curso
      // suele cubrir todo el mes; para el anterior cubre solo la parte que
      // caiga dentro de esa ventana (aviso al usuario en la UI).
      let newFollowers: number | null = null;
      let totalFollowers: number | null = null;
      try {
        const daily = await getDailyNewFollowers(30);
        newFollowers = daily
          .filter((d) => d.date >= since && d.date <= until)
          .reduce((a, d) => a + d.value, 0);
      } catch { /* si falla IG insights, dejamos newFollowers en null */ }
      // totalFollowers es una foto del contador actual — solo tiene sentido
      // si estamos sincronizando el mes en curso. Para meses pasados lo dejamos.
      if (isCurrent) {
        try {
          const acc = await getInstagramAccount();
          totalFollowers = acc.followersCount ?? null;
        } catch { /* si falla IG account, no tocamos totalFollowers */ }
      }

      await prisma.businessMonthlyInput.upsert({
        where: { year_month: { year, month } },
        create: {
          year,
          month,
          adsSpend: follow,
          adsConversion: conversion,
          ...(newFollowers != null && { newFollowers }),
          ...(totalFollowers != null && { totalFollowers }),
        },
        update: {
          adsSpend: follow,
          adsConversion: conversion,
          ...(newFollowers != null && { newFollowers }),
          ...(totalFollowers != null && { totalFollowers }),
        },
      });
      return NextResponse.json({ ok: true, follow, conversion, newFollowers, totalFollowers });
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
