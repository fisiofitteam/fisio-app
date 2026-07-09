import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { ContentNav } from "@/components/ContentNav";

export const dynamic = "force-dynamic";

/**
 * Story Maker embebido dentro de /fisio/contenido para no sacar al CEO
 * de la navegación de la app. Iframe apunta a /storymaker (route handler
 * que sirve el HTML autocontenido). La ContentNav queda visible arriba.
 */
export default async function StoryMakerPage() {
  const user = (await getActiveProfessional())!;
  if (user.role !== "ceo" && user.role !== "setter") redirect("/fisio");

  return (
    <main>
      <ContentNav active="story-maker" role={user.role} />
      <div
        className="rounded-2xl overflow-hidden border border-neutral-200"
        style={{
          background: "#F4F7FB",
          // Ocupa el viewport útil por debajo del ContentNav.
          // 100vh menos aprox el header + nav + padding.
          height: "calc(100vh - 160px)",
          minHeight: 600,
        }}
      >
        <iframe
          src="/storymaker"
          title="Story Maker"
          style={{
            width: "100%",
            height: "100%",
            border: 0,
            display: "block",
            background: "#F4F7FB",
          }}
          // sandbox omitido a propósito: el iframe necesita ejecutar scripts,
          // acceder a localStorage (proyectos), llamar fetch() a /api/claude,
          // y descargar blobs. Corre en el mismo origen que la app, la CSP
          // por defecto de Next lo permite. Autorización ya la ha hecho el
          // route handler /storymaker antes de servir el HTML.
        />
      </div>
    </main>
  );
}
