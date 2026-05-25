import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { computeMonthlySalary } from "@/lib/compensation";

// POST /api/payroll — marca la nómina del mes como pagada y crea el gasto. Solo CEO.
// body: { professionalId, year, month }
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const professionalId = String(b?.professionalId || "");
  const year = Number(b?.year);
  const month = Number(b?.month);
  if (!professionalId || !Number.isInteger(year) || !Number.isInteger(month)) {
    return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  }

  const existing = await prisma.payrollPayment.findUnique({
    where: { professionalId_year_month: { professionalId, year, month } },
  });
  if (existing) return NextResponse.json({ ok: true, alreadyPaid: true });

  const pro = await prisma.professional.findUnique({ where: { id: professionalId }, select: { fullName: true } });
  if (!pro) return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });

  const salary = await computeMonthlySalary(professionalId, year, month);
  const monthName = new Date(Date.UTC(year, month, 1)).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
  const occurredAt = new Date(Date.UTC(year, month + 1, 0, 12, 0, 0)); // último día del mes

  const result = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        type: "expense",
        category: "sueldos",
        amount: salary.total,
        description: `Nómina ${monthName} · ${pro.fullName}`,
        occurredAt,
        professionalId,
      },
    });
    const payment = await tx.payrollPayment.create({
      data: { professionalId, year, month, amount: salary.total, transactionId: transaction.id, paidById: user.id },
    });
    return payment;
  });

  return NextResponse.json({ ok: true, paidAt: result.paidAt, amount: result.amount });
}

// DELETE /api/payroll?professionalId=&year=&month= — deshace el pago (borra gasto). Solo CEO.
export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const professionalId = req.nextUrl.searchParams.get("professionalId") || "";
  const year = Number(req.nextUrl.searchParams.get("year"));
  const month = Number(req.nextUrl.searchParams.get("month"));
  if (!professionalId || !Number.isInteger(year) || !Number.isInteger(month)) {
    return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  }

  const payment = await prisma.payrollPayment.findUnique({
    where: { professionalId_year_month: { professionalId, year, month } },
  });
  if (!payment) return NextResponse.json({ ok: true });

  await prisma.$transaction(async (tx) => {
    if (payment.transactionId) await tx.transaction.delete({ where: { id: payment.transactionId } }).catch(() => {});
    await tx.payrollPayment.delete({ where: { id: payment.id } });
  });

  return NextResponse.json({ ok: true });
}
