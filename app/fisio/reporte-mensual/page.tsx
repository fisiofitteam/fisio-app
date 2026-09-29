import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { shouldSubmitReport } from "@/lib/team-monthly-reports";
import { TeamMonthlyReportForm } from "@/components/TeamMonthlyReportForm";

/**
 * Página del reporte mensual del equipo. Cada miembro del equipo (todos
 * los roles) rellena aquí las 10 preguntas heredadas del antiguo Google
 * Forms de satisfacción. Se autoguarda mientras escribes; el botón
 * "Enviar" fija el reporte como completado del mes.
 */
export default async function ReporteMensualPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (!shouldSubmitReport(user.role)) redirect("/fisio");

  return (
    <main className="p-4 md:p-6">
      <TeamMonthlyReportForm />
    </main>
  );
}
