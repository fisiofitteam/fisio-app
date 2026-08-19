/**
 * Derivaciones de un paciente: fisios ADICIONALES que pueden ver/editar
 * la ficha del paciente sin ser el asignado principal. NO cuentan para
 * las métricas del receptor — la titularidad sigue en assignedProfessionalId.
 *
 * GET    /api/patients/[id]/derivations
 * POST   /api/patients/[id]/derivations   body: { toProfessionalId, note? }
 * DELETE /api/patients/[id]/derivations?id=... — revoca (hard-delete)
 *
 * Permisos:
 *  - Manager (CEO/head_success) → siempre puede crear/borrar.
 *  - Fisio asignado del paciente → puede crear/borrar derivaciones.
 *  - Fisio derivado → puede ver la lista pero no crear/borrar (no es el dueño).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

async function loadContext(id: string) {
  const user = await getActiveProfessional();
  if (!user) return { error: "Unauthorized" as const, status: 401 };
  const patient = await prisma.patient.findUnique({
    where: { id },
    select: { id: true, assignedProfessionalId: true, fullName: true },
  });
  if (!patient) return { error: "Paciente no encontrado" as const, status: 404 };
  return { user, patient };
}

/** Puede leer las derivaciones si es manager, dueño, o él mismo derivado. */
async function canRead(userId: string, userRole: string, patient: { assignedProfessionalId: string | null }, patientId: string): Promise<boolean> {
  if (userRole === "ceo" || userRole === "head_success") return true;
  if (patient.assignedProfessionalId === userId) return true;
  const asDerivee = await (prisma as any).patientDerivation.findFirst({
    where: { patientId, toProfessionalId: userId },
    select: { id: true },
  });
  return !!asDerivee;
}

/** Puede editar (crear/borrar) si es manager o el fisio asignado. */
function canWrite(userId: string, userRole: string, patient: { assignedProfessionalId: string | null }): boolean {
  if (userRole === "ceo" || userRole === "head_success") return true;
  return patient.assignedProfessionalId === userId;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await loadContext(params.id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const ok = await canRead(g.user.id, g.user.role, g.patient, params.id);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const list = await (prisma as any).patientDerivation.findMany({
    where: { patientId: params.id },
    orderBy: { createdAt: "desc" },
    include: {
      toProfessional: { select: { id: true, fullName: true, role: true } },
      fromProfessional: { select: { id: true, fullName: true } },
    },
  });
  return NextResponse.json({
    derivations: list.map((d: any) => ({
      id: d.id,
      note: d.note,
      createdAt: d.createdAt.toISOString(),
      to: d.toProfessional,
      from: d.fromProfessional,
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await loadContext(params.id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!canWrite(g.user.id, g.user.role, g.patient)) {
    return NextResponse.json({ error: "Solo el fisio asignado o un manager puede derivar" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const toProfessionalId = String(b?.toProfessionalId ?? "");
  const note = typeof b?.note === "string" ? b.note.trim().slice(0, 500) : null;
  if (!toProfessionalId) {
    return NextResponse.json({ error: "toProfessionalId requerido" }, { status: 400 });
  }
  if (toProfessionalId === g.patient.assignedProfessionalId) {
    return NextResponse.json({ error: "Ese profesional ya es el asignado del paciente" }, { status: 400 });
  }
  const toPro = await prisma.professional.findUnique({
    where: { id: toProfessionalId },
    select: { id: true, role: true, active: true, fullName: true },
  });
  if (!toPro || !toPro.active) {
    return NextResponse.json({ error: "Profesional no encontrado o inactivo" }, { status: 404 });
  }
  // Solo fisios/managers pueden recibir derivaciones (los setters/closers
  // no acceden al panel clínico).
  if (!["fisio", "head_success", "ceo"].includes(toPro.role)) {
    return NextResponse.json({ error: "Ese profesional no tiene rol clínico" }, { status: 400 });
  }

  try {
    const created = await (prisma as any).patientDerivation.create({
      data: {
        patientId: params.id,
        fromProfessionalId: g.user.id,
        toProfessionalId,
        note,
      },
      include: {
        toProfessional: { select: { id: true, fullName: true, role: true } },
        fromProfessional: { select: { id: true, fullName: true } },
      },
    });
    return NextResponse.json({
      derivation: {
        id: created.id,
        note: created.note,
        createdAt: created.createdAt.toISOString(),
        to: created.toProfessional,
        from: created.fromProfessional,
      },
    });
  } catch (e: any) {
    // P2002 = unique violation (ya existe una derivación para este par)
    if (e?.code === "P2002") {
      return NextResponse.json({ error: `${toPro.fullName} ya está derivado a este paciente` }, { status: 409 });
    }
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await loadContext(params.id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!canWrite(g.user.id, g.user.role, g.patient)) {
    return NextResponse.json({ error: "Solo el fisio asignado o un manager puede revocar" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const row = await (prisma as any).patientDerivation.findUnique({ where: { id } });
  if (!row || row.patientId !== params.id) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }

  await (prisma as any).patientDerivation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
