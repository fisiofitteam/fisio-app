/**
 * GET /api/programs/list
 * Lista básica de programas de la biblioteca para pickers. Excluye
 * standalone (sesiones sueltas). Roles pro (ceo/head_success/fisio).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const allowed = user.role === "ceo" || user.role === "head_success" || user.role === "fisio";
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const programs = await prisma.program.findMany({
    where: { isStandalone: false },
    orderBy: [{ bodyZone: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, type: true, level: true,
      weeksCount: true, bodyZone: true,
    },
  });

  return NextResponse.json(programs);
}
