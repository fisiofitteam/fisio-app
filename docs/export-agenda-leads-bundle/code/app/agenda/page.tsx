import { AgendaLanding } from "@/components/AgendaLanding";
import { getAgendaLandingCopy } from "@/lib/landing-config";

export const metadata = {
  title: "Reserva tu llamada · FisioFit Team",
  description:
    "Agenda una videoconsulta gratuita de valoración con el equipo FisioFit. Te ayudamos a entender qué le pasa a tu cuerpo y diseñamos el plan para que vuelvas a entrenar sin dolor.",
};

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const copy = await getAgendaLandingCopy();
  return <AgendaLanding copy={copy} />;
}
