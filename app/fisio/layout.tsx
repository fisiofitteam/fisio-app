import { redirect } from "next/navigation";
import { FisioSidebar } from "@/components/FisioSidebar";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { CommunityTodayBanner } from "@/components/CommunityTodayBanner";
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
      <div className="max-w-[1600px] px-3 py-6">
        {user.impersonating && <ImpersonationBanner name={user.fullName} />}
        <div className="flex flex-col md:flex-row gap-3">
          <FisioSidebar user={user} />
          <div className="flex-1 min-w-0">
            {/* Banner persistente: aparece cuando al profesional le toca
                publicar en la comunidad y aún no lo ha marcado como hecho.
                Se auto-oculta al pulsar "Ya publicado" o si el post ya
                estaba marcado done desde otra vista. */}
            <CommunityTodayBanner />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
