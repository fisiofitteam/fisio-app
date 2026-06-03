import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { RescheduleLanding } from "@/components/RescheduleLanding";

export const metadata = {
  title: "Cambia tu cita · FisioFit Team",
  description: "Elige un nuevo hueco para tu videoconsulta.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Landing pública de re-agenda.
 *
 * Resuelve el lead por `rescheduleToken`. Solo permite cambiar la cita si
 * el lead sigue en estado "scheduled" — si la cita ya pasó como won/lost/
 * cancelled/no_show, mostramos un mensaje neutro y pedimos contacto manual.
 *
 * No exponemos email/teléfono del lead — solo el nombre de pila para el saludo.
 */
export default async function RescheduleLandingPage({
  params,
}: {
  params: { token: string };
}) {
  const token = params.token;
  if (!token || token.length < 8) notFound();

  const lead = await prisma.lead.findUnique({
    where: { rescheduleToken: token },
    select: {
      id: true,
      fullName: true,
      status: true,
      callScheduledAt: true,
    },
  });
  if (!lead) notFound();

  return (
    <RescheduleLanding
      token={token}
      firstName={lead.fullName.split(" ")[0]}
      currentSlotISO={lead.callScheduledAt.toISOString()}
      status={lead.status}
    />
  );
}
