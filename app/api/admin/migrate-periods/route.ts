/**
 * Endpoint de migración one-shot: crea Periodo 1 retroactivo
 * para todos los pacientes que aún no tienen ningún SubscriptionRenewal.
 *
 * Pensado para correr una sola vez tras el deploy de v44. Es idempotente:
 * si lo ejecutas varias veces no duplica registros (solo procesa pacientes
 * sin renewals).
 *
 * Solo CEO o Head of Success pueden invocarlo.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(user.role === "ceo" || user.role === "head_success")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Pacientes sin renewals
  const candidates = await prisma.patient.findMany({
    include: { renewals: { select: { id: true } } },
  });

  let created = 0;
  const errors: string[] = [];

  for (const p of candidates) {
    if (p.renewals.length > 0) continue;

    try {
      const start = p.subscriptionStartDate || p.startedAt || new Date();
      const months = p.subscriptionPeriodMonths || 4;
      const end = new Date(start);
      end.setMonth(end.getMonth() + months);

      await prisma.subscriptionRenewal.create({
        data: {
          patientId: p.id,
          programType: p.programType || null,
          periodMonths: months,
          startDate: start,
          endDate: end,
          status: "active",
          notes: "Periodo 1 generado automáticamente (migración)",
        },
      });
      created++;
    } catch (e: any) {
      errors.push(`${p.fullName}: ${e.message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    created,
    skipped: candidates.length - created - errors.length,
    errors,
  });
}

// Permitir GET también para invocarlo desde el navegador
export async function GET(req: NextRequest) {
  return POST(req);
}
