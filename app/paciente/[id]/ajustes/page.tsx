import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientNav } from "@/components/PatientNav";
import { PatientThemeToggle } from "@/components/PatientThemeToggle";
import { PatientLogoutButton } from "@/components/PatientLogoutButton";

export const dynamic = "force-dynamic";

export default async function PatientSettingsPage({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({ where: { id: params.id }, select: { id: true, fullName: true } });
  if (!patient) notFound();

  return (
    <main className="min-h-screen" style={{ color: "var(--p-text)" }}>
      <div className="relative max-w-md mx-auto px-5 py-7 pb-28">
        <header className="mb-6">
          <Link href={`/paciente/${patient.id}`} className="text-xs">← Inicio</Link>
          <h1 className="text-2xl font-bold mt-1" style={{ letterSpacing: "-0.025em" }}>Ajustes</h1>
        </header>

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

      <PatientNav patientId={patient.id} active="ajustes" />
    </main>
  );
}
