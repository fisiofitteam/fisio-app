import { redirect } from "next/navigation";
import { FisioSidebar } from "@/components/FisioSidebar";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { CommunityTodayBanner } from "@/components/CommunityTodayBanner";
import { ActivityHeartbeat } from "@/components/ActivityHeartbeat";
import { getActiveProfessional } from "@/lib/session";
import { getThemeFromCookie } from "@/lib/theme";

export default async function FisioLayout({ children }: { children: React.ReactNode }) {
  const user = await getActiveProfessional();
  if (!user) {
    redirect("/");
  }
  const theme = getThemeFromCookie();
  return (
    <div className={`fisio-shell min-h-screen ${theme === "dark" ? "dark" : ""}`}>
      {/* Latido de actividad para el panel del equipo. No renderiza nada;
          hace ping/minuto si la pestaña esta visible y hay interaccion. */}
      <ActivityHeartbeat />
      {/* Al imprimir queremos SOLO el contenido de la página — sidebar,
          banners superiores y padding se ocultan/reducen. Las páginas
          que quieran ocultar más piezas (headers, botones "Editar…")
          usan las clases `print:hidden` en su propio JSX. */}
      <div className="max-w-[1600px] px-3 py-6 print:max-w-none print:p-0">
        {user.impersonating && (
          <div className="print:hidden">
            <ImpersonationBanner name={user.fullName} />
          </div>
        )}
        <div className="flex flex-col md:flex-row gap-3 print:gap-0 print:block">
          <div className="print:hidden">
            <FisioSidebar user={user} />
          </div>
          <div className="flex-1 min-w-0">
            {/* Banner persistente: aparece cuando al profesional le toca
                publicar en la comunidad y aún no lo ha marcado como hecho.
                Se auto-oculta al pulsar "Ya publicado" o si el post ya
                estaba marcado done desde otra vista. */}
            <div className="print:hidden">
              <CommunityTodayBanner />
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
