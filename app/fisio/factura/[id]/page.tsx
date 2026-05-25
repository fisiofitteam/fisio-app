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

  const fiscalSelect = { fullName: true, email: true, fiscalName: true, taxId: true, fiscalAddress: true, iban: true, vatExempt: true } as const;

  const pro = await prisma.professional.findUnique({ where: { id: params.id }, select: fiscalSelect });
  if (!pro) notFound();

  // Receptor de la factura = el CEO (a su nombre, no a "FisioFit")
  const ceo = await prisma.professional.findFirst({ where: { role: "ceo" }, select: fiscalSelect });

  const now = new Date();
  const year = Number(searchParams.year) || now.getUTCFullYear();
  const month = searchParams.month != null && searchParams.month !== "" ? Number(searchParams.month) : now.getUTCMonth();

  const salary = await computeMonthlySalary(params.id, year, month);

  return (
    <InvoiceClient
      emisor={{
        name: pro.fiscalName || pro.fullName,
        taxId: pro.taxId,
        address: pro.fiscalAddress,
        iban: pro.iban,
        email: pro.email,
      }}
      receptor={{
        name: ceo?.fiscalName || ceo?.fullName || "FisioFit Team",
        taxId: ceo?.taxId ?? null,
        address: ceo?.fiscalAddress ?? null,
      }}
      vatExempt={pro.vatExempt}
      year={year}
      month={month}
      salary={JSON.parse(JSON.stringify(salary))}
    />
  );
}
