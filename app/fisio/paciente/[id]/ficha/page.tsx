import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ClinicalFile } from "@/components/ClinicalFile";
import { getActiveProfessional } from "@/lib/session";
import { summarizeBodyZone } from "@/lib/onboarding-content";

export default async function PatientFichaTab({ params }: { params: { id: string } }) {
  const user = (await getActiveProfessional())!;
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    include: { appliedLevel: { include: { profile: true } } },
  });
  if (!patient) notFound();

  // bodyZone (resumen de zona afectada) tiene 2 fuentes:
  //  - patient.bodyZone: cache denormalizado que escribe el endpoint de
  //    onboarding al guardar la anamnesis (POST /api/patient/onboarding).
  //  - patient.anamnesisData: el JSON crudo con bodyZones[]/bodySides[].
  // Históricamente había pacientes que rellenaban la anamnesis pero su
  // bodyZone quedaba vacío (el cache aún no existía cuando enviaron el form,
  // o un fisio editó la anamnesis a mano). Para que la ficha no mienta,
  // recalculamos al vuelo si tenemos los datos en anamnesisData.
  let resolvedBodyZone = patient.bodyZone ?? "";
  if (!resolvedBodyZone && patient.anamnesisData) {
    try {
      const parsed = JSON.parse(patient.anamnesisData);
      const fallback = summarizeBodyZone(parsed);
      if (fallback) resolvedBodyZone = fallback;
    } catch {
      // anamnesisData corrupto: lo ignoramos, mostramos vacío.
    }
  }

  const hasFiscalAddress = !!(
    patient.shippingStreet &&
    patient.shippingNumber &&
    patient.shippingCity &&
    patient.shippingPostalCode
  );

  return (
    <ClinicalFile
      isManager={user.isManager}
      isCeo={user.role === "ceo"}
      patient={{
        id: patient.id,
        fullName: patient.fullName,
        email: patient.email ?? null,
        phone: patient.phone ?? null,
        instagram: patient.instagram ?? null,
        diagnosis: patient.diagnosis ?? "",
        shippingStreet: patient.shippingStreet ?? null,
        shippingNumber: patient.shippingNumber ?? null,
        shippingFloor: patient.shippingFloor ?? null,
        shippingStaircase: patient.shippingStaircase ?? null,
        shippingDoor: patient.shippingDoor ?? null,
        shippingCity: patient.shippingCity ?? null,
        shippingProvince: patient.shippingProvince ?? null,
        shippingPostalCode: patient.shippingPostalCode ?? null,
        shippingPhone: patient.shippingPhone ?? null,
        bodyZone: resolvedBodyZone,
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
        hasTaxId: !!patient.contractDNI,
        hasFiscalAddress,
      }}
    />
  );
}
