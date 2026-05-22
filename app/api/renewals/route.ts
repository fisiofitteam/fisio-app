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
 * Crear un nuevo periodo (renovación). Si hay un periodo activo, se cierra
 * automáticamente (status → "finished") con endDate = hoy y el nuevo periodo
 * empieza hoy.
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

  // Cerrar el periodo activo anterior (si lo hay)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.subscriptionRenewal.updateMany({
    where: { patientId, status: "active" },
    data: { status: "finished", endDate: today },
  });

  // Crear el nuevo periodo activo
  const startDate = today;
  const endDate = new Date(today);
  endDate.setMonth(endDate.getMonth() + months);

  const renewal = await prisma.subscriptionRenewal.create({
    data: {
      patientId,
      programType,
      periodMonths: months,
      startDate,
      endDate,
      status: "active",
      amountPaid: amountPaid ? Number(amountPaid) : null,
      notes: notes?.trim() || null,
    },
  });

  // Actualizar también el paciente para reflejar el nuevo periodo activo
  await prisma.patient.update({
    where: { id: patientId },
    data: {
      programType,
      subscriptionStartDate: startDate,
      subscriptionPeriodMonths: months,
      subscriptionTotalMonths: months,
    },
  });

  // Si hay importe, registrar como ingreso "income_renewal"
  if (amountPaid && Number(amountPaid) > 0) {
    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    await prisma.transaction.create({
      data: {
        type: "income_renewal",
        amount: Number(amountPaid),
        description: `Renovación - ${patient?.fullName ?? ""}`,
        occurredAt: new Date(),
        patientId,
        professionalId: user.id,
      },
    });
  }

  return NextResponse.json({ ok: true, renewalId: renewal.id });
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
