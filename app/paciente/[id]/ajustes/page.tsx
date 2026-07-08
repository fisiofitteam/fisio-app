import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientNav } from "@/components/PatientNav";
import { PatientThemeToggle } from "@/components/PatientThemeToggle";
import { PatientLogoutButton } from "@/components/PatientLogoutButton";
import { PatientPhotoUploader } from "@/components/PatientPhotoUploader";
import { PatientShippingForm } from "@/components/PatientShippingForm";
import { PatientDailyReminderToggle } from "@/components/PatientDailyReminderToggle";

export const dynamic = "force-dynamic";

export default async function PatientSettingsPage({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: {
      id: true, fullName: true, photoUrl: true, programType: true,
      shippingStreet: true, shippingNumber: true, shippingFloor: true,
      shippingStaircase: true, shippingDoor: true, shippingCity: true,
      shippingProvince: true, shippingPostalCode: true, shippingPhone: true,
      dailyReminderEnabled: true,
    },
  });
  if (!patient) notFound();

  const isPrevention = patient.programType === "PREVENTION";

  return (
    <main className="min-h-screen" style={{ color: "var(--p-text)" }}>
      <div className="relative max-w-md mx-auto px-5 py-7 pb-28">
        <header className="mb-6">
          <Link href={`/paciente/${patient.id}`} className="text-xs">← Inicio</Link>
          <h1 className="text-2xl font-bold mt-1" style={{ letterSpacing: "-0.025em" }}>Ajustes</h1>
        </header>

        <section id="foto"
          className="rounded-2xl p-4 mb-3"
          style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📸</span>
            <h2 className="font-semibold text-sm">Foto de perfil</h2>
          </div>
          <PatientPhotoUploader initialUrl={patient.photoUrl} />
        </section>

        {/* Sección de dirección postal — se oculta en Prevention (100% digital,
            sin envíos físicos de merch ni parches). */}
        {!isPrevention && (
          <section id="direccion"
            className="rounded-2xl p-4 mb-3"
            style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">📮</span>
              <h2 className="font-semibold text-sm">Dirección postal</h2>
            </div>
            <p className="text-xs mb-3" style={{ color: "var(--p-text-dim)" }}>
              Datos de contacto postal para que tu ficha esté completa.
            </p>
            <PatientShippingForm initial={{
              shippingStreet: patient.shippingStreet,
              shippingNumber: patient.shippingNumber,
              shippingFloor: patient.shippingFloor,
              shippingStaircase: patient.shippingStaircase,
              shippingDoor: patient.shippingDoor,
              shippingCity: patient.shippingCity,
              shippingProvince: patient.shippingProvince,
              shippingPostalCode: patient.shippingPostalCode,
              shippingPhone: patient.shippingPhone,
            }} />
          </section>
        )}

        <section
          className="rounded-2xl p-4 mb-3"
          style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🔔</span>
            <h2 className="font-semibold text-sm">Notificaciones</h2>
          </div>
          <PatientDailyReminderToggle initial={patient.dailyReminderEnabled} />
        </section>

        <section
          className="rounded-2xl p-4 mb-3"
          style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🎨</span>
            <h2 className="font-semibold text-sm">Apariencia</h2>
          </div>
          <p className="text-xs mb-3" style={{ color: "var(--p-text-dim)" }}>
            Elige cómo quieres ver la app.
          </p>
          <PatientThemeToggle />
        </section>

        <section
          className="rounded-2xl p-4 flex items-center justify-between gap-3"
          style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}
        >
          <div>
            <h2 className="font-semibold text-sm">Sesión</h2>
            <p className="text-xs" style={{ color: "var(--p-text-dim)" }}>{patient.fullName}</p>
          </div>
          <PatientLogoutButton />
        </section>
      </div>

      <PatientNav patientId={patient.id} active="ajustes" variant={isPrevention ? "prevention" : "default"} />
    </main>
  );
}
