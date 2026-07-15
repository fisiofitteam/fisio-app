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

  // ¿Puede el usuario editar/eliminar periodos de suscripción?
  //  - CEO y head_success: siempre.
  //  - Fisio: solo si el paciente NO tiene ningún Sale Stripe. Es decir,
  //    fue dado de alta manualmente (alta directa o legacy). Los que
  //    pagaron por Stripe se gestionan vía renovación con link de pago.
  const canEditSubscription =
    user.isManager || (user.role === "fisio" && !sale);

  // Histórico de transactions del paciente
  const transactions = await prisma.transaction.findMany({
    where: { patientId: patient.id },
    orderBy: { occurredAt: "desc" },
    include: { professional: { select: { id: true, fullName: true } } },
  });

  // Métricas (solo se muestran al CEO en SubscriptionView, las calculamos siempre por simplicidad)
  const renewals = await prisma.subscriptionRenewal.findMany({
    where: { patientId: patient.id },
    select: { periodMonths: true, amountPaid: true, startDate: true, endDate: true },
  });

  // Meses reales por renewal calculados desde startDate → endDate (no desde
  // el campo periodMonths guardado, que en pacientes migrados diverge).
  function monthsBetween(s: Date | null, e: Date | null): number {
    if (!s || !e) return 0;
    let m = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
    if (e.getDate() < s.getDate()) m -= 1;
    return Math.max(0, m);
  }

  // Periodo VIGENTE: preferimos el renewal con status="active"; si no hay,
  // el último renewal por startDate. Es la fuente de verdad ÚNICA para el
  // bloque "Programa actual" — antes teníamos duración/inicio/fin del
  // Patient (legacy) mientras que abajo se mostraban los renewals: dos
  // verdades distintas que no coincidían y confundían al fisio.
  const currentRenewal =
    (await prisma.subscriptionRenewal.findFirst({
      where: { patientId: patient.id, status: "active" },
      orderBy: { startDate: "desc" },
      select: { startDate: true, endDate: true, periodMonths: true, programType: true },
    })) ||
    (await prisma.subscriptionRenewal.findFirst({
      where: { patientId: patient.id },
      orderBy: { startDate: "desc" },
      select: { startDate: true, endDate: true, periodMonths: true, programType: true },
    }));

  // Pausas activas o programadas: sumamos sus daysExtended a programEndDate
  // para mostrar la fecha de fin REAL (la BD no la actualiza al crear pausas)
  const activePauses = await prisma.programPause.findMany({
    where: {
      patientId: patient.id,
      status: { in: ["scheduled", "active", "ended"] }, // todo lo que ya extiende o extenderá
    },
    select: { daysExtended: true },
  });
  const totalDaysExtended = activePauses.reduce((acc, p) => acc + (p.daysExtended || 0), 0);
  const incomeTransactions = transactions.filter((t) => t.type.startsWith("income"));
  const metrics = {
    totalMonths: renewals.reduce((acc, r) => acc + monthsBetween(r.startDate, r.endDate), 0),
    lifetimeValue: incomeTransactions.reduce((acc, t) => acc + t.amount, 0),
    renewalsCount: Math.max(0, renewals.length - 1),
  };

  return (
    <SubscriptionView
      isCeo={user.role === "ceo"}
      metrics={metrics}
      totalDaysExtended={totalDaysExtended}
      isManager={user.isManager}
      canEditSubscription={canEditSubscription}
      currentPeriod={currentRenewal && currentRenewal.startDate ? {
        startDate: currentRenewal.startDate.toISOString(),
        endDate: currentRenewal.endDate?.toISOString() ?? null,
        periodMonths: currentRenewal.periodMonths,
        programType: currentRenewal.programType ?? patient.programType ?? "—",
      } : null}
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
