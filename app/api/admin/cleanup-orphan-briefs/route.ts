/**
 * POST /api/admin/cleanup-orphan-briefs
 *
 * Limpia registros de AiTrainingBrief y AiSessionExample cuyo `kind` sea el
 * id de un RollingProgram con role != "" (los que heredan brief builtin).
 * Los kinds builtin ("accesorios", "entrenamiento") se preservan siempre.
 *
 * Utilidad puntual tras la migración de 2026-07-11: al pasar a "cada
 * programa custom es un kind", los programas con role builtin quedaron
 * con briefs propios huérfanos. Este endpoint los borra.
 *
 * Solo CEO.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const runtime = "nodejs";

export async function POST() {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const programsWithRole = await prisma.rollingProgram.findMany({
    where: { NOT: { role: "" } },
    select: { id: true, name: true, role: true },
  });
  const ids = programsWithRole.map((p) => p.id);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, cleaned: { briefs: 0, examples: 0 }, programs: [] });
  }

  const briefs = await prisma.aiTrainingBrief.deleteMany({ where: { id: { in: ids } } });
  const examples = await prisma.aiSessionExample.deleteMany({ where: { kind: { in: ids } } });

  return NextResponse.json({
    ok: true,
    cleaned: { briefs: briefs.count, examples: examples.count },
    programs: programsWithRole,
  });
}
