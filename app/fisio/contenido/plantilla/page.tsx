import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ContentNav } from "@/components/ContentNav";
import { ContentTemplateEditor } from "@/components/ContentTemplateEditor";

export const dynamic = "force-dynamic";

export default async function ContentTemplatePage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo" && user.role !== "setter") redirect("/fisio");

  const days = await prisma.contentTemplateDay.findMany({
    orderBy: { dayOfWeek: "asc" },
  });

  // Serializar para el cliente
  const serialized = days.map((d) => ({
    id: d.id,
    dayOfWeek: d.dayOfWeek,
    format: d.format,
    goal: d.goal,
    ctaType: d.ctaType,
    defaultDmKeyword: d.defaultDmKeyword,
    blocks: JSON.parse(d.blocks) as Array<{ id: string; label: string; order: number }>,
    storyChecklist: JSON.parse(d.storyChecklist) as string[],
    updatedAt: d.updatedAt.toISOString(),
  }));

  const canEdit = user.role === "ceo";

  return (
    <main>
      <header className="mb-5">
        <h1 className="text-xl font-semibold">Plantilla semanal</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Define el formato y los bloques predefinidos de cada día. Se aplican al crear una semana con la opción "usar plantilla".
        </p>
      </header>

      <ContentNav active="template" />

      <ContentTemplateEditor days={serialized} canEdit={canEdit} />
    </main>
  );
}
