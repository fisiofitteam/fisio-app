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
      patients: {
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true },
      },
    },
  });
  if (!program) notFound();

  return (
    <RollingProgramDetail
      isManager={user.role === "ceo" || user.role === "head_success"}
      program={{
        id: program.id,
        name: program.name,
        description: program.description,
        isActive: program.isActive,
      }}
      patients={program.patients}
    />
  );
}
