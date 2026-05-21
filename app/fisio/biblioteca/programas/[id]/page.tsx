import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProgramEditor } from "@/components/ProgramEditor";

export default async function ProgramDetailPage({ params }: { params: { id: string } }) {
  const program = await prisma.program.findUnique({
    where: { id: params.id },
    include: {
      weeks: {
        orderBy: { weekNumber: "asc" },
        include: {
          days: {
            orderBy: { dayOfWeek: "asc" },
            include: {
              tasks: {
                orderBy: { order: "asc" },
                include: {
                  workout: { include: { exercises: { include: { exercise: true }, orderBy: { order: "asc" } } } },
                  video: true,
                  form: true,
                  evolution: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!program) notFound();

  return (
    <main>
      <header className="mb-6">
        <Link href="/fisio/biblioteca/programas" className="text-xs text-neutral-500">← Programas</Link>
        <h1 className="text-xl font-semibold mt-1">{program.name}</h1>
        <p className="text-sm text-neutral-500 flex items-center gap-2 mt-1 flex-wrap">
          <span className="px-2 py-0.5 bg-neutral-100 rounded-full text-xs capitalize">{program.bodyZone}</span>
          <span className="text-xs">{program.type}</span>
          <span className="text-xs">· Nivel {program.level}</span>
          <span className="text-xs">· {program.weeksCount} semanas</span>
        </p>
        {program.description && <p className="text-sm text-neutral-600 mt-2">{program.description}</p>}
      </header>

      <ProgramEditor program={JSON.parse(JSON.stringify(program))} />
    </main>
  );
}
