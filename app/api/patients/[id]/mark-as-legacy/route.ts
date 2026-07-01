/**
 * POST /api/patients/[id]/mark-as-legacy
 *
 * Reclasifica un paciente que se dio de alta por error como "+ Nuevo
 * paciente" (o desde ventas/Stripe) y debería haber entrado como
 * "📥 Paciente existente" (legacy). Efectos:
 *
 *  - giftsAlreadySent = true → NO aparece en el bloque amarillo
 *    "Onboarding · Semana 0", no aparece tampoco en la lista de envíos
 *    pendientes de camiseta/parches.
 *  - onboardingTasks = null → NO le pide anamnesis + contrato al entrar
 *    en la app (el gate lo trata como legacy).
 *  - subscriptionStartDate (opcional): si el body la trae, la
 *    reemplaza. Útil cuando el paciente lleva meses tratándose y
 *    queremos que "Renueva en X d" cuadre con la realidad.
 *  - week0CompletedAt = subscriptionStartDate → refuerza que salga del
 *    bloque amarillo aunque la fecha nueva caiga dentro de los 14 días.
 *
 * Body opcional: { subscriptionStartDate?: "YYYY-MM-DD" }
 *
 * Solo CEO y head_success (los fisios no deberían reclasificar).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo" && user.role !== "head_success") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const newStartRaw = typeof body?.subscriptionStartDate === "string"
    ? body.subscriptionStartDate.trim()
    : "";

  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true, subscriptionStartDate: true, subscriptionPeriodMonths: true },
  });
  if (!patient) return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });

  let newStart: Date | null = null;
  if (newStartRaw) {
    const parsed = new Date(newStartRaw);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
    }
    parsed.setHours(0, 0, 0, 0);
    newStart = parsed;
  }
  const effectiveStart = newStart ?? patient.subscriptionStartDate ?? new Date();

  const months = patient.subscriptionPeriodMonths || 4;
  const newEnd = new Date(effectiveStart);
  newEnd.setMonth(newEnd.getMonth() + months);

  await prisma.$transaction(async (tx) => {
    // 1. Ajustamos el Patient: legacy + fuera del bloque amarillo + fecha
    //    real de inicio si nos la dieron.
    await tx.patient.update({
      where: { id: patient.id },
      data: {
        giftsAlreadySent: true,
        onboardingTasks: undefined, // Prisma-clientside "no cambio" — hacemos raw abajo
        week0CompletedAt: effectiveStart,
        ...(newStart ? {
          subscriptionStartDate: newStart,
          programStartDate: newStart,
          programEndDate: newEnd,
        } : {}),
      },
    });
    // onboardingTasks=null explícito (Prisma "update" con Json no permite
    // pasar null en el mismo objeto que otros campos sin rechazarlo, lo
    // hacemos en una segunda pasada para asegurarnos).
    await tx.patient.update({
      where: { id: patient.id },
      data: { onboardingTasks: Prisma.JsonNull as any },
    });

    // 2. Ajustamos el SubscriptionRenewal activo si nos han dado nueva fecha.
    if (newStart) {
      const activePeriod = await tx.subscriptionRenewal.findFirst({
        where: { patientId: patient.id, status: "active" },
        orderBy: { startDate: "desc" },
      });
      if (activePeriod) {
        await tx.subscriptionRenewal.update({
          where: { id: activePeriod.id },
          data: { startDate: newStart, endDate: newEnd },
        });
      }
    }
  });

  return NextResponse.json({
    ok: true,
    patientId: patient.id,
    newStartDate: newStart?.toISOString() ?? null,
    newEndDate: newStart ? newEnd.toISOString() : null,
  });
}

// Import guard: Prisma.JsonNull vive en @prisma/client — lo importamos
// tarde para no romper builds si el generate se hace en distinto orden.
import { Prisma } from "@prisma/client";
