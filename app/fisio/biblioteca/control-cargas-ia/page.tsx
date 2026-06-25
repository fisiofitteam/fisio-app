import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { LoadReviewBriefEditor } from "@/components/LoadReviewBriefEditor";

export const dynamic = "force-dynamic";

export default async function LoadReviewBriefPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (!user.isManager) redirect("/fisio/biblioteca/programas");

  const brief = await prisma.loadReviewBrief.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });

  return (
    <main className="space-y-3">
      <header>
        <h2 className="text-base font-semibold">🧠 Brief de control de cargas (IA)</h2>
        <p className="text-xs text-neutral-500 mt-1">
          Esto es lo que la IA usa cuando le pides "💡 Sugerir control" en la ficha de un paciente.
          La IA NO decide: propone un borrador para que el fisio lo revise y firme. Cuanto más
          concreta sea esta metodología, mejor saldrá la propuesta.
        </p>
      </header>
      <LoadReviewBriefEditor
        initial={{
          methodology: brief.methodology,
          hardRules: brief.hardRules,
          goodExamples: brief.goodExamples,
        }}
      />
    </main>
  );
}
