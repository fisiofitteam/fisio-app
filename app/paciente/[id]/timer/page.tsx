import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { StandaloneTimerScreen } from "@/components/StandaloneTimerScreen";

/**
 * /paciente/[id]/timer
 * Cronometro libre para el atleta — mismo componente que usa dentro de
 * una tarea WORKOUT pero sin taskTitle/taskBody vinculado. Al abrir, el
 * atleta ve el editor de bloques directo (config panel) para armar el
 * timer que quiera y arrancar.
 */
export default async function PatientTimerPage({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true, fullName: true },
  });
  if (!patient) notFound();
  return <StandaloneTimerScreen patientId={patient.id} />;
}
