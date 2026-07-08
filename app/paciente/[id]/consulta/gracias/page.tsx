import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Post-checkout de la consulta puntual (17 €).
 * MVP: mensaje de confirmación + instrucciones. Cuando la CEO nos pase el
 * link de agenda (Cal.com, Google Calendar, etc.), aquí lo pintamos como
 * botón "Reservar tu franja". El webhook ya deja la Transaction registrada.
 */
export default async function ConsultaGraciasPage({
  params,
}: {
  params: { id: string };
}) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true, fullName: true, email: true },
  });
  if (!patient) notFound();

  return (
    <main className="min-h-screen flex items-center justify-center px-5 py-10" style={{ color: "var(--p-text)" }}>
      <div className="max-w-md w-full text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-3xl font-bold mb-2" style={{ letterSpacing: "-0.025em" }}>
          ¡Consulta reservada!
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--p-text-dim)" }}>
          Gracias por confiar. En breve recibirás un email en{" "}
          <strong>{patient.email}</strong> con el link para agendar la
          videollamada en el hueco que mejor te venga.
        </p>
        <Link
          href={`/paciente/${patient.id}`}
          className="inline-flex items-center gap-1 text-sm font-semibold px-5 py-3 rounded-xl"
          style={{
            background: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
            color: "#FFFFFF",
          }}
        >
          <ArrowLeft size={14} /> Volver a mi app
        </Link>
      </div>
    </main>
  );
}
