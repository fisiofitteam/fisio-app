import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { PatientInvoiceClient } from "@/components/PatientInvoiceClient";

export const dynamic = "force-dynamic";

export default async function PatientInvoicePage({ params }: { params: { id: string } }) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo") redirect("/fisio");

  const invoice = await prisma.patientInvoice.findUnique({ where: { id: params.id } });
  if (!invoice) notFound();

  return (
    <PatientInvoiceClient
      invoice={{
        ...invoice,
        issueDate: invoice.issueDate.toISOString(),
        cancelledAt: invoice.cancelledAt?.toISOString() ?? null,
        createdAt: invoice.createdAt.toISOString(),
      }}
    />
  );
}
