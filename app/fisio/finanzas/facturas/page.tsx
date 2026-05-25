import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { computeMonthlySalary } from "@/lib/compensation";
import { PayrollView } from "@/components/PayrollView";

export const dynamic = "force-dynamic";

export default async function FacturasEquipoPage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string };
}) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") redirect("/fisio");

  const now = new Date();
  const year = Number(searchParams.year) || now.getUTCFullYear();
  const month = searchParams.month != null && searchParams.month !== "" ? Number(searchParams.month) : now.getUTCMonth();

  const pros = await prisma.professional.findMany({
    where: { active: true, compensation: { isNot: null } },
    select: { id: true, fullName: true, role: true },
    orderBy: { fullName: "asc" },
  });
  const ids = pros.map((p) => p.id);
  const payments = await prisma.payrollPayment.findMany({ where: { year, month, professionalId: { in: ids } } });
  const paidSet = new Set(payments.map((p) => p.professionalId));

  const rows = await Promise.all(
    pros.map(async (p) => {
      const s = await computeMonthlySalary(p.id, year, month);
      return { id: p.id, fullName: p.fullName, role: p.role, total: s.total, paid: paidSet.has(p.id) };
    })
  );

  return <PayrollView year={year} month={month} rows={rows} />;
}
