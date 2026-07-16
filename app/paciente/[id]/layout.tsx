// Layout común para todas las páginas del paciente.
// Además del envoltorio visual (PatientShell), aplica el GATE de onboarding: si
// el paciente no ha completado anamnesis + contrato, se le redirige al onboarding
// y no puede usar la app hasta terminarlo. (El onboarding vive en
// /paciente/onboarding, fuera de este layout, para evitar bucles de redirección.)
//
// EXCEPCIÓN: los pacientes de FisioFit Prevention nunca pasan por
// onboarding — no tienen fisio asignado ni programa 1:1, no hay
// anamnesis ni contrato que firmar. El gate los deja pasar directamente.
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PatientShell } from "@/components/PatientShell";
import { needsOnboarding } from "@/lib/onboarding-content";
import { getPatientThemeFromCookie } from "@/lib/theme";
import { getPauseSnapshot } from "@/lib/program-pauses";
import { ActivePauseBanner } from "@/components/ActivePauseBanner";

export default async function PatientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { onboardingTasks: true, programType: true },
  });

  if (
    patient &&
    patient.programType !== "PREVENTION" &&
    needsOnboarding(patient.onboardingTasks)
  ) {
    redirect("/paciente/onboarding");
  }

  // Aviso persistente si hay una pausa activa. NO bloquea el acceso — el
  // paciente sigue viendo la app normal para poder hacer el trabajo
  // sustitutivo que le dejemos durante la pausa (vacaciones activas,
  // adaptaciones por lesión, etc). Antes redirigíamos a una pantalla
  // dedicada de pausa y la queja era "no puedo hacer nada".
  const pauseSnapshot = patient ? await getPauseSnapshot(params.id).catch(() => null) : null;
  const activePause = pauseSnapshot?.activePause ?? null;

  return (
    <PatientShell theme={getPatientThemeFromCookie()}>
      {activePause && (
        <ActivePauseBanner
          startDate={activePause.startDate.toISOString()}
          endDate={activePause.endDate.toISOString()}
          daysExtended={activePause.daysExtended}
        />
      )}
      {children}
    </PatientShell>
  );
}
