import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { getMetricDefinitions } from "@/lib/metric-definitions";
import { MetricDefinitionsEditor } from "@/components/MetricDefinitionsEditor";

export const dynamic = "force-dynamic";

export default async function MetricasLibraryPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo") redirect("/fisio/biblioteca/programas");

  const defs = await getMetricDefinitions();

  return (
    <div>
      <div className="mb-4">
        <p className="text-sm text-neutral-500">
          Métricas generales que se toman a <strong>todos</strong> los pacientes. Aparecen en su
          evolución aunque aún no tengan datos. Las marcadas como <em>automáticas</em> se rellenan
          solas al completar sesiones.
        </p>
      </div>
      <MetricDefinitionsEditor
        initial={defs.map((d) => ({ id: d.id, key: d.key, name: d.name, unit: d.unit, auto: d.auto, active: d.active }))}
      />
    </div>
  );
}
