import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getPeriodRange, summarizeFinanceLedger } from "@/lib/finance";
import { getFinanceLedger } from "@/lib/finance-ledger";
import { paymentDescription } from "@/lib/payment-description";
import { FinancePage } from "@/components/FinancePage";
import { resolveKpiMonth } from "@/lib/kpi-period";
import { KpiPeriodNav } from "@/components/KpiPeriodNav";

export const dynamic = "force-dynamic";

export default async function FinancePageRoute({ searchParams }: {
  searchParams: { period?: string; specificMonth?: string };
}) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") redirect("/fisio");
  const selectedMonth = resolveKpiMonth(searchParams.specificMonth);
  const period: "month" | "quarter" | "year" = ["month", "quarter", "year"].includes(searchParams.period ?? "")
    ? searchParams.period as "month" | "quarter" | "year" : "month";
  const { start, end, label } = period === "month" ? selectedMonth : getPeriodRange(period);
  const year = start.getUTCFullYear();
  const [ledger, transactions, professionals, patients, yearTransactions] = await Promise.all([
    getFinanceLedger(start, end),
    prisma.transaction.findMany({
      where: { occurredAt: { gte: start, lte: end } },
      include: { professional: { select: { id: true, fullName: true, role: true } }, patient: { select: { id: true, fullName: true } } },
      orderBy: { occurredAt: "desc" },
    }),
    prisma.professional.findMany({ select: { id: true, fullName: true, role: true }, orderBy: { fullName: "asc" } }),
    prisma.patient.findMany({ select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    prisma.transaction.findMany({
      where: { occurredAt: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
      select: { type: true, category: true, amount: true, occurredAt: true },
    }),
  ]);
  const patientNames = new Map(patients.map((patient) => [patient.id, patient.fullName]));
  return <>
    <KpiPeriodNav title="Negocio" month={selectedMonth.month} year={year} rangeLabel={period === "month" ? undefined : label} />
    <FinancePage year={year} period={period} periodLabel={label} summary={summarizeFinanceLedger(ledger)}
      transactions={transactions.map((row) => ({
        ...row, occurredAt: row.occurredAt.toISOString(), description: paymentDescription(row.description),
        source: row.id.startsWith("receipt:") || row.description?.includes("[ff-receipt:v1") ? "auto" as const : "manual" as const,
      }))}
      billedEntries={ledger.billedEntries.map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString(), patientName: row.patientId ? patientNames.get(row.patientId) ?? null : null }))}
      autoRenewals={ledger.legacyUnverified.filter((row) => row.issue === "missing-receipt").map((row) => ({
        id: row.id, type: "income_renewal", category: null, amount: row.amount,
        description: row.reason, occurredAt: (row.occurredAt ?? start).toISOString(),
        patient: row.patientId ? { id: row.patientId, fullName: patientNames.get(row.patientId) ?? "Paciente" } : null,
        professional: null, source: "auto" as const,
      }))}
      yearTransactions={yearTransactions.map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString() }))}
      yearAutoRenewals={[]} professionals={professionals} patients={patients} />
  </>;
}
