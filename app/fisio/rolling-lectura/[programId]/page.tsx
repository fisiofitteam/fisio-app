import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { weekStartDate } from "@/lib/program-pauses";
import { RollingReadOnlyList } from "@/components/RollingReadOnlyList";

export const dynamic = "force-dynamic";

/**
 * /fisio/rolling-lectura/[programId]
 * Muestra 2 semanas del rolling (actual + siguiente) para lectura.
 */
export default async function RollingLecturaDetailPage({ params }: { params: { programId: string } }) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  const allowed = user.role === "ceo" || user.role === "head_success" || user.role === "fisio";
  if (!allowed) redirect("/fisio");

  const today = new Date();
  const thisMonday = weekStartDate(today);
  const nextMonday = new Date(thisMonday);
  nextMonday.setDate(nextMonday.getDate() + 7);

  const program = await prisma.rollingProgram.findUnique({
    where: { id: params.programId },
    include: {
      weeks: {
        where: { weekStartDate: { in: [thisMonday, nextMonday] } },
        orderBy: { weekStartDate: "asc" },
        include: {
          days: {
            orderBy: { dayOfWeek: "asc" },
            include: {
              tasks: {
                orderBy: { order: "asc" },
                select: { id: true, type: true, title: true, bodyText: true, videoId: true, order: true },
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
      <header className="mb-4">
        <Link href="/fisio/rolling-lectura" className="text-xs text-neutral-500 hover:underline">← Volver</Link>
        <h1 className="text-xl font-semibold mt-1">{program.name}</h1>
        {program.description && <p className="text-xs text-neutral-500 mt-0.5">{program.description}</p>}
        <p className="text-[10px] text-neutral-400 mt-1">Modo lectura · para modificar la sesión de un atleta concreto, entra en su ficha.</p>
      </header>

      <RollingReadOnlyList
        weeks={program.weeks.map((w) => ({
          id: w.id,
          weekStartDate: w.weekStartDate.toISOString(),
          title: w.title,
          publishedAt: w.publishedAt?.toISOString() ?? null,
          days: w.days.map((d) => ({
            dayOfWeek: d.dayOfWeek,
            tasks: d.tasks,
          })),
        }))}
      />
    </main>
  );
}
