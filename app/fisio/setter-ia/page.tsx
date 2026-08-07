/**
 * /fisio/setter-ia
 *
 * Panel dedicado a las métricas del setter IA (Skalex/Zapp). Solo CEO.
 *
 * Filtros por rango de fechas via searchParams:
 *  - ?period=month|prev-month|quarter|year (default: month)
 *  - ?from=YYYY-MM-DD&to=YYYY-MM-DD (rango custom, tiene prioridad)
 *
 * Datos que muestra:
 *  - Total histórico sincronizado (todas las conversaciones almacenadas)
 *  - KPIs del rango (conversaciones activas + cruces con CRM)
 *  - Etiquetas del rango (por addedAt)
 *  - Fases IA del rango (por lastMessageAt de la conversación)
 *  - Estado del último sync + botón "Sincronizar ahora"
 *  - Últimas 30 conversaciones sincronizadas con enlaces a Lead/Patient
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getSkalexMonthlyMetrics } from "@/lib/skalex/metrics";
import { SetterIaRefreshButton } from "@/components/SetterIaRefreshButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Setter IA · FisioFit" };

type Period = "month" | "prev-month" | "quarter" | "year" | "custom";

function monthRange(offset: number = 0): { start: Date; end: Date; label: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  const label = start.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return { start, end, label };
}
function quarterRange(): { start: Date; end: Date; label: string } {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const start = new Date(now.getFullYear(), q * 3, 1);
  const end = new Date(now.getFullYear(), q * 3 + 3, 1);
  return { start, end, label: `Q${q + 1} ${now.getFullYear()}` };
}
function yearRange(): { start: Date; end: Date; label: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear() + 1, 0, 1);
  return { start, end, label: String(now.getFullYear()) };
}

function resolveRange(sp: { period?: string; from?: string; to?: string }) {
  if (sp.from && sp.to) {
    const start = new Date(sp.from);
    const end = new Date(sp.to);
    end.setDate(end.getDate() + 1); // inclusivo
    const fmt = (d: Date) => d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    return { start, end, label: `${fmt(start)} → ${fmt(new Date(end.getTime() - 86400000))}`, period: "custom" as Period };
  }
  const p: Period = (sp.period as Period) || "month";
  if (p === "prev-month") return { ...monthRange(-1), period: p };
  if (p === "quarter") return { ...quarterRange(), period: p };
  if (p === "year") return { ...yearRange(), period: p };
  return { ...monthRange(0), period: "month" as Period };
}

export default async function SetterIaPage({
  searchParams,
}: {
  searchParams: { period?: string; from?: string; to?: string };
}) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo") redirect("/fisio");

  const range = resolveRange(searchParams);
  const [metrics, totalStored, recent, syncState] = await Promise.all([
    getSkalexMonthlyMetrics(range.start, new Date(range.end.getTime() - 1)),
    prisma.skalexConversation.count(),
    prisma.skalexConversation.findMany({
      orderBy: { lastMessageAt: "desc" },
      take: 30,
      include: { labels: { orderBy: { addedAt: "desc" }, take: 4 } },
    }),
    prisma.skalexSyncState.findUnique({ where: { id: "singleton" } }),
  ]);

  const linkPeriod = (p: Period, extra: Record<string, string> = {}) => {
    const qs = new URLSearchParams({ period: p, ...extra });
    return `/fisio/setter-ia?${qs.toString()}`;
  };

  return (
    <main className="p-4 sm:p-6 max-w-6xl mx-auto">
      <header className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🤖</span>
          <h1 className="text-2xl font-semibold">Setter IA (Skalex)</h1>
        </div>
        <p className="text-sm text-neutral-500">
          Métricas de las conversaciones que gestiona Skalex. Total sincronizadas: <strong>{totalStored}</strong>.
        </p>
      </header>

      {/* Aviso: la API actual de Skalex solo permite buscar por identidad,
          así que solo vemos conversaciones cuya @Instagram o teléfono ya
          existe en nuestro CRM (Lead/Patient). Las fases anteriores del
          funnel (aún sin agendar) están fuera del scope. */}
      <div
        className="mb-5 rounded-lg p-3 text-xs"
        style={{ background: "#FEF3C7", border: "1px solid #F59E0B", color: "#78350F" }}
      >
        <strong>⚠ Vista parcial del funnel</strong> — Skalex solo nos deja consultar por
        identidad, así que aquí ves las conversaciones cuyo <em>@Instagram</em> o
        teléfono ya está en tu CRM. Los leads que están en fases anteriores (aún
        no han agendado y no existen en tu CRM) no aparecen. Pendiente que
        Skalex nos habilite listado paginado o filtro por etiqueta para pintar
        el funnel completo.
      </div>

      {/* Selector de periodo */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <PeriodBtn href={linkPeriod("month")} active={range.period === "month"} label="Este mes" />
        <PeriodBtn href={linkPeriod("prev-month")} active={range.period === "prev-month"} label="Mes anterior" />
        <PeriodBtn href={linkPeriod("quarter")} active={range.period === "quarter"} label="Trimestre" />
        <PeriodBtn href={linkPeriod("year")} active={range.period === "year"} label="Año" />
        <span className="ml-auto text-xs text-neutral-500 capitalize">{range.label}</span>
      </div>

      {/* Estado del sync + refresh */}
      <section className="card mb-5">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-0.5">Último sync</p>
            <p className="text-sm">
              {syncState?.lastSuccessAt
                ? new Date(syncState.lastSuccessAt).toLocaleString("es-ES", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Nunca"}
              {syncState?.lastProcessed !== undefined && syncState.lastProcessed > 0 && (
                <span className="text-neutral-500">
                  {" "} · {syncState.lastProcessed} identidades procesadas ·{" "}
                  {syncState.lastCreated} nuevas · {syncState.lastUpdated} actualizadas
                </span>
              )}
            </p>
            {syncState?.lastError && (
              <p className="text-xs text-red-600 mt-1">Error: {syncState.lastError}</p>
            )}
          </div>
          <SetterIaRefreshButton />
        </div>
      </section>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <Kpi label="Conversaciones activas" value={metrics.activeConversations} accent="neutral" hint="Actividad en el rango" />
        <Kpi label="→ Paciente" value={metrics.linkedToPatient} accent="emerald" hint="Cruzan con un Patient" />
        <Kpi label="→ Lead" value={metrics.linkedToLeadOnly} accent="amber" hint="Solo cruzan con un Lead" />
        <Kpi label="Sin cruce" value={metrics.unlinked} accent="neutral" hint="Aún no aparecen en tu CRM" />
      </div>

      {/* Dos columnas: etiquetas + fases IA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
        <section className="card">
          <h2 className="font-medium text-sm mb-3">Etiquetas puestas en el rango</h2>
          {metrics.labelsByName.length === 0 ? (
            <p className="text-xs text-neutral-400 py-6 text-center">Sin etiquetas en el rango</p>
          ) : (
            <div className="space-y-1.5">
              {metrics.labelsByName.map((l) => (
                <div key={l.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    {l.color && (
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{ background: l.color }}
                      />
                    )}
                    {l.name}
                  </span>
                  <span className="tabular-nums font-medium">{l.count}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="font-medium text-sm mb-3">Fase del funnel (IA)</h2>
          {metrics.aiPhaseCounts.length === 0 ? (
            <p className="text-xs text-neutral-400 py-6 text-center">Sin fases IA en el rango</p>
          ) : (
            <div className="space-y-1.5">
              {metrics.aiPhaseCounts.map((p) => (
                <div key={`${p.phase}-${p.phaseName}`} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="inline-block text-xs text-neutral-400 tabular-nums w-5 text-right">
                      {p.phase ?? "—"}
                    </span>
                    {p.phaseName ?? "Sin fase"}
                  </span>
                  <span className="tabular-nums font-medium">{p.count}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Tabla de conversaciones recientes */}
      <section className="card">
        <h2 className="font-medium text-sm mb-3">Conversaciones recientes (30 más nuevas)</h2>
        {recent.length === 0 ? (
          <p className="text-xs text-neutral-400 py-6 text-center">
            Sin datos aún. Pulsa "Sincronizar ahora" para traer conversaciones de Skalex.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200">
                  <th className="py-2 pl-4 sm:pl-0">Cliente</th>
                  <th className="py-2">Plataforma</th>
                  <th className="py-2">Fase IA</th>
                  <th className="py-2">Etiquetas</th>
                  <th className="py-2">Último mensaje</th>
                  <th className="py-2 pr-4 sm:pr-0">CRM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {recent.map((c) => (
                  <tr key={c.id} className="hover:bg-neutral-50/60">
                    <td className="py-2 pl-4 sm:pl-0">
                      <div className="font-medium">{c.customerName || "(sin nombre)"}</div>
                      <div className="text-xs text-neutral-500">
                        {c.igUsername ? `@${c.igUsername}` : c.customerPhone || "—"}
                      </div>
                    </td>
                    <td className="py-2">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 capitalize">
                        {c.platform}
                      </span>
                    </td>
                    <td className="py-2">
                      {c.aiPhase != null ? (
                        <span className="text-xs">
                          <span className="text-neutral-400 tabular-nums">{c.aiPhase}</span> {c.aiPhaseName}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {c.labels.length === 0 ? (
                          <span className="text-xs text-neutral-400">—</span>
                        ) : (
                          c.labels.map((l) => (
                            <span
                              key={l.id}
                              className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{
                                background: l.color ? `${l.color}22` : "#F3F4F6",
                                color: l.color || "#374151",
                                border: `1px solid ${l.color || "#E5E7EB"}`,
                              }}
                            >
                              {l.name}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="py-2 text-xs text-neutral-600">
                      {new Date(c.lastMessageAt).toLocaleString("es-ES", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-2 pr-4 sm:pr-0 text-xs">
                      {c.patientId ? (
                        <Link href={`/fisio/paciente/${c.patientId}/ficha`} className="text-emerald-700 hover:underline">
                          → Paciente
                        </Link>
                      ) : c.leadId ? (
                        <Link href={`/fisio/leads`} className="text-amber-700 hover:underline">
                          → Lead
                        </Link>
                      ) : (
                        <span className="text-neutral-400">Sin cruce</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Kpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number;
  hint?: string;
  accent?: "neutral" | "emerald" | "amber";
}) {
  const color =
    accent === "emerald" ? "text-emerald-700" : accent === "amber" ? "text-amber-700" : "text-neutral-900";
  return (
    <div className="card p-3">
      <p className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums mt-0.5 ${color}`}>{value}</p>
      {hint && <p className="text-[11px] text-neutral-500 mt-0.5">{hint}</p>}
    </div>
  );
}

function PeriodBtn({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`text-xs px-3 py-1.5 rounded-full border transition ${
        active
          ? "bg-neutral-900 text-white border-neutral-900"
          : "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50"
      }`}
    >
      {label}
    </Link>
  );
}
