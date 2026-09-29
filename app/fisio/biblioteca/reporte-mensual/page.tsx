import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { shouldSubmitReport } from "@/lib/team-monthly-reports";
import { TeamMonthlyReportForm } from "@/components/TeamMonthlyReportForm";

/**
 * Formulario del reporte mensual del equipo. Vive dentro de Biblioteca
 * como una pestaña más. Cada miembro (head coach + fisios) rellena las
 * 10 preguntas heredadas del antiguo Google Forms de satisfacción.
 * El CEO NO rellena — solo lee los reportes desde el bloque de
 * métricas del equipo en /fisio.
 */
export default async function ReporteMensualBibliotecaPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  // CEO y roles no-clínicos van al panel — no lo rellenan.
  if (!shouldSubmitReport(user.role)) redirect("/fisio");

  return <TeamMonthlyReportForm />;
}
