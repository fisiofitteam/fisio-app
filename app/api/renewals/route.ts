import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

/**
 * GET /api/renewals?patientId=xxx
 * Lista los periodos de suscripción del paciente, ordenados cronológicamente.
 */
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const patientId = req.nextUrl.searchParams.get("patientId");
  if (!patientId) return NextResponse.json({ error: "patientId required" }, { status: 400 });

  const renewals = await prisma.subscriptionRenewal.findMany({
    where: { patientId },
    orderBy: { startDate: "asc" },
  });
  return NextResponse.json(renewals);
}

/**
 * POST /api/renewals
 * Crear un nuevo periodo (renovación).
 *
 * Comportamiento:
 *  - Si hay un periodo activo con endDate en el futuro: el nuevo periodo se
 *    crea en estado "scheduled" empezando en endDate del actual. El periodo
 *    activo NO se cierra (sigue corriendo hasta su endDate natural).
 *  - Si hay un periodo activo ya vencido (endDate <= hoy) o no hay periodo
 *    activo: el nuevo periodo empieza hoy en estado "active". El periodo
 *    anterior (si lo hay) se cierra (status=finished).
 *
 * Body: { patientId, programType, periodMonths, amountPaid, notes }
 */
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { patientId, programType, periodMonths, amountPaid, notes } = await req.json();

  if (!patientId) return NextResponse.json({ error: "patientId required" }, { status: 400 });
  if (!programType) return NextResponse.json({ error: "programType required" }, { status: 400 });

  const months = Number(periodMonths) || 4;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Buscar periodo activo
  const activePeriod = await prisma.subscriptionRenewal.findFirst({
    where: { patientId, status: "active" },
    orderBy: { startDate: "desc" },
  });

  let startDate: Date;
  let status: "active" | "scheduled";

  if (activePeriod && activePeriod.endDate && activePeriod.endDate > today) {
    // RENOVACIÓN ANTICIPADA: el nuevo empieza cuando acaba el actual
    startDate = activePeriod.endDate;
    status = "scheduled";
  } else {
    // No hay activo o ya está vencido: cerramos cualquier "active" colgado
    // y arrancamos hoy
    await prisma.subscriptionRenewal.updateMany({
      where: { patientId, status: "active" },
      data: { status: "finished", endDate: today },
    });
    startDate = today;
    status = "active";
  }

  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + months);

  const renewal = await prisma.subscriptionRenewal.create({
    data: {
      patientId,
      programType,
      periodMonths: months,
      startDate,
      endDate,
      status,
      amountPaid: amountPaid ? Number(amountPaid) : null,
      notes: notes?.trim() || null,
    },
  });

  // Actualizar paciente:
  //  - Si el nuevo es ACTIVE: se vuelve el periodo activo del paciente
  //  - Si el nuevo es SCHEDULED: NO tocamos los datos del periodo actual,
  //    pero sí sumamos al total acumulado
  if (status === "active") {
    await prisma.patient.update({
      where: { id: patientId },
      data: {
        programType,
        subscriptionStartDate: startDate,
        subscriptionPeriodMonths: months,
      },
    });
  }

  // Recalcular subscriptionTotalMonths = suma de todos los periodos
  const all = await prisma.subscriptionRenewal.findMany({
    where: { patientId },
    select: { periodMonths: true },
  });
  const total = all.reduce((sum, r) => sum + (r.periodMonths || 0), 0);
  await prisma.patient.update({
    where: { id: patientId },
    data: { subscriptionTotalMonths: total },
  });

  // Si hay importe, registrar como ingreso "income_renewal"
  if (amountPaid && Number(amountPaid) > 0) {
    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    await prisma.transaction.create({
      data: {
        type: "income_renewal",
        amount: Number(amountPaid),
        description: `Renovación - ${patient?.fullName ?? ""} (${programType}, ${months}m)`,
        occurredAt: new Date(),
        patientId,
        professionalId: user.id,
      },
    });
  }

  return NextResponse.json({ ok: true, renewalId: renewal.id, status });
}

/**
 * DELETE /api/renewals?id=xxx
 * Borra un periodo (solo se permite si no es el activo y no tiene transacciones asociadas).
 */
export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(user.role === "ceo" || user.role === "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.subscriptionRenewal.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
