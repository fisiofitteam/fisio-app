import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

// Cualquier profesional del equipo puede borrar un resultado (mismos roles
// que moderan la comunidad). Útil para limpiar resultados de prueba.
function canModerate(role: string): boolean {
  return role === "ceo" || role === "head_success" || role === "fisio" || role === "setter" || role === "closer";
}

// DELETE /api/monthly-challenges/results/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user || !canModerate(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.monthlyChallengeResult.delete({ where: { id: params.id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
