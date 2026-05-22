import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

// GET: lista de programas rolling --------------------------------------------

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const programs = await prisma.rollingProgram.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { patientsLegacy: true, patientsAccessories: true, patientsTraining: true, weeks: true } },
    },
  });
  // Devolvemos también un patientsCount agregado para compat con UI antiguas
  const enriched = programs.map((p) => ({
    ...p,
    patientsCount: p._count.patientsLegacy + p._count.patientsAccessories + p._count.patientsTraining,
  }));
  return NextResponse.json(enriched);
}

// POST: crear programa rolling -----------------------------------------------

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(user.role === "ceo" || user.role === "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, description } = await req.json();
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }

  const program = await prisma.rollingProgram.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
    },
  });
  return NextResponse.json({ ok: true, programId: program.id });
}

// PATCH: editar / archivar programa rolling ----------------------------------

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(user.role === "ceo" || user.role === "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, name, description, isActive } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updated = await prisma.rollingProgram.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(isActive !== undefined && { isActive: !!isActive }),
    },
  });
  return NextResponse.json(updated);
}
