import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

// GET /api/patients/search?q=texto — busca pacientes por nombre para el selector
// rápido de la ficha. Managers ven todos; fisios solo los suyos.
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json([]);

  const where: any = { fullName: { contains: q, mode: "insensitive" } };
  if (!user.isManager) where.assignedProfessionalId = user.id;

  const patients = await prisma.patient.findMany({
    where,
    select: { id: true, fullName: true, programType: true, diagnosis: true },
    orderBy: { fullName: "asc" },
    take: 8,
  });
  return NextResponse.json(patients);
}
