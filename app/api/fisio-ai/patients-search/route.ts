/**
 * GET /api/fisio-ai/patients-search?q=... — buscador de pacientes por
 * nombre parcial para el picker de Fisio IA. Devuelve máximo 10.
 * Solo CEO por ahora.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ patients: [] });

  const patients = await prisma.patient.findMany({
    where: { fullName: { contains: q } },
    select: { id: true, fullName: true, programType: true },
    orderBy: { fullName: "asc" },
    take: 10,
  });
  return NextResponse.json({ patients });
}
