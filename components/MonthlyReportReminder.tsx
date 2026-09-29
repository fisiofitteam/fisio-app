import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { monthKey, monthLabel, shouldSubmitReport } from "@/lib/team-monthly-reports";

/**
 * Banner recordatorio del reporte mensual. Se pinta en el panel /fisio
 * para todos los miembros del equipo mientras no hayan enviado el
 * reporte del mes actual. Silencioso una vez enviado.
 *
 * Se consulta la tabla directamente aquí para hacerlo server-side. Si
 * la tabla no existe todavía (migración pendiente), devuelve null en
 * lugar de romper el panel.
 */
export async function MonthlyReportReminder({
  professionalId,
  role,
}: {
  professionalId: string;
  role: string;
}) {
  if (!shouldSubmitReport(role)) return null;

  const mk = monthKey();
  let alreadySent = false;
  try {
    const row = await prisma.teamMonthlyReport.findUnique({
      where: { professionalId_monthYear: { professionalId, monthYear: mk } },
      select: { id: true },
    });
    alreadySent = !!row;
  } catch {
    return null; // tabla no migrada aún → sin banner
  }
  if (alreadySent) return null;

  return (
    <Link
      href="/fisio/biblioteca/reporte-mensual"
      className="block mb-4 rounded-xl px-4 py-3 border transition hover:shadow-sm"
      style={{
        background: "linear-gradient(135deg,#FEF3C7 0%,#FDE68A 100%)",
        borderColor: "#FCD34D",
        color: "#78350F",
      }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-semibold">📝 Reporte mensual de {monthLabel(mk)} pendiente</div>
          <div className="text-xs mt-0.5" style={{ color: "#92400E" }}>
            10 preguntas para contarnos cómo va el mes, qué necesitas y en qué te podemos ayudar. Se guarda automático mientras escribes.
          </div>
        </div>
        <span className="text-xs font-semibold px-3 py-1.5 rounded-md bg-white/70">
          Ir al reporte →
        </span>
      </div>
    </Link>
  );
}
