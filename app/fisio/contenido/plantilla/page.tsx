import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ContentNav } from "@/components/ContentNav";
import { ContentTemplateEditor } from "@/components/ContentTemplateEditor";
import { ScriptTemplatesManager } from "@/components/ScriptTemplatesManager";

export const dynamic = "force-dynamic";

export default async function ContentTemplatePage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo" && user.role !== "setter") redirect("/fisio");

  const [days, scriptTemplates] = await Promise.all([
    prisma.contentTemplateDay.findMany({ orderBy: { dayOfWeek: "asc" } }),
    prisma.scriptTemplate.findMany({ orderBy: [{ format: "asc" }, { name: "asc" }] }),
  ]);

  // Serializar plantilla semanal
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

  // Serializar plantillas de guion
  const serializedScripts = scriptTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    format: t.format,
    blocks: JSON.parse(t.blocks) as Array<{ id: string; label: string; order: number }>,
    description: t.description,
    updatedAt: t.updatedAt.toISOString(),
  }));

  const canEdit = user.role === "ceo";

  return (
    <main>
      <header className="mb-5">
        <h1 className="text-xl font-semibold">Plantillas</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Plantilla semanal de bloques por día y plantillas de guion reutilizables por formato.
        </p>
      </header>

      <ContentNav active="template" />

      <ContentTemplateEditor days={serialized} canEdit={canEdit} />

      <ScriptTemplatesManager initialTemplates={serializedScripts} canEdit={canEdit} />
    </main>
  );
}
