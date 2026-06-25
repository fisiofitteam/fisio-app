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
          Pega aquí el brief completo que vas a usar como base de la sugerencia IA.
          La IA NO decide: propone un borrador para que el fisio lo revise y firme.
        </p>
      </header>
      <LoadReviewBriefEditor
        initial={{
          methodology: brief.methodology,
          hardRules: brief.hardRules,
          goodExamples: brief.goodExamples,
          briefPdfUrl: brief.briefPdfUrl,
          briefPdfName: brief.briefPdfName,
          briefPdfSize: brief.briefPdfSize,
        }}
      />
    </main>
  );
}
