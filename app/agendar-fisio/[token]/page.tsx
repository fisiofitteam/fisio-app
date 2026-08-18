import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BookingCallLandingClient } from "@/components/BookingCallLandingClient";

/**
 * Landing pública de reserva de llamada con el fisio.
 *
 * Cargamos aquí lo mínimo (fisio+paciente+tipo+duración+expiración+status) para
 * pintar el header. Los slots libres se piden desde el cliente vía GET /api/booking/[token]/slots
 * cambiando la ventana según la semana que mire el paciente.
 */
export default async function BookingCallLandingPage({ params }: { params: { token: string } }) {
  const call = await prisma.patientCall.findUnique({
    where: { bookingToken: params.token },
    include: {
      professional: { select: { fullName: true, photoUrl: true } },
      patient: { select: { fullName: true, email: true } },
    },
  });
  if (!call) notFound();

  const status = call.tokenExpiresAt < new Date() ? "expired" : call.status;
  const durationMin = call.durationMin ?? 45;

  return (
    <BookingCallLandingClient
      token={params.token}
      status={status}
      type={call.type as "optimization" | "renewal"}
      durationMin={durationMin}
      fisio={{
        fullName: call.professional.fullName,
        photoUrl: call.professional.photoUrl ?? null,
      }}
      patient={{
        fullName: call.patient.fullName,
        email: call.patient.email ?? null,
      }}
      fisioNote={call.fisioNote ?? null}
      scheduledAt={call.scheduledAt ? call.scheduledAt.toISOString() : null}
      meetingUrl={call.meetingUrl ?? null}
    />
  );
}
