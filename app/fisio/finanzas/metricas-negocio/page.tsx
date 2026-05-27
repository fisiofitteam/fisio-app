import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function MetricasNegocioPage() {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") redirect("/fisio");

  return (
    <main>
      <section className="card text-center py-16">
        <div className="text-4xl mb-3">📈</div>
        <h2 className="font-semibold text-base mb-1">Métricas globales del negocio</h2>
        <p className="text-sm text-neutral-500 max-w-md mx-auto">
          Aquí irán los indicadores globales del negocio. Definiremos juntos qué métricas
          incluir (LTV, CAC, MRR, churn, ticket medio, etc.).
        </p>
      </section>
    </main>
  );
}
