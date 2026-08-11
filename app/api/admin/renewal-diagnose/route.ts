/**
 * GET /api/admin/renewal-diagnose
 *
 * Diagnóstico general del mes. Solo CEO.
 *
 * Modos:
 *   ?name=Manolo               → un paciente concreto (histórico + attribution)
 *   ?month=2026-08             → todas las renovaciones atribuidas al mes,
 *                                 con desglose por fisio (default: mes actual)
 *   ?month=2026-08&fisio=<id>  → solo del fisio indicado
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HistoryRow = {
  id: string;
  patientId: string;
  startDate: Date | null;
  endDate: Date | null;
  decidedAt: Date;
  amountPaid: number | null;
  status: string;
  isReservation: boolean;
  periodMonths: number;
  programType: string | null;
};

function monthRange(monthStr: string | null): { start: Date; end: Date; label: string } {
  const now = new Date();
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth();
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    y = Number(monthStr.slice(0, 4));
    m = Number(monthStr.slice(5, 7)) - 1;
  }
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 1));
  const label = start.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
  return { start, end, label };
}

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const name = (req.nextUrl.searchParams.get("name") ?? "").trim();
  if (name) return handleByPatient(name);
  return handleByMonth(
    req.nextUrl.searchParams.get("month"),
    req.nextUrl.searchParams.get("fisio"),
  );
}

// ─── MODO POR PACIENTE ────────────────────────────────────────────────────

async function handleByPatient(name: string) {
  const patients = await prisma.patient.findMany({
    where: { fullName: { contains: name, mode: "insensitive" } },
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
    });
    const real = renewals
      .filter((r) => !r.isReservation && r.startDate)
      .sort((a, b) => (a.startDate?.getTime() ?? 0) - (b.startDate?.getTime() ?? 0));

    const attribution: string[] = [];
    for (let i = 1; i < real.length; i++) {
      const follow = real[i];
      const previous = real[i - 1];
      if (!previous.endDate || !follow.startDate) continue;
      const cutoff = previous.endDate.getTime() - 86400000;
      if (follow.startDate.getTime() < cutoff) {
        attribution.push(
          `Renewal ${follow.id.slice(-4)} — hueco grande con previo (${previous.id.slice(-4)}); no cuenta como follow-up directo.`,
        );
        continue;
      }
      const attrDate = follow.decidedAt;
      const label = attrDate.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
      attribution.push(
        `Renewal ${follow.id.slice(-4)} (${follow.programType} ${follow.periodMonths}m, ${follow.amountPaid ?? "?"}€) → cuenta en ${label} ` +
          `(decidedAt=${follow.decidedAt.toISOString().slice(0, 10)}, prev.endDate=${previous.endDate.toISOString().slice(0, 10)})`,
      );
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
        decidedAt: r.decidedAt.toISOString().slice(0, 10),
        notes: r.notes,
      })),
      attribution,
    });
  }
  return NextResponse.json({ found: out.length, patients: out });
}

// ─── MODO POR MES ─────────────────────────────────────────────────────────

async function handleByMonth(monthParam: string | null, fisioFilter: string | null) {
  const { start, end, label } = monthRange(monthParam);

  // Candidatos: renovaciones con decidedAt en el mes O previo con endDate en el mes.
  const [decisionsInMonth, endedInMonth] = await Promise.all([
    prisma.subscriptionRenewal.findMany({
      where: {
        decidedAt: { gte: start, lt: end },
        isReservation: false,
        patient: { isTest: false },
      },
      select: { patientId: true },
    }),
    prisma.subscriptionRenewal.findMany({
      where: {
        endDate: { gte: start, lt: end },
        isReservation: false,
        patient: { isTest: false },
      },
      select: { patientId: true },
    }),
  ]);
  const patientIds = Array.from(new Set([
    ...decisionsInMonth.map((r) => r.patientId),
    ...endedInMonth.map((r) => r.patientId),
  ]));

  if (patientIds.length === 0) {
    return NextResponse.json({ month: label, attributions: [], byFisio: [], totals: { count: 0, revenue: 0 } });
  }

  const [history, patientsInfo] = await Promise.all([
    prisma.subscriptionRenewal.findMany({
      where: { patientId: { in: patientIds } },
      select: {
        id: true,
        patientId: true,
        startDate: true,
        endDate: true,
        decidedAt: true,
        amountPaid: true,
        status: true,
        isReservation: true,
        periodMonths: true,
        programType: true,
      },
    }),
    prisma.patient.findMany({
      where: { id: { in: patientIds } },
      select: {
        id: true,
        fullName: true,
        assignedProfessionalId: true,
        assignedProfessional: { select: { id: true, fullName: true } },
      },
    }),
  ]);
  const patientById = new Map(patientsInfo.map((p) => [p.id, p]));

  const historyByPatient = new Map<string, HistoryRow[]>();
  for (const h of history) {
    if (!historyByPatient.has(h.patientId)) historyByPatient.set(h.patientId, []);
    historyByPatient.get(h.patientId)!.push(h);
  }

  type AttributionOut = {
    patientId: string;
    patientName: string;
    fisioId: string | null;
    fisioName: string | null;
    followUpId: string;
    programType: string | null;
    periodMonths: number;
    amountPaid: number | null;
    followUpDecidedAt: string;
    followUpStartDate: string | null;
    previousId: string;
    previousEndDate: string | null;
    attributionDate: string;
    reason: "anticipada" | "tardía" | "puntual";
  };

  const attributions: AttributionOut[] = [];

  for (const [patientId, list] of historyByPatient) {
    const real = list
      .filter((h) => !h.isReservation && h.startDate)
      .sort((a, b) => (a.startDate?.getTime() ?? 0) - (b.startDate?.getTime() ?? 0));
    for (let i = 1; i < real.length; i++) {
      const follow = real[i];
      const previous = real[i - 1];
      if (!previous.endDate || !follow.startDate) continue;
      const cutoff = previous.endDate.getTime() - 86400000;
      if (follow.startDate.getTime() < cutoff) continue;
      // Regla: atribución al mes de decisión/pago del follow-up.
      const attributionMs = follow.decidedAt.getTime();
      if (attributionMs < start.getTime() || attributionMs >= end.getTime()) continue;

      const p = patientById.get(patientId);
      const fisio = p?.assignedProfessional;
      if (fisioFilter && fisio?.id !== fisioFilter) continue;

      const decidedMs = follow.decidedAt.getTime();
      const endMs = previous.endDate.getTime();
      const reason: AttributionOut["reason"] =
        decidedMs < endMs - 86400000
          ? "anticipada"
          : decidedMs > endMs + 86400000
            ? "tardía"
            : "puntual";

      attributions.push({
        patientId,
        patientName: p?.fullName ?? "?",
        fisioId: fisio?.id ?? null,
        fisioName: fisio?.fullName ?? null,
        followUpId: follow.id,
        programType: follow.programType,
        periodMonths: follow.periodMonths,
        amountPaid: follow.amountPaid,
        followUpDecidedAt: follow.decidedAt.toISOString().slice(0, 10),
        followUpStartDate: follow.startDate?.toISOString().slice(0, 10) ?? null,
        previousId: previous.id,
        previousEndDate: previous.endDate.toISOString().slice(0, 10),
        attributionDate: new Date(attributionMs).toISOString().slice(0, 10),
        reason,
      });
    }
  }

  // Agregado por fisio
  type FisioAgg = { fisioId: string | null; fisioName: string; count: number; revenue: number; patients: string[] };
  const byFisioMap = new Map<string, FisioAgg>();
  for (const a of attributions) {
    const key = a.fisioId ?? "__none__";
    if (!byFisioMap.has(key)) {
      byFisioMap.set(key, {
        fisioId: a.fisioId,
        fisioName: a.fisioName ?? "(sin asignar)",
        count: 0,
        revenue: 0,
        patients: [],
      });
    }
    const agg = byFisioMap.get(key)!;
    agg.count += 1;
    agg.revenue += a.amountPaid ?? 0;
    agg.patients.push(a.patientName);
  }
  const byFisio = Array.from(byFisioMap.values()).sort((a, b) => b.revenue - a.revenue);

  const totals = {
    count: attributions.length,
    revenue: Number(attributions.reduce((s, x) => s + (x.amountPaid ?? 0), 0).toFixed(2)),
  };

  return NextResponse.json({
    month: label,
    totals,
    byFisio,
    attributions: attributions.sort((a, b) => a.attributionDate.localeCompare(b.attributionDate)),
  });
}
