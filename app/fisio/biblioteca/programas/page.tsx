import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ProgramsByZone } from "@/components/ProgramsByZone";
import { ProgramsSubnav } from "@/components/ProgramsSubnav";

export default async function ProgramsListPage() {
  const programs = await prisma.program.findMany({
    where: { isStandalone: false },
    include: {
      weeks: { select: { days: { select: { _count: { select: { tasks: true } } } } } },
      _count: { select: { assignments: true } },
    },
    orderBy: [{ name: "asc" }],
  });

  const mapped = programs.map((p) => ({
    id: p.id,
    name: p.name,
    bodyZone: p.bodyZone,
    type: p.type,
    level: p.level,
    description: p.description ?? "",
    weeksCount: p.weeksCount,
    totalTasks: p.weeks.reduce((acc, w) => acc + w.days.reduce((a, d) => a + d._count.tasks, 0), 0),
    assignmentsCount: p._count.assignments,
  }));

  return (
    <div>
      <ProgramsSubnav />
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-neutral-500">Plantillas de programa</p>
        <Link href="/fisio/biblioteca/programas/nuevo" className="btn btn-primary text-xs">
          + Nuevo programa
        </Link>
      </div>

      <ProgramsByZone programs={mapped} />
    </div>
  );
}
