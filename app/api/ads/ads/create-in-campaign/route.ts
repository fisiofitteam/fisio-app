/**
 * POST /api/ads/ads/create-in-campaign
 *
 * Atajo para crear un Ad directamente dentro de una campaña sin tener que
 * preocuparse de AdSet. Si la campaña no tiene AdSet, creamos uno "Por defecto".
 *
 * Body: { campaignId, name, format? }
 * Devuelve: { id } del nuevo Ad.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canManageAds } from "@/lib/ads";

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageAds(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const data = await req.json().catch(() => ({}));
  const campaignId = typeof data?.campaignId === "string" ? data.campaignId : "";
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  if (!campaignId || !name) {
    return NextResponse.json({ error: "campaignId y name requeridos" }, { status: 400 });
  }
  const format = typeof data?.format === "string" ? data.format : "video";

  // Buscar o crear el AdSet "Por defecto" de esta campaña.
  let adset = await prisma.adSet.findFirst({
    where: { campaignId },
    orderBy: { createdAt: "asc" },
  });
  if (!adset) {
    adset = await prisma.adSet.create({
      data: { campaignId, name: "Por defecto", status: "idea" },
    });
  }

  const ad = await prisma.ad.create({
    data: { adsetId: adset.id, name, format, status: "idea" },
  });

  return NextResponse.json({ id: ad.id });
}
