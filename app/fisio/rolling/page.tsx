import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { RollingPrograms } from "@/components/RollingPrograms";

export default async function RollingPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (!(user.role === "ceo" || user.role === "head_success" || user.role === "fisio")) {
    redirect("/fisio");
  }

  const programs = await prisma.rollingProgram.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { patients: true, weeks: true } },
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
        patientsCount: p._count.patients,
        weeksCount: p._count.weeks,
      }))}
    />
  );
}
