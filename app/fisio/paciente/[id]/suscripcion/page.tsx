import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { SubscriptionView } from "@/components/SubscriptionView";

export const dynamic = "force-dynamic";

export default async function PatientSuscripcionTab({ params }: { params: { id: string } }) {
  const user = (await getActiveProfessional())!;

  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      fullName: true,
      programType: true,
      programMode: true,
      subscriptionStartDate: true,
      subscriptionPeriodMonths: true,
      subscriptionTotalMonths: true,
      programDurationMonths: true,
      programStartDate: true,
      programEndDate: true,
    },
  });
  if (!patient) notFound();

  // Buscar el Sale (compra de Stripe) más reciente vinculado a este Patient.
  // Puede no existir si el paciente fue creado manualmente antes de v57.
  const sale = await prisma.sale.findFirst({
    where: { patientId: patient.id },
    orderBy: { paidAt: "desc" },
    include: {
      closer: { select: { id: true, fullName: true, role: true } },
      lead: { select: { id: true, fullName: true } },
    },
  });

  // Histórico de transactions del paciente
  const transactions = await prisma.transaction.findMany({
    where: { patientId: patient.id },
    orderBy: { occurredAt: "desc" },
    include: { professional: { select: { id: true, fullName: true } } },
  });

  // Métricas (solo se muestran al CEO en SubscriptionView, las calculamos siempre por simplicidad)
  const renewals = await prisma.subscriptionRenewal.findMany({
    where: { patientId: patient.id },
    select: { periodMonths: true, amountPaid: true },
  });
  const incomeTransactions = transactions.filter((t) => t.type.startsWith("income"));
  const metrics = {
    totalMonths: renewals.reduce((acc, r) => acc + (r.periodMonths || 0), 0),
    lifetimeValue: incomeTransactions.reduce((acc, t) => acc + t.amount, 0),
    renewalsCount: Math.max(0, renewals.length - 1),
  };

  return (
    <SubscriptionView
      isCeo={user.role === "ceo"}
      metrics={metrics}
      isManager={user.isManager}
      patient={{
        id: patient.id,
        fullName: patient.fullName,
        programType: patient.programType,
        programMode: patient.programMode,
        subscriptionStartDate: patient.subscriptionStartDate?.toISOString() ?? null,
        subscriptionPeriodMonths: patient.subscriptionPeriodMonths,
        subscriptionTotalMonths: patient.subscriptionTotalMonths,
        programDurationMonths: patient.programDurationMonths,
        programStartDate: patient.programStartDate?.toISOString() ?? null,
        programEndDate: patient.programEndDate?.toISOString() ?? null,
      }}
      sale={
        sale
          ? {
              id: sale.id,
              productCode: sale.productCode,
              programType: sale.programType,
              durationMonths: sale.durationMonths,
              amountCents: sale.amountCents,
              currency: sale.currency,
              paymentMethod: sale.paymentMethod,
              status: sale.status,
              paidAt: sale.paidAt?.toISOString() ?? null,
              stripePaymentIntentId: sale.stripePaymentIntentId,
              closer: sale.closer ? { id: sale.closer.id, fullName: sale.closer.fullName, role: sale.closer.role } : null,
            }
          : null
      }
      transactions={transactions.map((t) => ({
        id: t.id,
        type: t.type,
        category: t.category,
        amount: t.amount,
        description: t.description,
        occurredAt: t.occurredAt.toISOString(),
        professional: t.professional ? { id: t.professional.id, fullName: t.professional.fullName } : null,
      }))}
    />
  );
}
