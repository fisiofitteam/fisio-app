import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { canAccessSemaforoPanel, canDeleteSemaforo } from "@/lib/semaforo/access";
import { LEGAL_REVISADO, CAMPAIGN_PARAM_NAME, IG_PARAM_NAME } from "@/lib/semaforo/config";
import { ContentNav } from "@/components/ContentNav";
import { SemaforoPanel } from "@/components/semaforo/SemaforoPanel";

export const dynamic = "force-dynamic";

/**
 * Panel del Semáforo dentro de Contenido > Lead magnets. Reutiliza el
 * mismo componente que /fisio/semaforo — solo cambia la envoltura de
 * navegación (ContentNav + breadcrumb).
 */
export default async function SemaforoLeadMagnetPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (!canAccessSemaforoPanel(user.role)) redirect("/fisio");

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      <ContentNav active="lead-magnets" role={user.role} />
      <div className="text-[11px] text-neutral-500 mb-2">
        <Link href="/fisio/contenido/lead-magnets" className="hover:underline">Lead magnets</Link>
        {" · "}
        <span>🚦 Semáforo del Hombro</span>
      </div>
      <SemaforoPanel
        canDelete={canDeleteSemaforo(user.role)}
        legalRevisado={LEGAL_REVISADO}
        igParamName={IG_PARAM_NAME}
        campaignParamName={CAMPAIGN_PARAM_NAME}
        embedded
      />
    </div>
  );
}
