import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getPeriodRange, calculateFinanceSummary, type Period } from "@/lib/finance";
import { FinancePage } from "@/components/FinancePage";

export default async function FinancePageRoute({
  searchParams,
}: {
  searchParams: { period?: string };
}) {
  const user = (await getActiveProfessional())!;
  if (user.role !== "ceo") redirect("/fisio");

  const period: Period = (["month", "quarter", "year"].includes(searchParams.period ?? "")
    ? (searchParams.period as Period)
    : "month");
  const { start, end, label } = getPeriodRange(period);

  const summary = await calculateFinanceSummary(start, end);

  const transactions = await prisma.transaction.findMany({
    where: { occurredAt: { gte: start, lte: end } },
    include: {
      professional: { select: { id: true, fullName: true, role: true } },
      patient: { select: { id: true, fullName: true } },
    },
    orderBy: { occurredAt: "desc" },
    take: 30,
  });

  const autoRenewals = await prisma.subscriptionRenewal.findMany({
    where: {
      decidedAt: { gte: start, lte: end },
      outcome: "renewed",
      amountPaid: { not: null },
    },
    include: {
      patient: {
        include: {
          assignedProfessional: { select: { id: true, fullName: true, role: true } },
        },
      },
    },
    orderBy: { decidedAt: "desc" },
  });

  const professionals = await prisma.professional.findMany({ orderBy: { fullName: "asc" } });
  const patients = await prisma.patient.findMany({ orderBy: { fullName: "asc" } });

  // === Datos para el gráfico anual ===
  // Todas las transacciones del año actual + renovaciones automáticas del año
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);

  const yearTransactions = await prisma.transaction.findMany({
    where: { occurredAt: { gte: yearStart, lte: yearEnd } },
    select: { type: true, category: true, amount: true, occurredAt: true },
  });

  const yearAutoRenewals = await prisma.subscriptionRenewal.findMany({
    where: {
      decidedAt: { gte: yearStart, lte: yearEnd },
      outcome: "renewed",
      amountPaid: { not: null },
    },
    select: { amountPaid: true, decidedAt: true },
  });

  return (
    <FinancePage
      year={now.getFullYear()}
      period={period}
      periodLabel={label}
      summary={summary}
      transactions={transactions.map((t) => ({
        id: t.id,
        type: t.type,
        category: t.category,
        amount: t.amount,
        description: t.description,
        occurredAt: t.occurredAt.toISOString(),
        professional: t.professional ? { id: t.professional.id, fullName: t.professional.fullName, role: t.professional.role } : null,
        patient: t.patient ? { id: t.patient.id, fullName: t.patient.fullName } : null,
        source: "manual" as const,
      }))}
      autoRenewals={autoRenewals.map((r) => ({
        id: `auto-${r.id}`,
        type: "income_renewal" as const,
        category: null,
        amount: r.amountPaid ?? 0,
        description: r.notes ?? "Renovación automática (cuadrada con suscripción)",
        occurredAt: r.decidedAt.toISOString(),
        professional: r.patient.assignedProfessional ? { id: r.patient.assignedProfessional.id, fullName: r.patient.assignedProfessional.fullName, role: r.patient.assignedProfessional.role } : null,
        patient: { id: r.patient.id, fullName: r.patient.fullName },
        source: "auto" as const,
      }))}
      yearTransactions={yearTransactions.map((t) => ({
        type: t.type,
        category: t.category,
        amount: t.amount,
        occurredAt: t.occurredAt.toISOString(),
      }))}
      yearAutoRenewals={yearAutoRenewals.map((r) => ({
        amount: r.amountPaid ?? 0,
        occurredAt: r.decidedAt.toISOString(),
      }))}
      professionals={professionals.map((p) => ({ id: p.id, fullName: p.fullName, role: p.role }))}
      patients={patients.map((p) => ({ id: p.id, fullName: p.fullName }))}
    />
  );
}
