import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ContentNav } from "@/components/ContentNav";
import { ScriptTemplatesManager } from "@/components/ScriptTemplatesManager";
import { WeeklyTemplatesManager } from "@/components/WeeklyTemplatesManager";

export const dynamic = "force-dynamic";

export default async function ContentTemplatePage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo" && user.role !== "setter") redirect("/fisio");

  const [scriptTemplates, weeklyTemplates] = await Promise.all([
    prisma.scriptTemplate.findMany({ orderBy: [{ format: "asc" }, { name: "asc" }] }),
    prisma.weeklyTemplate.findMany({ orderBy: { name: "asc" } }),
  ]);

  const serializedScripts = scriptTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    format: t.format,
    blocks: JSON.parse(t.blocks) as Array<{ id: string; label: string; order: number }>,
    description: t.description,
    updatedAt: t.updatedAt.toISOString(),
  }));

  const serializedWeekly = weeklyTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    days: JSON.parse(t.days) as Array<{ dayOfWeek: number; title: string; format: string; goals: string[] }>,
    updatedAt: t.updatedAt.toISOString(),
  }));

  const canEdit = user.role === "ceo";

  return (
    <main>
      <header className="mb-5">
        <h1 className="text-xl font-semibold">Plantillas</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Plantillas semanales para preconfigurar semanas y plantillas de guion para los bloques de cada pieza.
        </p>
      </header>

      <ContentNav active="template" role={user.role} />

      <WeeklyTemplatesManager initialTemplates={serializedWeekly} canEdit={canEdit} />

      <ScriptTemplatesManager initialTemplates={serializedScripts} canEdit={canEdit} />
    </main>
  );
}
