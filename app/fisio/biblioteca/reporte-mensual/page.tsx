import { redirect } from "next/navigation";
import Link from "next/link";
import { getActiveProfessional } from "@/lib/session";
import { REPORT_FIELDS, shouldSubmitReport } from "@/lib/team-monthly-reports";
import { TeamMonthlyReportForm } from "@/components/TeamMonthlyReportForm";

/**
 * Reporte mensual dentro de Biblioteca.
 *
 *   · CEO           → preview de las 10 preguntas (solo lectura). Link a los
 *                     reportes guardados en el bloque Métricas equipo del panel.
 *   · Head / Fisio  → formulario para rellenar (mismo componente usado desde
 *                     el banner del layout).
 *   · Otros roles   → redirect al panel.
 */
export default async function ReporteMensualBibliotecaPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");

  const isCeo = user.role === "ceo";
  if (!isCeo && !shouldSubmitReport(user.role)) redirect("/fisio");

  if (isCeo) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-xl font-semibold mb-1">📝 Reporte mensual del equipo</h1>
        <p className="text-xs text-neutral-500 mb-4">
          Estas son las 10 preguntas que head coach y fisios rellenan el primer lunes de cada mes.
          Los reportes ya enviados los tienes en{" "}
          <Link href="/fisio" className="underline">
            Panel → Métricas equipo → Reporte mensual del equipo
          </Link>.
        </p>
        <ol className="space-y-3 mt-4">
          {REPORT_FIELDS.map((f, i) => (
            <li key={f.key} className="border rounded-lg p-3" style={{ borderColor: "#E5E5E5", background: "#FAFAFA" }}>
              <div className="text-sm font-medium">
                <span className="text-neutral-400 mr-1">{i + 1}.</span>
                {f.label}
                {f.required && <span className="text-red-600 ml-1">*</span>}
              </div>
              <div className="text-[11px] text-neutral-500 mt-1">
                {f.required ? "Obligatoria" : "Opcional"} · {f.type === "long" ? "Texto largo" : "Texto corto (URL)"}
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return <TeamMonthlyReportForm />;
}
