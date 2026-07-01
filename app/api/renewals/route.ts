import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

/**
 * Regla de edición de periodos de suscripción:
 *  - CEO y head_success: siempre.
 *  - Fisio: solo si el paciente NO vino por Stripe (es decir, no tiene
 *    ningún Sale asociado). Esto cubre los pacientes añadidos manualmente
 *    o como "paciente existente" (legacy).
 *
 * patientId puede ser null si la llamada es ambigua (caso PATCH lo
 * obtiene del renewal). En ese caso resolvemos antes de llamar aquí.
 */
async function canEditPatientSubscription(
  user: { role: string; isManager: boolean },
  patientId: string
): Promise<boolean> {
  if (user.isManager) return true;
  if (user.role !== "fisio") return false;
  const stripeSale = await prisma.sale.findFirst({
    where: { patientId },
    select: { id: true },
  });
  return !stripeSale;
}

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
 *  - Si el cliente pasa `strategy: "replace"`: el periodo activo se ELIMINA
 *    (no se cierra) y el nuevo empieza hoy. Útil cuando el activo fue creado
 *    por error y se quiere "deshacer" para empezar de nuevo.
 *
 * Body: { patientId, programType, periodMonths, amountPaid, notes, strategy? }
 */
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const {
    patientId,
    programType,
    periodMonths,
    amountPaid,
    notes,
    strategy,
    startDate: customStartRaw,
  } = await req.json();

  if (!patientId) return NextResponse.json({ error: "patientId required" }, { status: 400 });
  if (!programType) return NextResponse.json({ error: "programType required" }, { status: 400 });

  const months = Number(periodMonths);
  if (!Number.isFinite(months) || months <= 0) {
    return NextResponse.json({ error: "Duración inválida (meses debe ser > 0)" }, { status: 400 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Buscar periodo activo
  const activePeriod = await prisma.subscriptionRenewal.findFirst({
    where: { patientId, status: "active" },
    orderBy: { startDate: "desc" },
  });

  let startDate: Date;
  let status: "active" | "scheduled";

  // Fecha custom: si el cliente la pasa, la respetamos. Puede ser pasada
  // o futura. Regla:
  //   - futura: dejamos el nuevo como "scheduled". Si hay activo vigente,
  //     no lo tocamos (que termine por su fecha natural).
  //   - hoy o pasada: cerramos cualquier "active" colgado y el nuevo pasa
  //     a "active" desde esa fecha.
  const customStart = customStartRaw ? new Date(customStartRaw) : null;
  if (customStart && !isNaN(customStart.getTime())) {
    customStart.setHours(0, 0, 0, 0);
    if (customStart <= today) {
      await prisma.subscriptionRenewal.updateMany({
        where: { patientId, status: "active" },
        data: { status: "finished", endDate: customStart },
      });
      startDate = customStart;
      status = "active";
    } else {
      startDate = customStart;
      status = "scheduled";
    }
  } else if (strategy === "replace" && activePeriod) {
    // SUSTITUIR: borramos el actual (típicamente porque se creó mal) y empezamos hoy
    await prisma.subscriptionRenewal.delete({ where: { id: activePeriod.id } });
    startDate = today;
    status = "active";
  } else if (activePeriod && activePeriod.endDate && activePeriod.endDate > today) {
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
 * PATCH /api/renewals
 * Editar un periodo existente.
 * Body: { id, programType?, periodMonths?, startDate?, endDate?, amountPaid?, notes?, status? }
 */
export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, programType, periodMonths, startDate, endDate, amountPaid, notes, status } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const current = await prisma.subscriptionRenewal.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = await canEditPatientSubscription(user, current.patientId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Si solo cambian meses sin tocar endDate, recalcular endDate
  let computedEndDate: Date | undefined;
  if (endDate !== undefined) {
    computedEndDate = new Date(endDate);
  } else if (periodMonths !== undefined && current.startDate) {
    const newMonths = Number(periodMonths);
    computedEndDate = new Date(current.startDate);
    computedEndDate.setMonth(computedEndDate.getMonth() + newMonths);
  }

  const updated = await prisma.subscriptionRenewal.update({
    where: { id },
    data: {
      ...(programType !== undefined && { programType: programType || null }),
      ...(periodMonths !== undefined && { periodMonths: Number(periodMonths) }),
      ...(startDate !== undefined && { startDate: new Date(startDate) }),
      ...(computedEndDate && { endDate: computedEndDate }),
      ...(amountPaid !== undefined && { amountPaid: amountPaid ? Number(amountPaid) : null }),
      ...(notes !== undefined && { notes: notes?.trim() || null }),
      ...(status !== undefined && { status }),
    },
  });

  // Recalcular subscriptionTotalMonths y sincronizar paciente
  const all = await prisma.subscriptionRenewal.findMany({
    where: { patientId: current.patientId },
  });
  const total = all.reduce((sum, r) => sum + (r.periodMonths || 0), 0);
  const active = all.find((r) => r.status === "active");
  const dataToUpdate: any = { subscriptionTotalMonths: total };
  if (active && active.programType) {
    dataToUpdate.programType = active.programType;
    if (active.startDate) dataToUpdate.subscriptionStartDate = active.startDate;
    dataToUpdate.subscriptionPeriodMonths = active.periodMonths;
  }
  await prisma.patient.update({
    where: { id: current.patientId },
    data: dataToUpdate,
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/renewals?id=xxx
 * Borra un periodo. Recalcula los totales del paciente.
 */
export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const current = await prisma.subscriptionRenewal.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = await canEditPatientSubscription(user, current.patientId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.subscriptionRenewal.delete({ where: { id } });

  // Recalcular subscriptionTotalMonths del paciente
  const all = await prisma.subscriptionRenewal.findMany({
    where: { patientId: current.patientId },
  });
  const total = all.reduce((sum, r) => sum + (r.periodMonths || 0), 0);
  const active = all.find((r) => r.status === "active");
  const dataToUpdate: any = { subscriptionTotalMonths: total };
  if (active && active.programType) {
    dataToUpdate.programType = active.programType;
    if (active.startDate) dataToUpdate.subscriptionStartDate = active.startDate;
    dataToUpdate.subscriptionPeriodMonths = active.periodMonths;
  }
  await prisma.patient.update({
    where: { id: current.patientId },
    data: dataToUpdate,
  });

  return NextResponse.json({ ok: true });
}
