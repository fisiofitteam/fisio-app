import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

/**
 * PATCH /api/team/closer-intro
 * Body: { professionalId: string, closerIntro: string | null }
 *
 * Solo CEO / head_success. Edita la presentación que se interpola en las
 * plantillas de mensaje del closer ({closer.intro}).
 */
export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || (user.role !== "ceo" && user.role !== "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { professionalId, closerIntro } = await req.json();
  if (!professionalId) return NextResponse.json({ error: "professionalId requerido" }, { status: 400 });

  const intro = typeof closerIntro === "string" && closerIntro.trim() ? closerIntro.trim() : null;
  const updated = await prisma.professional.update({
    where: { id: professionalId },
    data: { closerIntro: intro },
    select: { id: true, closerIntro: true },
  });
  return NextResponse.json(updated);
}
