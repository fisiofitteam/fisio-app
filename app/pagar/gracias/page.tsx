import { ThankYouClient } from "@/components/ThankYouClient";

export const metadata = {
  title: "¡Gracias! · FisioFit Team",
  description: "Tu pago se ha completado correctamente.",
};

export const dynamic = "force-dynamic";

export default function GraciasPage({
  searchParams,
}: {
  searchParams: { token?: string; session_id?: string };
}) {
  return (
    <ThankYouClient token={searchParams.token || ""} sessionId={searchParams.session_id || ""} />
  );
}
