/**
 * POST /api/patient-banners/[id]/dismiss
 * El paciente logueado marca un banner como descartado. Idempotente:
 * si ya lo había descartado, no falla.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActivePatient } from "@/lib/auth";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const active = await getActivePatient();
  if (!active) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banner = await (prisma as any).patientBanner.findUnique({ where: { id: params.id } });
  if (!banner) return NextResponse.json({ error: "Banner no existe" }, { status: 404 });
  if (!banner.dismissible) return NextResponse.json({ error: "Este banner no se puede descartar" }, { status: 403 });

  await (prisma as any).patientBannerDismiss.upsert({
    where: { bannerId_patientId: { bannerId: params.id, patientId: active.id } },
    create: { bannerId: params.id, patientId: active.id },
    update: {}, // idempotente
  });
  return NextResponse.json({ ok: true });
}
