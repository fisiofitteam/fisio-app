import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (user.role !== "setter" && !user.isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { patientId, sent } = await req.json();
  await prisma.patient.update({
    where: { id: patientId },
    data: {
      patchSent: !!sent,
      patchSentAt: sent ? new Date() : null,
    },
  });
  return NextResponse.json({ ok: true });
}
