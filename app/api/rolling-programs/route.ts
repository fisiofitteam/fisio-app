import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

const ALLOWED = new Set(["", "advance-accesorios", "advance-entrenamiento", "prevention"]);

// GET: lista de programas rolling --------------------------------------------

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Filtrado opcional por línea de servicio (Advance vs Prevention). Sin
  // parámetro devuelve TODO el catálogo (comportamiento anterior).
  const roleFilter = req.nextUrl.searchParams.get("role");
  const where = roleFilter ? { role: roleFilter } : {};

  const programs = await prisma.rollingProgram.findMany({
    where,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { patientsLegacy: true, patientsAccessories: true, patientsTraining: true, weeks: true } },
    },
  });
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

  const { name, description, role, aiBriefPrompt } = await req.json();
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }
  const finalRole = typeof role === "string" && ALLOWED.has(role) ? role : "";
  const finalPrompt = typeof aiBriefPrompt === "string" && aiBriefPrompt.trim()
    ? aiBriefPrompt.trim()
    : null;

  const program = await prisma.rollingProgram.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      role: finalRole,
      aiBriefPrompt: finalPrompt,
    } as any,
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

  const { id, name, description, isActive, role, aiBriefPrompt } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const roleUpdate =
    typeof role === "string" && ALLOWED.has(role) ? { role } : {};
  // aiBriefPrompt: null explícito -> quita el brief. undefined -> no toca. string vacío -> null.
  const promptUpdate =
    aiBriefPrompt === null || typeof aiBriefPrompt === "string"
      ? { aiBriefPrompt: (typeof aiBriefPrompt === "string" && aiBriefPrompt.trim()) ? aiBriefPrompt.trim() : null }
      : {};

  const updated = await prisma.rollingProgram.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(isActive !== undefined && { isActive: !!isActive }),
      ...roleUpdate,
      ...promptUpdate,
    } as any,
  });
  return NextResponse.json(updated);
}
