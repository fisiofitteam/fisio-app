import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { getGlobalTemplate } from "@/lib/metric-alerts";
import { MetricAlertsTemplateClient } from "./MetricAlertsTemplateClient";

export const dynamic = "force-dynamic";

export default async function AlertasMetricasAjustesPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo" && user.role !== "head_success") {
    redirect("/fisio/ajustes");
  }
  const config = await getGlobalTemplate();

  return (
    <main className="max-w-2xl mx-auto space-y-4">
      <header>
        <Link href="/fisio/ajustes" className="text-xs text-neutral-500">← Ajustes</Link>
        <h1 className="text-xl font-semibold mt-1">🚨 Alertas por métricas</h1>
        <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
          Plantilla global que se aplica a todos los pacientes por defecto. Cada fisio
          puede personalizarla por paciente desde la ficha (ojo: no todos los atletas
          registran RPE, sobre todo los que están con dolor). Tocar la plantilla NO
          modifica pacientes con configuración personalizada, solo afecta a los que
          heredan.
        </p>
      </header>
      <MetricAlertsTemplateClient initial={config} />
    </main>
  );
}
