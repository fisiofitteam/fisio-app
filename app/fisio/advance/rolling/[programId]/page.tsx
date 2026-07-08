import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { RollingProgramDetail } from "@/components/RollingProgramDetail";

export default async function RollingProgramPage({ params }: { params: { programId: string } }) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");

  const program = await prisma.rollingProgram.findUnique({
    where: { id: params.programId },
    include: {
      patientsLegacy: { orderBy: { fullName: "asc" }, select: { id: true, fullName: true } },
      patientsAccessories: { orderBy: { fullName: "asc" }, select: { id: true, fullName: true } },
      patientsTraining: { orderBy: { fullName: "asc" }, select: { id: true, fullName: true } },
    },
  });
  if (!program) notFound();

  // Unir los 3 listados deduplicando por id
  const allPatientsMap = new Map<string, { id: string; fullName: string }>();
  for (const p of [...program.patientsLegacy, ...program.patientsAccessories, ...program.patientsTraining]) {
    allPatientsMap.set(p.id, p);
  }
  const allPatients = Array.from(allPatientsMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));

  return (
    <RollingProgramDetail
      isManager={user.role === "ceo" || user.role === "head_success"}
      program={{
        id: program.id,
        name: program.name,
        description: program.description,
        isActive: program.isActive,
        role: program.role,
      }}
      patients={allPatients}
    />
  );
}
