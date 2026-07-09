import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ContentNav } from "@/components/ContentNav";
import { StoryMakerEditor } from "@/components/StoryMaker/StoryMakerEditor";
import type { Slide } from "@/lib/story-maker/types";

export const dynamic = "force-dynamic";

export default async function StoryMakerPage({
  searchParams,
}: {
  searchParams: { edit?: string };
}) {
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
      slides: (parsed.slides ?? []) as Slide[],
      aiSlots: parsed.aiSlots ?? [],
    };
  });

  // Modo edición: si el CEO llega con ?edit=<id>, precargamos esa
  // plantilla y el guardar hará PATCH en vez de POST.
  const editing = searchParams.edit
    ? savedTemplates.find((t) => t.id === searchParams.edit) ?? null
    : null;

  return (
    <main>
      <ContentNav active="story-maker" role={user.role} />
      <StoryMakerEditor
        savedTemplates={savedTemplates}
        editingTemplate={editing}
      />
    </main>
  );
}
