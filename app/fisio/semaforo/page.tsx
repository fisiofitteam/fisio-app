import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { canAccessSemaforoPanel, canDeleteSemaforo } from "@/lib/semaforo/access";
import { LEGAL_REVISADO, CAMPAIGN_PARAM_NAME, IG_PARAM_NAME } from "@/lib/semaforo/config";
import { SemaforoPanel } from "@/components/semaforo/SemaforoPanel";

export const dynamic = "force-dynamic";

/**
 * Panel interno del Semáforo del Hombro. Accesible a ceo/head_success/
 * setter/closer. El data-fetching real vive en el cliente para poder
 * cambiar filtros sin recargar la página.
 */
export default async function SemaforoPanelPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (!canAccessSemaforoPanel(user.role)) redirect("/fisio");

  return (
    <SemaforoPanel
      canDelete={canDeleteSemaforo(user.role)}
      legalRevisado={LEGAL_REVISADO}
      igParamName={IG_PARAM_NAME}
      campaignParamName={CAMPAIGN_PARAM_NAME}
    />
  );
}
