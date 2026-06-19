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
  const adsetId = typeof data?.adsetId === "string" ? data.adsetId : "";
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  if (!adsetId || !name) return NextResponse.json({ error: "adsetId y name requeridos" }, { status: 400 });

  const created = await prisma.ad.create({
    data: {
      adsetId,
      name,
      format: typeof data?.format === "string" ? data.format : "video",
      hook: typeof data?.hook === "string" ? data.hook.trim() || null : null,
      script: typeof data?.script === "string" ? data.script.trim() || null : null,
      cta: typeof data?.cta === "string" ? data.cta.trim() || null : null,
      ctaUrl: typeof data?.ctaUrl === "string" ? data.ctaUrl.trim() || null : null,
      finalFileUrl: typeof data?.finalFileUrl === "string" ? data.finalFileUrl.trim() || null : null,
      editorNotes: typeof data?.editorNotes === "string" ? data.editorNotes.trim() || null : null,
      recordingLocation: typeof data?.recordingLocation === "string" ? data.recordingLocation.trim() || null : null,
      recordingOutfit: typeof data?.recordingOutfit === "string" ? data.recordingOutfit.trim() || null : null,
      recordingMaterial: typeof data?.recordingMaterial === "string" ? data.recordingMaterial.trim() || null : null,
      consentSigned: !!data?.consentSigned,
      status: typeof data?.status === "string" ? data.status : "idea",
      metaAdId: typeof data?.metaAdId === "string" ? data.metaAdId.trim() || null : null,
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
  const textFields = [
    "name", "format", "hook", "script", "cta", "ctaUrl",
    "finalFileUrl", "editorNotes",
    "recordingLocation", "recordingOutfit", "recordingMaterial",
    "status", "metaAdId",
  ];
  for (const k of textFields) {
    if (data[k] !== undefined) update[k] = data[k] === "" || data[k] === null ? null : String(data[k]);
  }
  if (data.consentSigned !== undefined) update.consentSigned = !!data.consentSigned;

  await prisma.ad.update({ where: { id }, data: update });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageAds(user.role)) return unauthorized();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  await prisma.ad.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
