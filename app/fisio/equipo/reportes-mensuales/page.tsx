import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canReadTeamReports, monthKey, monthLabel, REPORT_FIELDS, REPORTING_ROLES, type ReportFieldKey } from "@/lib/team-monthly-reports";
import { MonthPicker } from "@/components/MonthlyReportsMonthPicker";

/**
 * Vista consolidada de reportes mensuales del equipo. Selector de mes en la
 * cabecera; lista de todos los profesionales activos con estado (enviado /
 * pendiente); al hacer click en uno se despliegan las 10 respuestas.
 * Solo CEO y head_success.
 */
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  ceo: "CEO",
  head_success: "Head coach",
  fisio: "Fisio",
  setter: "Setter",
  closer: "Closer",
};

function monthOptions(): { key: string; label: string }[] {
  // Últimos 12 meses en TZ Madrid.
  const opts: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    opts.push({ key, label: monthLabel(key) });
  }
  return opts;
}

export default async function ReportesMensualesPage({
  searchParams,
}: {
  searchParams: { m?: string };
}) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (!canReadTeamReports(user.role)) redirect("/fisio");

  const selectedMonth = searchParams.m && /^\d{4}-\d{2}$/.test(searchParams.m)
    ? searchParams.m
    : monthKey();

  let reports: Array<{
    id: string;
    professionalId: string;
    submittedAt: Date;
    updatedAt: Date;
  } & Record<ReportFieldKey, string | null>> = [];
  let tableExists = true;
  try {
    reports = (await prisma.teamMonthlyReport.findMany({
      where: { monthYear: selectedMonth },
      orderBy: { submittedAt: "desc" },
    })) as typeof reports;
  } catch {
    tableExists = false;
  }

  const allActive = await prisma.professional.findMany({
    where: { active: true, role: { in: [...REPORTING_ROLES] } },
    select: { id: true, fullName: true, role: true, photoUrl: true },
    orderBy: { fullName: "asc" },
  });
  const reportByProId = new Map(reports.map((r) => [r.professionalId, r]));

  const submittedCount = reports.length;
  const pendingCount = allActive.length - submittedCount;

  return (
    <main className="p-4 md:p-6 max-w-4xl">
      <header className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">📋 Reportes mensuales del equipo</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            10 preguntas por persona/mes — cómo va, bloqueos, casos de éxito, mejoras al programa.
          </p>
        </div>
        <MonthPicker options={monthOptions()} current={selectedMonth} />
      </header>

      {!tableExists ? (
        <div className="rounded-lg p-4 text-sm" style={{ background: "#FEF3C7", color: "#78350F", border: "1px solid #FCD34D" }}>
          ⚠ La tabla aún no existe. Ejecuta{" "}
          <code className="bg-white/60 px-1 rounded">/api/admin/migrate-team-monthly-reports</code> desde el navegador (como CEO) para crearla.
        </div>
      ) : (
        <>
          <div className="mb-4 text-xs text-neutral-500">
            <b>{submittedCount}</b> enviado{submittedCount === 1 ? "" : "s"} · <b>{pendingCount}</b> pendiente{pendingCount === 1 ? "" : "s"} · {monthLabel(selectedMonth)}
          </div>

          <div className="space-y-3">
            {allActive.map((pro) => {
              const rep = reportByProId.get(pro.id);
              return (
                <details
                  key={pro.id}
                  className="group rounded-xl border"
                  style={{ background: rep ? "#FFFFFF" : "#FAFAFA", borderColor: rep ? "#E5E5E5" : "#E5E5E5" }}
                >
                  <summary className="cursor-pointer select-none list-none px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {pro.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={pro.photoUrl} alt={pro.fullName} className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center text-xs font-bold text-neutral-600 shrink-0">
                          {pro.fullName.slice(0, 1)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{pro.fullName}</div>
                        <div className="text-[11px] text-neutral-500">{ROLE_LABEL[pro.role] ?? pro.role}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {rep ? (
                        <span className="text-[11px] font-semibold px-2 py-1 rounded-md" style={{ background: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0" }}>
                          ✓ Enviado
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold px-2 py-1 rounded-md" style={{ background: "#FEF3C7", color: "#78350F", border: "1px solid #FCD34D" }}>
                          Pendiente
                        </span>
                      )}
                      {rep && (
                        <span className="text-[10px] text-neutral-400 hidden sm:inline">
                          {new Date(rep.updatedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                  </summary>
                  {rep && (
                    <div className="px-4 pb-4 pt-1 space-y-3 border-t border-neutral-100">
                      {REPORT_FIELDS.map((f, i) => {
                        const raw = rep[f.key];
                        const val = typeof raw === "string" ? raw.trim() : "";
                        return (
                          <div key={f.key}>
                            <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-medium mb-0.5">
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
        </>
      )}
    </main>
  );
}
