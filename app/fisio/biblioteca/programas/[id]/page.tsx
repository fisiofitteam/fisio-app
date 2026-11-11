import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PILOT_PROGRAM_ID } from "@/lib/shoulder-pilot";
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

      {program.id === PILOT_PROGRAM_ID && (
        <div className="my-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div><strong>Perfil de hombro</strong><p className="text-sm text-neutral-600">Valoración inicial y retest: cuatro bloques, quince pruebas y un solo perfil por atleta.</p></div>
          <Link href={`/fisio/biblioteca/programas/${program.id}/baremo`} className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white">Ver baremo</Link>
        </div>
      )}
      <ProgramEditor program={JSON.parse(JSON.stringify(program))} />
    </main>
  );
}
