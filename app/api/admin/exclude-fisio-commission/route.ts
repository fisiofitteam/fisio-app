/**
 * /api/admin/exclude-fisio-commission
 *
 * Excluye SubscriptionRenewals concretos del cálculo de comisión del fisio
 * (típicamente cuando el CEO ya se lo pagó directamente al fisio y no
 * quiere que vuelva a sumarse en su factura mensual).
 *
 * Estrategia: no borra el registro; solo pone `amountPaid = null` para que
 * `computeMonthlySalary` no sume nada (el count sigue en 0 revenue). Añade
 * a `notes` una marca de trazabilidad.
 *
 * Solo CEO. Dos modos:
 *   GET   ?names=Manolo,Larbi,Elena&month=2026-08
 *     → preview: qué SubscriptionRenewals se afectarían
 *   POST  mismo query
 *     → aplica: pone amountPaid=null + notes
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MARK = " · Comisión ya liquidada directamente por CEO";

function monthRange(monthStr: string | null): { start: Date; end: Date } {
  const now = new Date();
  let y = now.getUTCFullYear();
  let m = now.getUTCMonth();
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    y = Number(monthStr.slice(0, 4));
    m = Number(monthStr.slice(5, 7)) - 1;
  }
  return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 1)) };
}

async function findTargets(names: string[], monthStr: string | null) {
  const { start, end } = monthRange(monthStr);
  const patients = await prisma.patient.findMany({
    where: { OR: names.map((n) => ({ fullName: { contains: n, mode: "insensitive" as const } })) },
    select: {
      id: true,
      fullName: true,
      assignedProfessional: { select: { id: true, fullName: true } },
    },
  });

  const renewals = await prisma.subscriptionRenewal.findMany({
    where: {
      patientId: { in: patients.map((p) => p.id) },
      isReservation: false,
      decidedAt: { gte: start, lt: end },
      amountPaid: { not: null },
    },
    select: {
      id: true,
      patientId: true,
      programType: true,
      periodMonths: true,
      amountPaid: true,
      decidedAt: true,
      notes: true,
    },
  });

  const patientById = new Map(patients.map((p) => [p.id, p]));
  return renewals.map((r) => {
    const p = patientById.get(r.patientId);
    return {
      renewalId: r.id,
      patientId: r.patientId,
      patientName: p?.fullName ?? "?",
      fisioName: p?.assignedProfessional?.fullName ?? "(sin asignar)",
      programType: r.programType,
      periodMonths: r.periodMonths,
      currentAmountPaid: r.amountPaid,
      decidedAt: r.decidedAt.toISOString().slice(0, 10),
      currentNotes: r.notes ?? "",
    };
  });
}

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const namesParam = (req.nextUrl.searchParams.get("names") ?? "").trim();
  if (!namesParam) {
    return NextResponse.json({ error: "?names=Manolo,Larbi,Elena requerido" }, { status: 400 });
  }
  const monthParam = req.nextUrl.searchParams.get("month");
  const apply = req.nextUrl.searchParams.get("apply") === "1";
  const names = namesParam.split(",").map((s) => s.trim()).filter(Boolean);
  const targets = await findTargets(names, monthParam);

  if (!apply) {
    return NextResponse.json({
      mode: "preview",
      total: targets.length,
      totalRevenueRemoved: Number(targets.reduce((s, t) => s + (t.currentAmountPaid ?? 0), 0).toFixed(2)),
      targets,
      hint: "Añade &apply=1 a la URL para aplicar los cambios.",
    });
  }

  const applied: any[] = [];
  for (const t of targets) {
    const newNotes = (t.currentNotes ?? "").includes(MARK)
      ? t.currentNotes
      : (t.currentNotes ?? "").concat(MARK);
    await prisma.subscriptionRenewal.update({
      where: { id: t.renewalId },
      data: { amountPaid: null, notes: newNotes },
    });
    applied.push({ ...t, newAmountPaid: null, newNotes });
  }
  return NextResponse.json({
    mode: "applied",
    total: applied.length,
    totalRevenueRemoved: Number(applied.reduce((s, t) => s + (t.currentAmountPaid ?? 0), 0).toFixed(2)),
    applied,
  });
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const namesParam = (req.nextUrl.searchParams.get("names") ?? "").trim();
  if (!namesParam) {
    return NextResponse.json({ error: "?names=Manolo,Larbi,Elena requerido" }, { status: 400 });
  }
  const monthParam = req.nextUrl.searchParams.get("month");
  const names = namesParam.split(",").map((s) => s.trim()).filter(Boolean);
  const targets = await findTargets(names, monthParam);

  const applied: any[] = [];
  for (const t of targets) {
    const newNotes = (t.currentNotes ?? "").includes(MARK)
      ? t.currentNotes
      : (t.currentNotes ?? "").concat(MARK);
    await prisma.subscriptionRenewal.update({
      where: { id: t.renewalId },
      data: { amountPaid: null, notes: newNotes },
    });
    applied.push({ ...t, newAmountPaid: null, newNotes });
  }

  return NextResponse.json({
    mode: "applied",
    total: applied.length,
    totalRevenueRemoved: Number(applied.reduce((s, t) => s + (t.currentAmountPaid ?? 0), 0).toFixed(2)),
    applied,
  });
}
