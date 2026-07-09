import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ContentNav } from "@/components/ContentNav";
import { StoryMakerEditor } from "@/components/StoryMaker/StoryMakerEditor";

export const dynamic = "force-dynamic";

export default async function StoryMakerPage() {
  const user = (await getActiveProfessional())!;
  if (user.role !== "ceo" && user.role !== "setter") redirect("/fisio");

  // Plantillas guardadas por el equipo (las builtin viven en código)
  const saved = await prisma.contentStoryTemplate
    .findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, description: true, jsonSlides: true },
    })
    .catch(() => []);

  const savedTemplates = saved.map((t) => {
    let parsed: any = {};
    try { parsed = JSON.parse(t.jsonSlides); } catch {}
    return {
      id: t.id,
      key: t.id, // usamos el id como key para plantillas guardadas
      name: t.name,
      description: t.description ?? "",
      slides: parsed.slides ?? [],
      aiSlots: parsed.aiSlots ?? [],
    };
  });

  return (
    <main>
      <ContentNav active="story-maker" role={user.role} />
      <StoryMakerEditor savedTemplates={savedTemplates} />
    </main>
  );
}
