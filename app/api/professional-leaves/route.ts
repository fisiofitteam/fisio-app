import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

const MIN_DAYS_TO_COMPENSATE = 8; // Solo aplicamos bonus si vacaciones >= 8 días

function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetweenInclusive(start: Date, end: Date): number {
  // Días totales contando ambos extremos: del 1 al 14 = 14 días
  const ms = end.getTime() - start.getTime();
  return Math.round(ms / 86400000) + 1;
}

/**
 * Aplica el bonus de vacaciones: suma N días al endDate del periodo activo
 * de cada paciente RECUPERA/CONSOLIDA asignado al profesional.
 *
 * Devuelve la cuenta de pacientes afectados.
 */
async function applyLeaveBonus(leaveId: string): Promise<number> {
  const leave = await prisma.professionalLeave.findUnique({ where: { id: leaveId } });
  if (!leave) return 0;

  const days = daysBetweenInclusive(leave.startDate, leave.endDate);
  if (days < MIN_DAYS_TO_COMPENSATE) {
    // Vacaciones cortas: marcamos como applied pero sin compensación
    await prisma.professionalLeave.update({
      where: { id: leaveId },
      data: { status: "applied", daysApplied: 0, affectedPatientsCount: 0, appliedAt: new Date() },
    });
    return 0;
  }

  // Pacientes activos del profesional, en RECUPERA/CONSOLIDA
  const patients = await prisma.patient.findMany({
    where: {
      assignedProfessionalId: leave.professionalId,
      programType: { in: ["RECUPERA", "CONSOLIDA"] },
    },
    include: {
      renewals: { where: { status: "active" }, take: 1 },
      assignedProfessional: { select: { fullName: true } },
    },
  });

  let affected = 0;
  for (const p of patients) {
    const active = p.renewals[0];
    if (!active?.endDate) continue;

    // Sumar N días al endDate
    const newEnd = new Date(active.endDate.getTime() + days * 86400000);
    const fisioName = p.assignedProfessional?.fullName || "tu fisio";
    const noteAddon = `\n+${days}d por vacaciones de ${fisioName} (${leave.startDate.toLocaleDateString("es-ES")} – ${leave.endDate.toLocaleDateString("es-ES")})`;
    await prisma.subscriptionRenewal.update({
      where: { id: active.id },
      data: {
        endDate: newEnd,
        notes: (active.notes || "") + noteAddon,
      },
    });
    affected++;

    // Crear notificación para el paciente
    await prisma.patientNotification.create({
      data: {
        patientId: p.id,
        type: "leave_bonus",
        title: `Tu fisio ${fisioName} está de vacaciones`,
        body: `Tu suscripción se ha alargado +${days} días gratis. Tu próxima renovación pasa al ${newEnd.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}. Disfrútalo.`,
      },
    }).catch(() => {}); // no fallar si la tabla no existe aún o cualquier otra cosa
  }

  await prisma.professionalLeave.update({
    where: { id: leaveId },
    data: {
      status: "applied",
      daysApplied: days,
      affectedPatientsCount: affected,
      appliedAt: new Date(),
    },
  });

  return affected;
}

/**
 * Revierte el bonus de una vacación aplicada.
 */
async function revertLeaveBonus(leaveId: string) {
  const leave = await prisma.professionalLeave.findUnique({ where: { id: leaveId } });
  if (!leave || leave.status !== "applied" || leave.daysApplied === 0) return;

  // Pacientes que estaban asignados al profesional cuando se aplicó.
  // Asumimos que siguen siendo los mismos (caso edge: si cambiaron de fisio
  // entre aplicación y reversión, esta lógica se queda corta. Aceptable.)
  const patients = await prisma.patient.findMany({
    where: {
      assignedProfessionalId: leave.professionalId,
      programType: { in: ["RECUPERA", "CONSOLIDA"] },
    },
    include: {
      renewals: { where: { status: "active" }, take: 1 },
    },
  });

  for (const p of patients) {
    const active = p.renewals[0];
    if (!active?.endDate) continue;
    const newEnd = new Date(active.endDate.getTime() - leave.daysApplied * 86400000);
    await prisma.subscriptionRenewal.update({
      where: { id: active.id },
      data: { endDate: newEnd },
    });
  }
}

// ============================================================================
// GET /api/professional-leaves
// Lista todas las vacaciones del equipo (cualquier usuario las puede ver
// porque el Calendario Equipo es público para el equipo).
// Filtros opcionales: ?professionalId=xxx&from=ISO&to=ISO
// ============================================================================
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const professionalId = req.nextUrl.searchParams.get("professionalId");
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  const where: any = {};
  if (professionalId) where.professionalId = professionalId;
  if (from || to) {
    where.AND = [];
    if (from) where.AND.push({ endDate: { gte: new Date(from) } });
    if (to) where.AND.push({ startDate: { lte: new Date(to) } });
  }

  const leaves = await prisma.professionalLeave.findMany({
    where,
    include: { professional: { select: { id: true, fullName: true, role: true } } },
    orderBy: { startDate: "asc" },
  });
  return NextResponse.json(leaves);
}

// ============================================================================
// POST /api/professional-leaves
// Crea una vacación para un profesional. Solo CEO/Head_success.
// Body: { professionalId, startDate, endDate, notes }
//
// Si startDate <= hoy, se aplica el bonus inmediatamente (status: applied).
// Si startDate > hoy, queda como "scheduled" hasta que llegue su fecha.
// ============================================================================
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(user.role === "ceo" || user.role === "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { professionalId, startDate, endDate, notes } = await req.json();
  if (!professionalId || !startDate || !endDate) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  if (end < start) {
    return NextResponse.json({ error: "La fecha de fin debe ser igual o posterior a la de inicio" }, { status: 400 });
  }

  // No permitimos solapamientos con otras vacaciones del mismo profesional
  const overlap = await prisma.professionalLeave.findFirst({
    where: {
      professionalId,
      status: { in: ["scheduled", "applied"] },
      startDate: { lte: end },
      endDate: { gte: start },
    },
  });
  if (overlap) {
    return NextResponse.json(
      { error: `Las fechas solapan con otra vacación existente (${overlap.startDate.toLocaleDateString("es-ES")} – ${overlap.endDate.toLocaleDateString("es-ES")})` },
      { status: 409 }
    );
  }

  const today = todayMidnight();
  const leave = await prisma.professionalLeave.create({
    data: {
      professionalId,
      startDate: start,
      endDate: end,
      notes: notes?.trim() || null,
      createdById: user.id,
      status: "scheduled",
    },
  });

  // Si las vacaciones empiezan hoy o antes, aplicamos el bonus ya
  if (start <= today) {
    await applyLeaveBonus(leave.id);
  }

  return NextResponse.json({ ok: true, leaveId: leave.id });
}

// ============================================================================
// DELETE /api/professional-leaves?id=xxx
// Cancelar vacación. Si ya estaba applied, revierte el bonus.
// ============================================================================
export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(user.role === "ceo" || user.role === "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const leave = await prisma.professionalLeave.findUnique({ where: { id } });
  if (!leave) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (leave.status === "applied" && leave.daysApplied > 0) {
    await revertLeaveBonus(id);
  }

  await prisma.professionalLeave.update({
    where: { id },
    data: { status: "cancelled", cancelledAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

// Exportar el helper para que el cron diario pueda llamarlo
export { applyLeaveBonus };
