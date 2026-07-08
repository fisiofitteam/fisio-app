import { PreventionLanding } from "@/components/PreventionLanding";
import { PREVENTION_PLAN_CONFIG, PREVENTION_TRIAL_DAYS } from "@/lib/stripe";
import { getPreventionLandingCopy } from "@/lib/landing-config";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "FisioFit Prevention · Cuídate cada semana",
  description:
    "Suscripción low-ticket para atletas ya sanos que quieren mantenerse. Rolling semanal de movilidad, técnica y activación por menos de 17 €/mes.",
};

export default async function PreventionLandingPage({
  searchParams,
}: {
  searchParams: { cancelled?: string };
}) {
  const cancelled = searchParams.cancelled === "1";

  // Precios expuestos al cliente para que la card pueda pintar el desglose
  // sin necesidad de otra llamada. Los importes vienen del código, los
  // Price IDs de Stripe se resuelven en el server al crear la sesión.
  const plans = (["quarterly", "semiannual", "annual"] as const).map((k) => {
    const cfg = PREVENTION_PLAN_CONFIG[k];
    return {
      key: k,
      label: cfg.label,
      months: cfg.months,
      amountEuros: cfg.amountCents / 100,
      monthlyEffectiveEuros: cfg.monthlyEffectiveCents / 100,
      isHighlighted: cfg.isHighlighted,
    };
  });

  const copy = await getPreventionLandingCopy();

  return (
    <PreventionLanding
      plans={plans}
      trialDays={PREVENTION_TRIAL_DAYS}
      cancelled={cancelled}
      copy={copy}
    />
  );
}
