import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ClinicalFile } from "@/components/ClinicalFile";
import { getActiveProfessional } from "@/lib/session";

export default async function PatientFichaTab({ params }: { params: { id: string } }) {
  const user = (await getActiveProfessional())!;
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    include: { appliedLevel: { include: { profile: true } } },
  });
  if (!patient) notFound();

  return (
    <ClinicalFile
      isManager={user.isManager}
      patient={{
        id: patient.id,
        fullName: patient.fullName,
        sport: patient.sport ?? "",
        diagnosis: patient.diagnosis ?? "",
        bodyZone: patient.bodyZone ?? "",
        appliedProfileName: patient.appliedLevel?.profile.name ?? "",
        appliedLevelName: patient.appliedLevel?.name ?? "",
        subscriptionStartDate: patient.subscriptionStartDate?.toISOString().split("T")[0] ?? "",
        subscriptionPeriodMonths: patient.subscriptionPeriodMonths,
        whatsappGroupUrl: patient.whatsappGroupUrl ?? "",
        programType: patient.programType ?? "",
        difficulty: patient.difficulty ?? "",
        programMode: patient.programMode ?? "fixed",
        rollingProgramId: patient.rollingProgramId ?? null,
        rollingAccessoriesId: patient.rollingAccessoriesId ?? null,
        rollingTrainingId: patient.rollingTrainingId ?? null,
      }}
    />
  );
}
