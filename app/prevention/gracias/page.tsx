import { PreventionThanks } from "@/components/PreventionThanks";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "¡Bienvenido a Prevention!",
};

export default function PreventionThanksPage({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  const sessionId = searchParams.session_id ?? null;
  return <PreventionThanks sessionId={sessionId} />;
}
