import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canManageAds } from "@/lib/ads";

function unauthorized() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/** GET — lista de campañas con sus adsets y ads, ordenadas por creación desc. */
export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canManageAds(user.role)) return unauthorized();

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
              finalFileUrl: true,
              metaAdId: true,
              ctaUrl: true,
            },
          },
        },
      },
    },
  });
  return NextResponse.json({ campaigns });
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageAds(user.role)) return unauthorized();
  const data = await req.json().catch(() => ({}));
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Nombre obligatorio" }, { status: 400 });

  const created = await prisma.adCampaign.create({
    data: {
      name,
      objective: typeof data?.objective === "string" ? data.objective : "conversions",
      status: typeof data?.status === "string" ? data.status : "idea",
      metaCampaignId: typeof data?.metaCampaignId === "string" ? data.metaCampaignId.trim() || null : null,
      startDate: data?.startDate ? new Date(data.startDate) : null,
      endDate: data?.endDate ? new Date(data.endDate) : null,
      dailyBudget: data?.dailyBudget != null ? Number(data.dailyBudget) || null : null,
      totalBudget: data?.totalBudget != null ? Number(data.totalBudget) || null : null,
      notes: typeof data?.notes === "string" ? data.notes.trim() || null : null,
      createdById: user.id,
    },
  });
  return NextResponse.json({ id: created.id });
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageAds(user.role)) return unauthorized();
  const data = await req.json().catch(() => ({}));
  const id = typeof data?.id === "string" ? data.id : "";
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const update: any = {};
  for (const k of ["name", "objective", "status", "metaCampaignId", "notes"]) {
    if (data[k] !== undefined) update[k] = data[k] === "" ? null : String(data[k]).trim();
  }
  if (data.startDate !== undefined) update.startDate = data.startDate ? new Date(data.startDate) : null;
  if (data.endDate !== undefined) update.endDate = data.endDate ? new Date(data.endDate) : null;
  if (data.dailyBudget !== undefined) update.dailyBudget = data.dailyBudget === null || data.dailyBudget === "" ? null : Number(data.dailyBudget);
  if (data.totalBudget !== undefined) update.totalBudget = data.totalBudget === null || data.totalBudget === "" ? null : Number(data.totalBudget);

  await prisma.adCampaign.update({ where: { id }, data: update });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageAds(user.role)) return unauthorized();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  await prisma.adCampaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
