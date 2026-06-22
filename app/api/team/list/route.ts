/**
 * Lista de miembros del equipo (Professional.active=true) — usada por la
 * Vista CEO para vincular tareas en estado "Esperando de…" a una persona.
 *
 * GET /api/team/list → { team: [{ id, fullName, role }] }
 *
 * Restringido a CEO/head_success por consistencia con el resto del panel.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo" && user.role !== "head_success") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const team = await prisma.professional.findMany({
    where: { active: true },
    select: { id: true, fullName: true, role: true },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
  });
  return NextResponse.json({ team });
}
