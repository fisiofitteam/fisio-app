import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { computeMonthlySalary } from "@/lib/compensation";
import { InvoiceClient } from "@/components/InvoiceClient";

export const dynamic = "force-dynamic";

export default async function FacturaPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { year?: string; month?: string };
}) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  // Solo el CEO o el propio profesional pueden ver su factura
  if (user.role !== "ceo" && user.id !== params.id) redirect("/fisio");

  const pro = await prisma.professional.findUnique({
    where: { id: params.id },
    select: { fullName: true, email: true },
  });
  if (!pro) notFound();

  const now = new Date();
  const year = Number(searchParams.year) || now.getUTCFullYear();
  const month = searchParams.month != null && searchParams.month !== "" ? Number(searchParams.month) : now.getUTCMonth();

  const salary = await computeMonthlySalary(params.id, year, month);

  return (
    <InvoiceClient
      pro={{ fullName: pro.fullName, email: pro.email }}
      year={year}
      month={month}
      salary={JSON.parse(JSON.stringify(salary))}
    />
  );
}
