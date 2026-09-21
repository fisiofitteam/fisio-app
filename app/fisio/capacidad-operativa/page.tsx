import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { computeCapacityReport } from "@/lib/capacity";
import { CapacityReport } from "@/components/CapacityReport";

export const dynamic = "force-dynamic";

/**
 * Página standalone del panel de capacidad operativa. Es la misma
 * vista que se monta como tab en /fisio, pero accesible directamente
 * por URL (útil para bookmarks del head coach).
 *
 * Solo CEO y head_success — cualquier otro rol se redirige al panel.
 */
export default async function CapacityPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/");
  if (user.role !== "ceo" && user.role !== "head_success") redirect("/fisio");

  const data = await computeCapacityReport();
  return (
    <main className="p-4 md:p-6">
      <CapacityReport data={data} />
    </main>
  );
}
