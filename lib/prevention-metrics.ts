/**
 * Métricas del negocio Prevention para el cuadro de mandos.
 *
 * MRR se calcula sobre la tarifa mensual efectiva declarada en
 * PREVENTION_PLAN_CONFIG (87€/3, 119€/6, 199€/12). Los estados que suman
 * son trialing/active/past_due — scheduled aún no factura y canceled/finished
 * ya no.
 */
import { prisma } from "@/lib/prisma";
import { PREVENTION_PLAN_CONFIG, type PreventionPlan } from "@/lib/stripe";

export type PreventionMetrics = {
  mrrCents: number;
  activeCount: number;         // status in (trialing, active, past_due)
  trialingCount: number;       // status = trialing
  scheduledCount: number;      // status = scheduled — pagados pero aún no arrancan
  pastDueCount: number;
  perPlan: { plan: PreventionPlan; count: number; label: string }[];

  newInPeriod: number;
  canceledInPeriod: number;
  trialConversionsInPeriod: { converted: number; startedTrial: number; rate: number | null };
  consultationRevenueCents: number;
  consultationCount: number;
  periodLabel: string;
};

export async function calculatePreventionMetrics(
  periodStart: Date,
  periodEnd: Date,
  periodLabel: string,
): Promise<PreventionMetrics> {
  const [allActive, newInPeriodSubs, canceledInPeriodSubs, consultTxs] = await Promise.all([
    prisma.patientSubscription.findMany({
      where: {
        productType: "prevention",
        status: { in: ["trialing", "active", "past_due", "scheduled"] },
      },
      select: { id: true, plan: true, status: true, trialEndsAt: true, createdAt: true },
    }),
    prisma.patientSubscription.findMany({
      where: {
        productType: "prevention",
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      select: { id: true, plan: true, status: true, trialEndsAt: true },
    }),
    prisma.patientSubscription.findMany({
      where: {
        productType: "prevention",
        canceledAt: { gte: periodStart, lte: periodEnd },
      },
      select: { id: true },
    }),
    prisma.transaction.findMany({
      where: {
        category: "consultation-prevention",
        occurredAt: { gte: periodStart, lte: periodEnd },
      },
      select: { amount: true },
    }),
  ]);

  const revenueEarning = allActive.filter((s) =>
    ["trialing", "active", "past_due"].includes(s.status)
  );

  const mrrCents = revenueEarning.reduce((acc, s) => {
    const cfg = PREVENTION_PLAN_CONFIG[s.plan as PreventionPlan];
    if (!cfg) return acc;
    return acc + cfg.monthlyEffectiveCents;
  }, 0);

  const perPlanMap = new Map<PreventionPlan, number>();
  for (const s of revenueEarning) {
    const plan = s.plan as PreventionPlan;
    if (!PREVENTION_PLAN_CONFIG[plan]) continue;
    perPlanMap.set(plan, (perPlanMap.get(plan) ?? 0) + 1);
  }
  const perPlan = (Object.keys(PREVENTION_PLAN_CONFIG) as PreventionPlan[]).map((plan) => ({
    plan,
    count: perPlanMap.get(plan) ?? 0,
    label: PREVENTION_PLAN_CONFIG[plan].label,
  }));

  // Conversiones trial → active en el periodo. Aproximación: subs creadas
  // antes del final del periodo cuyo trialEndsAt cae dentro del periodo y su
  // status actual es "active" (o "past_due" — pagó al menos una vez).
  const startedTrialInPeriod = newInPeriodSubs.filter((s) => !!s.trialEndsAt);
  const trialingSubsWithEndInPeriod = await prisma.patientSubscription.findMany({
    where: {
      productType: "prevention",
      trialEndsAt: { gte: periodStart, lte: periodEnd },
    },
    select: { id: true, status: true },
  });
  const converted = trialingSubsWithEndInPeriod.filter((s) =>
    s.status === "active" || s.status === "past_due"
  ).length;
  const startedTrial = trialingSubsWithEndInPeriod.length;
  const rate = startedTrial > 0 ? Math.round((converted / startedTrial) * 100) : null;

  const consultationRevenueCents = consultTxs.reduce((acc, t) => acc + Math.round(t.amount * 100), 0);

  return {
    mrrCents,
    activeCount: revenueEarning.length,
    trialingCount: allActive.filter((s) => s.status === "trialing").length,
    scheduledCount: allActive.filter((s) => s.status === "scheduled").length,
    pastDueCount: allActive.filter((s) => s.status === "past_due").length,
    perPlan,
    newInPeriod: newInPeriodSubs.length,
    canceledInPeriod: canceledInPeriodSubs.length,
    trialConversionsInPeriod: { converted, startedTrial, rate },
    consultationRevenueCents,
    consultationCount: consultTxs.length,
    periodLabel,
  };
}
