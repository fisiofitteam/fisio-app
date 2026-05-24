import { AgendaGracias } from "@/components/AgendaGracias";
import { getAgendaGraciasCopy } from "@/lib/landing-config";

export const metadata = {
  title: "Reserva confirmada · FisioFit Team",
  description: "Tu videoconsulta está reservada. Mira este vídeo antes de la llamada.",
};

export const dynamic = "force-dynamic";

export default async function GraciasPage({
  searchParams,
}: {
  searchParams: { lead?: string; start?: string; name?: string };
}) {
  const copy = await getAgendaGraciasCopy();
  return (
    <AgendaGracias
      startISO={searchParams.start || null}
      firstName={searchParams.name || null}
      copy={copy}
    />
  );
}
