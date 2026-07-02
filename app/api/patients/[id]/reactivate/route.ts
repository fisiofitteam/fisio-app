/**
 * POST /api/patients/[id]/reactivate
 *
 * Reactiva un paciente que estaba en la pestaña "Terminados". Crea un
 * SubscriptionRenewal nuevo con status="active" empezando hoy con la
 * duración indicada (default 4 meses).
 *
 * Body opcional:
 *   { periodMonths?: number, programType?: string }
 *
 * Solo CEO y head_success — los fisios normales tienen que avisar al
 * manager para reactivar. Es una decisión comercial, no clínica.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo" && user.role !== "head_success") {
    return NextResponse.json(
      { error: "Solo CEO o head success pueden reactivar pacientes. Avisa a alguno." },
      { status: 403 }
    );
  }

  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true, programType: true, subscriptionPeriodMonths: true },
  });
  if (!patient) {
    return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const periodMonths = Number.isFinite(Number(body?.periodMonths)) && Number(body?.periodMonths) > 0
    ? Number(body.periodMonths)
    : (patient.subscriptionPeriodMonths || 4);
  const programType = typeof body?.programType === "string" && body.programType.trim()
    ? body.programType.trim()
    : (patient.programType || "RECUPERA");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  endDate.setMonth(endDate.getMonth() + periodMonths);

  await prisma.$transaction(async (tx) => {
    // Cerrar cualquier active colgado por si acaso (con endDate vencido).
    await tx.subscriptionRenewal.updateMany({
      where: { patientId: patient.id, status: "active" },
      data: { status: "finished" },
    });
    // Nuevo periodo activo desde hoy.
    await tx.subscriptionRenewal.create({
      data: {
        patientId: patient.id,
        programType,
        periodMonths,
        startDate: today,
        endDate,
        status: "active",
        notes: `Reactivación manual (${user.fullName})`,
      },
    });
    // Sincronizamos también los campos denormalizados del Patient para
    // que la lista y la ficha reflejen el nuevo periodo al instante.
    await tx.patient.update({
      where: { id: patient.id },
      data: {
        programType,
        subscriptionStartDate: today,
        subscriptionPeriodMonths: periodMonths,
        programStartDate: today,
        programEndDate: endDate,
        programDurationMonths: periodMonths,
      },
    });
  });

  return NextResponse.json({
    ok: true,
    patientId: patient.id,
    periodMonths,
    programType,
    endDate: endDate.toISOString(),
  });
}
