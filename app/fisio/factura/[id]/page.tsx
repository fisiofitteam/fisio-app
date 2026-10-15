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

  // IRPF del profesional desde su Compensation. Default 15% si no hay fila
  // o la columna aún no se ha creado. Editable desde el header de la factura.
  let irpfRate = 15;
  try {
    const comp = await (prisma as any).compensation.findUnique({
      where: { professionalId: params.id },
      select: { irpfRate: true },
    });
    if (comp && typeof comp.irpfRate === "number") irpfRate = comp.irpfRate;
  } catch { /* columna aún no existe → 15 por defecto */ }

  // Número de factura correlativo dentro del año fiscal del emisor.
  // Formato "YYYY/NNN" (ej. 2026/003). Si el pago de este mes ya existe
  // como PayrollPayment, su posición en la serie del año es el ordinal.
  // Si aún no se ha emitido, es el siguiente a los ya pagados en meses
  // previos del mismo año — así no hay huecos entre facturas sucesivas.
  const [prevPaidThisYear, currentMonthPayment] = await Promise.all([
    prisma.payrollPayment.count({
      where: { professionalId: params.id, year, month: { lt: month } },
    }),
    prisma.payrollPayment.findUnique({
      where: {
        professionalId_year_month: { professionalId: params.id, year, month },
      },
      select: { id: true },
    }),
  ]);
  const ordinal = currentMonthPayment ? prevPaidThisYear + 1 : prevPaidThisYear + 1;
  const autoInvoiceNumber = `${year}/${String(ordinal).padStart(3, "0")}`;

  // Si el usuario ha editado manualmente el número (TeamInvoiceMeta), ése
  // gana sobre el autocalculado. Envuelto en try/catch por si la migración
  // aún no se ha corrido en Neon — en ese caso usamos el automático.
  let overrideNumber: string | null = null;
  try {
    const meta = await (prisma as any).teamInvoiceMeta.findUnique({
      where: {
        professionalId_year_month: { professionalId: params.id, year, month },
      },
      select: { invoiceNumber: true },
    });
    overrideNumber = meta?.invoiceNumber ?? null;
  } catch { /* tabla aún no creada → cae al automático */ }
  const invoiceNumber = overrideNumber ?? autoInvoiceNumber;

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
      invoiceNumber={invoiceNumber}
      autoInvoiceNumber={autoInvoiceNumber}
      professionalId={params.id}
      irpfRate={irpfRate}
      canEditIrpf={user.role === "ceo" || user.id === params.id}
      salary={JSON.parse(JSON.stringify(salary))}
    />
  );
}
