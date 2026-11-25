import Link from "next/link";
import { redirect } from "next/navigation";
import { hasRole } from "@/lib/auth";
import { getActiveProfessional } from "@/lib/session";
import { canReadWodLeads } from "@/lib/public-wod/server";
import { ContentNav } from "@/components/ContentNav";
import { PublicWodLeadsPanel } from "@/components/public-wod/PublicWodLeadsPanel";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (!canReadWodLeads(user)) redirect("/fisio");
  return <main className="p-4 md:p-6 max-w-[1400px] mx-auto"><ContentNav active="lead-magnets" role={user.role} /><div className="my-4 text-sm"><Link href="/fisio/contenido/lead-magnets">Lead magnets</Link> · Adaptador WOD hombro</div><PublicWodLeadsPanel canSetup={hasRole(user, "ceo")} /></main>;
}
