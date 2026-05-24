import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ClinicalSessionsView } from "@/components/ClinicalSessionsView";

export const dynamic = "force-dynamic";

export default async function ReunionesPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");

  const [cases, team] = await Promise.all([
    prisma.clinicalSessionCase.findMany({ orderBy: { updatedAt: "desc" } }),
    prisma.professional.findMany({
      where: { active: true, role: { in: ["ceo", "head_success", "fisio"] } },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  return (
    <ClinicalSessionsView
      currentUserId={user.id}
      team={team}
      initialCases={cases.map((c) => ({
        id: c.id,
        patientName: c.patientName,
        assignedToId: c.assignedToId,
        status: c.status,
        bodyZone: c.bodyZone,
        situation: c.situation,
        proposedSolutions: c.proposedSolutions,
        consensusSolution: c.consensusSolution,
      }))}
    />
  );
}
