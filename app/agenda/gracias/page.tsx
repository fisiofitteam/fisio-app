import { AgendaGracias } from "@/components/AgendaGracias";

export const metadata = {
  title: "Reserva confirmada · FisioFit Team",
  description: "Tu videoconsulta está reservada. Mira este vídeo antes de la llamada.",
};

export default function GraciasPage({
  searchParams,
}: {
  searchParams: { lead?: string; start?: string; name?: string };
}) {
  return (
    <AgendaGracias
      startISO={searchParams.start || null}
      firstName={searchParams.name || null}
    />
  );
}
