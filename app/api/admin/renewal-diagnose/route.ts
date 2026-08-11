/**
 * GET /api/admin/renewal-diagnose?name=Manolo
 *
 * Diagnóstico: para un paciente (búsqueda por parte del nombre) devuelve
 * su histórico de SubscriptionRenewal + explica por cada mes reciente si
 * cuenta como renovación según computeMonthlySalary. Solo CEO.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const name = (req.nextUrl.searchParams.get("name") ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "?name= requerido" }, { status: 400 });
  }

  const patients = await prisma.patient.findMany({
    where: {
      fullName: { contains: name, mode: "insensitive" },
    },
    select: {
      id: true,
      fullName: true,
      assignedProfessionalId: true,
      assignedProfessional: { select: { fullName: true } },
      isTest: true,
    },
    take: 20,
  });

  const out: any[] = [];
  for (const p of patients) {
    const renewals = await prisma.subscriptionRenewal.findMany({
      where: { patientId: p.id },
      orderBy: [{ startDate: "asc" }, { decidedAt: "asc" }],
      select: {
        id: true,
        programType: true,
        periodMonths: true,
        startDate: true,
        endDate: true,
        status: true,
        amountPaid: true,
        isReservation: true,
        reservationConsumedAt: true,
        decidedAt: true,
        notes: true,
      },
    });

    // Explicar en qué mes cuenta cada renewal según la lógica actual
    const attribution: string[] = [];
    for (const r of renewals) {
      if (r.isReservation) continue;
      // Un renewal cuenta si es follow-up de un previo cuyo endDate cae en el mes
      // buscado. Encontramos el "previo" = renewal con startDate <= (r.startDate - 1d)
      // más reciente, no reserva.
      const cutoff = r.startDate ? new Date(r.startDate.getTime() - 86400000) : null;
      const prev = cutoff
        ? renewals
            .filter((h) => h.id !== r.id && !h.isReservation && h.endDate && h.endDate.getTime() <= (r.startDate?.getTime() ?? 0) + 86400000)
            .sort((a, b) => (b.endDate?.getTime() ?? 0) - (a.endDate?.getTime() ?? 0))[0]
        : null;
      if (prev && prev.endDate) {
        const m = prev.endDate.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
        attribution.push(
          `Renewal ${r.id.slice(-4)} (${r.programType} ${r.periodMonths}m, ${r.amountPaid ?? "?"}€) → cuenta en ${m} como follow-up del previo ${prev.id.slice(-4)} (endDate ${prev.endDate.toISOString().slice(0, 10)}, status=${prev.status})`,
        );
      } else {
        attribution.push(
          `Renewal ${r.id.slice(-4)} (${r.programType} ${r.periodMonths}m, ${r.amountPaid ?? "?"}€) — sin previo detectado; probable ALTA INICIAL (no cuenta como renovación).`,
        );
      }
    }

    out.push({
      patient: {
        id: p.id,
        name: p.fullName,
        assignedFisio: p.assignedProfessional?.fullName ?? null,
        isTest: p.isTest,
      },
      renewals: renewals.map((r) => ({
        id: r.id,
        programType: r.programType,
        periodMonths: r.periodMonths,
        startDate: r.startDate?.toISOString().slice(0, 10) ?? null,
        endDate: r.endDate?.toISOString().slice(0, 10) ?? null,
        status: r.status,
        amountPaid: r.amountPaid,
        isReservation: r.isReservation,
        reservationConsumedAt: r.reservationConsumedAt?.toISOString().slice(0, 10) ?? null,
        decidedAt: r.decidedAt.toISOString().slice(0, 10),
        notes: r.notes,
      })),
      attribution,
    });
  }

  return NextResponse.json({ found: out.length, patients: out });
}
