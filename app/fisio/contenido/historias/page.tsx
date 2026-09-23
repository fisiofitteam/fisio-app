import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { ContentNav } from "@/components/ContentNav";
import { StoriesTemplateView } from "@/components/StoriesTemplateView";

export const dynamic = "force-dynamic";

/**
 * Tab "Historias" del panel de Contenido. Plantilla semanal fija por día
 * (1 slot = 1 formato) + bloc de ideas por día (sin fecha, se acumulan
 * hasta que las marcas como publicadas).
 *
 * El fetch inicial lo hace el propio componente cliente contra
 * /api/content/stories, así el usuario ve loading en vez de esperar SSR.
 */
export default async function HistoriasPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo" && user.role !== "setter") redirect("/fisio/contenido/calendario");

  return (
    <main>
      <ContentNav active="historias" role={user.role} />
      <header className="mb-4">
        <h1 className="text-xl font-semibold">📱 Historias</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Plantilla fija de formatos por día. Anota ideas debajo del formato de cada día — se guardan solas y las marcas como publicadas cuando toque.
        </p>
      </header>
      <StoriesTemplateView />
    </main>
  );
}
