import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canManageAds } from "@/lib/ads";

function unauthorized() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageAds(user.role)) return unauthorized();
  const data = await req.json().catch(() => ({}));
  const campaignId = typeof data?.campaignId === "string" ? data.campaignId : "";
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  if (!campaignId || !name) return NextResponse.json({ error: "campaignId y name requeridos" }, { status: 400 });

  const created = await prisma.adSet.create({
    data: {
      campaignId,
      name,
      audienceJSON: typeof data?.audienceJSON === "string" ? data.audienceJSON : "{}",
      placementJSON: typeof data?.placementJSON === "string" ? data.placementJSON : "[]",
      metaAdsetId: typeof data?.metaAdsetId === "string" ? data.metaAdsetId.trim() || null : null,
      status: typeof data?.status === "string" ? data.status : "idea",
      startDate: data?.startDate ? new Date(data.startDate) : null,
      endDate: data?.endDate ? new Date(data.endDate) : null,
      dailyBudget: data?.dailyBudget != null && data.dailyBudget !== "" ? Number(data.dailyBudget) : null,
      notes: typeof data?.notes === "string" ? data.notes.trim() || null : null,
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
  for (const k of ["name", "audienceJSON", "placementJSON", "metaAdsetId", "status", "notes"]) {
    if (data[k] !== undefined) update[k] = data[k] === "" ? null : String(data[k]);
  }
  if (data.startDate !== undefined) update.startDate = data.startDate ? new Date(data.startDate) : null;
  if (data.endDate !== undefined) update.endDate = data.endDate ? new Date(data.endDate) : null;
  if (data.dailyBudget !== undefined) update.dailyBudget = data.dailyBudget === null || data.dailyBudget === "" ? null : Number(data.dailyBudget);

  await prisma.adSet.update({ where: { id }, data: update });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageAds(user.role)) return unauthorized();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  await prisma.adSet.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
