import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { canAccessAutotestPanel, canDeleteAutotest } from "@/lib/autotest-hombro/access";
import { ContentNav } from "@/components/ContentNav";
import { AutotestPanel } from "@/components/autotest-hombro/AutotestPanel";

export const dynamic = "force-dynamic";

/**
 * Panel del Autotest Funcional del Hombro dentro de Contenido > Lead magnets.
 */
export default async function AutotestHombroAdminPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (!canAccessAutotestPanel(user.role)) redirect("/fisio");

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      <ContentNav active="lead-magnets" role={user.role} />
      <div className="text-[11px] text-neutral-500 mb-2">
        <Link href="/fisio/contenido/lead-magnets" className="hover:underline">Lead magnets</Link>
        {" · "}
        <span>🧪 Autotest Funcional del Hombro</span>
      </div>
      <AutotestPanel canDelete={canDeleteAutotest(user.role)} embedded />
    </div>
  );
}
