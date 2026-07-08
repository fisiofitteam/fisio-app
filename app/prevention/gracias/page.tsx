import { PreventionThanks } from "@/components/PreventionThanks";
import { getPreventionLandingCopy } from "@/lib/landing-config";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "¡Bienvenido a Prevention!",
};

export default async function PreventionThanksPage({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  const sessionId = searchParams.session_id ?? null;
  const copy = await getPreventionLandingCopy();
  return (
    <PreventionThanks
      sessionId={sessionId}
      brandName={copy.brandName}
      brandSuffix={copy.brandSuffix}
      brandPrimary={copy.brandPrimary}
      brandPrimaryDark={copy.brandPrimaryDark}
    />
  );
}
