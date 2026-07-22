import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { getGlobalTemplate, loadMetricsForScope, DAILY_LOG_METRICS, loadRehabMetricDefs } from "@/lib/metric-alerts";
import { MetricAlertsTemplateClient } from "./MetricAlertsTemplateClient";

export const dynamic = "force-dynamic";

export default async function AlertasMetricasAjustesPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo" && user.role !== "head_success") {
    redirect("/fisio/ajustes");
  }
  const [config, allMetrics, rehabMetrics] = await Promise.all([
    getGlobalTemplate(),
    loadMetricsForScope({ kind: "global" }),
    loadRehabMetricDefs(),
  ]);

  return (
    <main className="max-w-2xl mx-auto space-y-4">
      <header>
        <Link href="/fisio/ajustes" className="text-xs text-neutral-500">← Ajustes</Link>
        <h1 className="text-xl font-semibold mt-1">🚨 Alertas por métricas</h1>
        <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
          Plantilla global que se aplica a todos los pacientes por defecto. Cada fisio
          puede personalizarla por paciente desde la ficha. Las métricas de daily-log
          (fatiga/RPE/sueño) aplican sólo a atletas <strong>ADVANCE/PREVENTION</strong>;
          las de biblioteca clínica se rellenan en las sesiones de{" "}
          <strong>RECUPERA/CONSOLIDA</strong> (dolor, rigidez, etc). Cuando se activa
          una regla, avisa si el paciente se desvía del umbral configurado respecto
          a su media reciente.
        </p>
      </header>
      <MetricAlertsTemplateClient
        initial={config}
        dailyLogMetrics={DAILY_LOG_METRICS}
        rehabMetrics={rehabMetrics}
      />
    </main>
  );
}
