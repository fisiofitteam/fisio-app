import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { RollingPrograms } from "@/components/RollingPrograms";

// /fisio/advance/rolling — listado de programas rolling.
// Acceso ya está restringido a CEO+head_success por app/fisio/advance/layout.tsx.
export default async function RollingPage() {
  const user = (await getActiveProfessional())!;

  const programs = await prisma.rollingProgram.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { patientsLegacy: true, patientsAccessories: true, patientsTraining: true, weeks: true } },
    },
  });

  return (
    <RollingPrograms
      isManager={user.role === "ceo" || user.role === "head_success"}
      programs={programs.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        isActive: p.isActive,
        patientsCount: p._count.patientsLegacy + p._count.patientsAccessories + p._count.patientsTraining,
        weeksCount: p._count.weeks,
      }))}
    />
  );
}
