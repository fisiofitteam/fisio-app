import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { getRenewalLandingCopy, getContractLandingCopy, getAgendaLandingCopy, getAgendaGraciasCopy } from "@/lib/landing-config";
import { LandingConfigEditor } from "@/components/LandingConfigEditor";

export const dynamic = "force-dynamic";

export default async function LandingsConfigPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo") redirect("/fisio/biblioteca");

  const [renewal, contract, agenda, gracias] = await Promise.all([
    getRenewalLandingCopy(),
    getContractLandingCopy(),
    getAgendaLandingCopy(),
    getAgendaGraciasCopy(),
  ]);

  return <><a href="/fisio/contenido/metodo?tab=editor" className="card block mb-5"><strong>Metodología FisioFitCross · /metodo</strong><span className="block text-sm text-neutral-600 mt-1">Editar la landing de Instagram, sus historias autorizadas y consultar la atribución comercial.</span></a><LandingConfigEditor initialRenewal={renewal} initialContract={contract} initialAgenda={agenda} initialGracias={gracias} /></>;
}
