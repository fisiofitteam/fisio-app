import { prisma } from "@/lib/prisma";
import { monthKey, monthLabel, REPORT_FIELDS, REPORTING_ROLES, type ReportFieldKey } from "@/lib/team-monthly-reports";

/**
 * Bloque plegable con los reportes mensuales del equipo — se pinta debajo
 * de TeamMetricsBlock en el panel principal (CEO y head coach). Muestra el
 * mes actual: cada profesional que TIENE QUE rellenar aparece con estado
 * "Enviado / Pendiente"; al abrir uno enviado se ven las 10 respuestas.
 *
 * Silencioso si la tabla no está migrada aún — no rompe el panel.
 */
const ROLE_LABEL: Record<string, string> = {
  head_success: "Head coach",
  fisio: "Fisio",
};

export async function TeamMonthlyReportsBlock() {
  const mk = monthKey();

  let reports: Array<{
    id: string;
    professionalId: string;
    submittedAt: Date;
    updatedAt: Date;
  } & Record<ReportFieldKey, string | null>> = [];
  try {
    reports = (await prisma.teamMonthlyReport.findMany({
      where: { monthYear: mk },
      orderBy: { submittedAt: "desc" },
    })) as typeof reports;
  } catch {
    return null; // tabla no migrada → no pintar
  }

  const allActive = await prisma.professional.findMany({
    where: { active: true, role: { in: [...REPORTING_ROLES] } },
    select: { id: true, fullName: true, role: true, photoUrl: true },
    orderBy: { fullName: "asc" },
  });
  if (allActive.length === 0) return null;

  const reportByProId = new Map(reports.map((r) => [r.professionalId, r]));
  const submittedCount = reports.length;
  const pendingCount = allActive.length - submittedCount;

  return (
    <details
      className="rounded-xl border mt-4"
      style={{ borderColor: "#E5E5E5", background: "#FFFFFF" }}
    >
      <summary className="cursor-pointer select-none list-none px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">📝 Reporte mensual del equipo · {monthLabel(mk)}</div>
          <div className="text-[11px] text-neutral-500 mt-0.5">
            <b className="text-emerald-700">{submittedCount}</b> enviado{submittedCount === 1 ? "" : "s"} ·{" "}
            <b className="text-amber-700">{pendingCount}</b> pendiente{pendingCount === 1 ? "" : "s"}
          </div>
        </div>
        <span className="text-[11px] text-neutral-400">Abrir ▾</span>
      </summary>
      <div className="px-4 pb-4 pt-1 space-y-3 border-t border-neutral-100">
        {allActive.map((pro) => {
          const rep = reportByProId.get(pro.id);
          return (
            <details key={pro.id} className="rounded-lg border" style={{ borderColor: "#E5E5E5", background: rep ? "#FFFFFF" : "#FAFAFA" }}>
              <summary className="cursor-pointer select-none list-none px-3 py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {pro.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pro.photoUrl} alt={pro.fullName} className="w-7 h-7 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-neutral-200 flex items-center justify-center text-[11px] font-bold text-neutral-600 shrink-0">
                      {pro.fullName.slice(0, 1)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{pro.fullName}</div>
                    <div className="text-[10px] text-neutral-500">{ROLE_LABEL[pro.role] ?? pro.role}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {rep ? (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md" style={{ background: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0" }}>
                      ✓ Enviado
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md" style={{ background: "#FEF3C7", color: "#78350F", border: "1px solid #FCD34D" }}>
                      Pendiente
                    </span>
                  )}
                </div>
              </summary>
              {rep && (
                <div className="px-3 pb-3 pt-1 space-y-3 border-t border-neutral-100">
                  <div className="text-[10px] text-neutral-400">
                    Última actualización: {new Date(rep.updatedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  {REPORT_FIELDS.map((f, i) => {
                    const raw = rep[f.key];
                    const val = typeof raw === "string" ? raw.trim() : "";
                    return (
                      <div key={f.key}>
                        <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium mb-0.5">
                          {i + 1}. {f.label}
                        </div>
                        {val ? (
                          <div className="text-sm whitespace-pre-wrap text-neutral-800">{val}</div>
                        ) : (
                          <div className="text-xs italic text-neutral-400">— sin respuesta —</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </details>
          );
        })}
      </div>
    </details>
  );
}
