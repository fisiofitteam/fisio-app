import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PatientNav } from "@/components/PatientNav";
import { ConsultationCheckoutButton } from "@/components/ConsultationCheckoutButton";
import {
  PREVENTION_CONSULTATION_AMOUNT_CENTS,
  PREVENTION_CONSULTATION_DURATION_MIN,
} from "@/lib/stripe";

export const dynamic = "force-dynamic";

export default async function ConsultaPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { cancelled?: string };
}) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true, fullName: true, programType: true },
  });
  if (!patient) notFound();

  // Solo pacientes Prevention llegan aquí desde el home. Otros programas
  // ya tienen fisio asignado — les redirigimos a su home.
  if (patient.programType !== "PREVENTION") {
    redirect(`/paciente/${patient.id}`);
  }

  const cancelled = searchParams.cancelled === "1";

  return (
    <main className="min-h-screen" style={{ color: "var(--p-text)" }}>
      <div className="relative max-w-md mx-auto px-5 py-7 pb-28">
        <Link
          href={`/paciente/${patient.id}`}
          className="inline-flex items-center gap-1 text-xs mb-4"
          style={{ color: "var(--p-text-faint)" }}
        >
          <ArrowLeft size={12} /> Volver
        </Link>

        <header className="mb-6">
          <div className="text-4xl mb-2">🧑‍⚕️</div>
          <h1 className="text-3xl font-bold mb-2" style={{ letterSpacing: "-0.025em" }}>
            Consulta con un fisio
          </h1>
          <p className="text-sm" style={{ color: "var(--p-text-dim)" }}>
            {PREVENTION_CONSULTATION_DURATION_MIN} minutos por videollamada con Ales, la fundadora de FisioFit Team.
            Para cuando algo te preocupa y quieres una opinión clínica sin comprometerte con un programa.
          </p>
        </header>

        {cancelled && (
          <div
            className="mb-4 rounded-xl px-4 py-3 text-sm"
            style={{
              background: "var(--p-amber-bg)",
              border: "1px solid var(--p-amber-border)",
              color: "var(--p-amber-text)",
            }}
          >
            Has cancelado el proceso. Cuando quieras seguir, pulsa el botón de abajo.
          </div>
        )}

        <section
          className="rounded-2xl p-5 mb-5"
          style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}
        >
          <div className="text-sm font-semibold mb-3">¿Qué incluye?</div>
          <ul
            className="text-sm space-y-2"
            style={{ color: "var(--p-text-dim)" }}
          >
            <li>• Videollamada 1:1 de {PREVENTION_CONSULTATION_DURATION_MIN} min.</li>
            <li>• Repaso del síntoma o duda concreta.</li>
            <li>• Recomendaciones específicas para tu semana Prevention.</li>
            <li>• Si detectamos que necesitas seguimiento, te derivamos.</li>
          </ul>
        </section>

        <section
          className="rounded-2xl p-5 mb-5 text-center"
          style={{
            background: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
            color: "#FFFFFF",
          }}
        >
          <div className="text-[10px] font-bold tracking-wider uppercase opacity-80 mb-2">
            Precio único
          </div>
          <div className="text-5xl font-bold mb-2" style={{ letterSpacing: "-0.03em" }}>
            {(PREVENTION_CONSULTATION_AMOUNT_CENTS / 100).toFixed(0)} €
          </div>
          <div className="text-xs opacity-80 mb-4">Sin renovación, sin compromiso</div>
          <ConsultationCheckoutButton />
        </section>

        <p className="text-[11px] italic" style={{ color: "var(--p-text-faint)" }}>
          Al pagar recibirás un email con el link para agendar tu franja de{" "}
          {PREVENTION_CONSULTATION_DURATION_MIN} min. Si necesitas facturar como profesional,
          respóndenos al email y te la enviamos.
        </p>
      </div>
      <PatientNav patientId={patient.id} active="home" variant="advance" />
    </main>
  );
}
