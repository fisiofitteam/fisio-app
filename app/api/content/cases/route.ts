import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function canAccess(role: string): boolean {
  return role === "ceo" || role === "setter";
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const d = await req.json();
  const c = await prisma.clinicalCase.create({
    data: {
      athleteName: d.athleteName,
      injury: d.injury,
      insight: d.insight || null,
      consentSigned: !!d.consentSigned,
      consentSignedAt: d.consentSigned ? new Date() : null,
      videoUrls: JSON.stringify(d.videoUrls ?? []),
      notes: d.notes || null,
      patientId: d.patientId || null,
    },
  });
  return NextResponse.json(c);
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, ...rest } = await req.json();
  const update: any = {};
  if (rest.athleteName !== undefined) update.athleteName = rest.athleteName;
  if (rest.injury !== undefined) update.injury = rest.injury;
  if (rest.insight !== undefined) update.insight = rest.insight || null;
  if (rest.consentSigned !== undefined) {
    update.consentSigned = !!rest.consentSigned;
    if (rest.consentSigned) update.consentSignedAt = new Date();
    else update.consentSignedAt = null;
  }
  if (rest.videoUrls !== undefined) update.videoUrls = JSON.stringify(rest.videoUrls);
  if (rest.notes !== undefined) update.notes = rest.notes || null;
  if (rest.patientId !== undefined) update.patientId = rest.patientId || null;
  const c = await prisma.clinicalCase.update({ where: { id }, data: update });
  return NextResponse.json(c);
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canAccess(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  await prisma.clinicalCase.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
