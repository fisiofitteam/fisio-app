// Lógica compartida para crear un periodo de suscripción (renovación).
// La usa el webhook de Stripe al confirmarse el pago de una renovación, con la
// misma semántica que el alta manual de /api/renewals (anticipada → scheduled,
// vencida/sin activo → active cerrando el anterior).
import { prisma } from "@/lib/prisma";

export async function applyRenewal(opts: {
  patientId: string;
  programType: string;
  periodMonths: number;
  amountPaid?: number | null;
  professionalId?: string | null;
  notes?: string | null;
}): Promise<{ renewalId: string; status: "active" | "scheduled" }> {
  const { patientId, programType, professionalId } = opts;
  const months = Number(opts.periodMonths) || 4;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activePeriod = await prisma.subscriptionRenewal.findFirst({
    where: { patientId, status: "active" },
    orderBy: { startDate: "desc" },
  });

  let startDate: Date;
  let status: "active" | "scheduled";

  if (activePeriod && activePeriod.endDate && activePeriod.endDate > today) {
    // Renovación anticipada: el nuevo empieza cuando acaba el actual
    startDate = activePeriod.endDate;
    status = "scheduled";
  } else {
    // No hay activo o ya venció: cerramos cualquier "active" colgado y arrancamos hoy
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
      amountPaid: opts.amountPaid != null ? Number(opts.amountPaid) : null,
      notes: opts.notes?.trim() || null,
    },
  });

  // Si el nuevo es ACTIVE, pasa a ser el periodo vigente del paciente
  if (status === "active") {
    await prisma.patient.update({
      where: { id: patientId },
      data: { programType, subscriptionStartDate: startDate, subscriptionPeriodMonths: months },
    });
  }

  // Recalcular total acumulado de meses
  const all = await prisma.subscriptionRenewal.findMany({
    where: { patientId },
    select: { periodMonths: true },
  });
  const total = all.reduce((sum, r) => sum + (r.periodMonths || 0), 0);
  await prisma.patient.update({
    where: { id: patientId },
    data: { subscriptionTotalMonths: total },
  });

  // Ingreso income_renewal si hay importe
  if (opts.amountPaid && Number(opts.amountPaid) > 0) {
    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    await prisma.transaction.create({
      data: {
        type: "income_renewal",
        amount: Number(opts.amountPaid),
        description: `Renovación - ${patient?.fullName ?? ""} (${programType}, ${months}m)`,
        occurredAt: new Date(),
        patientId,
        professionalId: professionalId || null,
      },
    });
  }

  return { renewalId: renewal.id, status };
}
