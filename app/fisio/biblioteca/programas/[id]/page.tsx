import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProgramEditor } from "@/components/ProgramEditor";
import { ProgramHeaderEditable } from "@/components/ProgramHeaderEditable";

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
      <Link href="/fisio/biblioteca/programas" className="text-xs text-neutral-500">← Programas</Link>
      <ProgramHeaderEditable
        program={{
          id: program.id,
          name: program.name,
          bodyZone: program.bodyZone,
          weeksCount: program.weeksCount,
          description: program.description ?? null,
        }}
      />

      <ProgramEditor program={JSON.parse(JSON.stringify(program))} />
    </main>
  );
}
