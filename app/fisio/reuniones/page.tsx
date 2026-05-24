import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ClinicalSessionsView } from "@/components/ClinicalSessionsView";

export const dynamic = "force-dynamic";

export default async function ReunionesPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");

  const [cases, patients, professionals] = await Promise.all([
    prisma.clinicalSessionCase.findMany({
      orderBy: { updatedAt: "desc" },
      include: { patient: { select: { fullName: true, assignedProfessionalId: true, bodyZone: true } } },
    }),
    prisma.patient.findMany({
      select: { id: true, fullName: true, assignedProfessionalId: true, bodyZone: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.professional.findMany({
      where: { active: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  return (
    <ClinicalSessionsView
      currentUserId={user.id}
      isCeo={user.role === "ceo"}
      professionals={professionals}
      patients={patients.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        assignedToId: p.assignedProfessionalId,
        bodyZone: p.bodyZone,
      }))}
      initialCases={cases.map((c) => ({
        id: c.id,
        patientId: c.patientId,
        patientName: c.patient.fullName,
        assignedToId: c.patient.assignedProfessionalId,
        bodyZone: c.patient.bodyZone,
        status: c.status,
        situation: c.situation,
        proposedSolutions: c.proposedSolutions,
        consensusSolution: c.consensusSolution,
      }))}
    />
  );
}
