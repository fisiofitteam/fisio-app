import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ContentNav } from "@/components/ContentNav";
import { StoryMakerEditor } from "@/components/StoryMaker/StoryMakerEditor";

export const dynamic = "force-dynamic";

export default async function StoryMakerPage() {
  const user = (await getActiveProfessional())!;
  if (user.role !== "ceo" && user.role !== "setter") redirect("/fisio");

  // Plantillas guardadas — pasan al editor para el selector "Cargar plantilla".
  const templates = await prisma.contentStoryTemplate
    .findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, description: true, jsonSlides: true, updatedAt: true },
    })
    .catch(() => []);

  return (
    <main>
      <ContentNav active="story-maker" role={user.role} />
      <StoryMakerEditor
        initialTemplates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          slides: JSON.parse(t.jsonSlides),
          updatedAt: t.updatedAt.toISOString(),
        }))}
      />
    </main>
  );
}
