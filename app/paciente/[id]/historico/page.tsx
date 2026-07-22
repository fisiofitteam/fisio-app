import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PatientNav } from "@/components/PatientNav";

export const dynamic = "force-dynamic";

const DAY_NAMES = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const TYPE_ICONS: Record<string, string> = {
  WORKOUT: "💪",
  VIDEO: "🎥",
  FORM: "📝",
  EVOLUTION: "📊",
};

type SnapshotTask = {
  id: string;
  type: string;
  title: string;
  bodyText: string | null;
  videoId: string | null;
  youtubeUrl: string | null;
  block: "Accesorios" | "Entrenamiento";
};

/** Lunes UTC 00:00 de la semana que contiene la fecha dada. */
function weekStartUtc(d: Date): Date {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = day.getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  day.setUTCDate(day.getUTCDate() + offset);
  return day;
}

function weekRangeLabel(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const monStr = monday.toLocaleDateString("es-ES", opts);
  const sunStr = sunday.toLocaleDateString("es-ES", { ...opts, year: "numeric" });
  return `Semana del ${monStr} al ${sunStr}`;
}

export default async function AdvanceHistoricoPage({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    select: { id: true, programType: true },
  });
  if (!patient) notFound();
  // El historico solo aplica a ADVANCE. Para el resto, redirigimos al home.
  if (patient.programType !== "ADVANCE") notFound();

  // Ultimos 60 dias.
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 60);
  const logs = await (prisma as any).advanceSessionLog.findMany({
    where: { patientId: patient.id, sessionDate: { gte: from } },
    orderBy: { sessionDate: "desc" },
    take: 60,
  });

  // Agrupamos por semana (lunes UTC de cada log.sessionDate).
  const groups = new Map<string, { monday: Date; items: typeof logs }>();
  for (const l of logs) {
    const monday = weekStartUtc(new Date(l.sessionDate));
    const key = monday.toISOString();
    if (!groups.has(key)) groups.set(key, { monday, items: [] });
    groups.get(key)!.items.push(l);
  }
  // Ordenamos: semana mas reciente primero, dentro L → V.
  for (const g of groups.values()) {
    g.items.sort((a: any, b: any) => new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime());
  }
  const orderedWeeks = Array.from(groups.values()).sort((a, b) => b.monday.getTime() - a.monday.getTime());
  const currentWeekKey = weekStartUtc(new Date()).toISOString();

  return (
    <main className="min-h-screen" style={{ color: "var(--p-text)" }}>
      <div className="max-w-md mx-auto px-5 py-7 pb-24">
        <Link
          href={`/paciente/${patient.id}`}
          className="inline-flex items-center gap-1 text-xs mb-6"
          style={{ color: "var(--p-text-faint)" }}
        >
          <ArrowLeft size={12} /> Volver
        </Link>

        <header className="mb-6">
          <div className="text-[10px] font-bold tracking-wider uppercase mb-1" style={{ color: "var(--p-text-faint)" }}>
            Últimos 60 días
          </div>
          <h1 className="text-3xl font-bold" style={{ letterSpacing: "-0.03em" }}>
            📓 Mi histórico
          </h1>
          <p className="text-xs mt-1" style={{ color: "var(--p-text-dim)" }}>
            Cada sesión completada con sus tareas y tus sensaciones.
          </p>
        </header>

        {orderedWeeks.length === 0 ? (
          <section
            className="rounded-2xl p-5 text-center py-10"
            style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}
          >
            <div className="text-3xl mb-2">📭</div>
            <p className="text-sm" style={{ color: "var(--p-text-dim)" }}>
              Aún no has completado ninguna sesión. Cuando pulses «Marcar como completada» en tu sesión de hoy, aparecerá aquí.
            </p>
          </section>
        ) : (
          <div className="space-y-3">
            {orderedWeeks.map(({ monday, items }) => {
              const isCurrent = monday.toISOString() === currentWeekKey;
              return (
                <details
                  key={monday.toISOString()}
                  className="rounded-2xl group"
                  style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}
                  open={isCurrent}
                >
                  <summary className="flex items-center justify-between cursor-pointer p-4 list-none [&::-webkit-details-marker]:hidden">
                    <div>
                      <div className="font-medium text-sm">
                        {weekRangeLabel(monday)}
                        {isCurrent && (
                          <span className="ml-2 text-[10px] font-bold uppercase" style={{ color: "var(--p-accent)" }}>
                            actual
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: "var(--p-text-dim)" }}>
                        {items.length} {items.length === 1 ? "sesión" : "sesiones"}
                      </div>
                    </div>
                    <span className="text-xs group-open:rotate-180 transition-transform" style={{ color: "var(--p-text-faint)" }}>▼</span>
                  </summary>
                  <div className="px-4 pb-4 pt-2 space-y-3" style={{ borderTop: "1px solid var(--p-border)" }}>
                    {items.map((log: any) => <DayCard key={log.id} log={log} />)}
                  </div>
                </details>
              );
            })}
          </div>
        )}

        <PatientNav patientId={patient.id} active="home" variant="advance" />
      </div>
    </main>
  );
}

function DayCard({ log }: { log: any }) {
  const when = new Date(log.sessionDate);
  const dow = when.getUTCDay() === 0 ? 7 : when.getUTCDay();
  const dayName = DAY_NAMES[dow] ?? "";
  const dayDate = when.toLocaleDateString("es-ES", { day: "numeric", month: "short" });

  let tasks: SnapshotTask[] = [];
  try {
    const parsed = JSON.parse(log.tasksSnapshot ?? "[]");
    if (Array.isArray(parsed)) tasks = parsed as SnapshotTask[];
  } catch { /* snapshot no valido, mostrar solo notas */ }

  const accessorios = tasks.filter((t) => t.block === "Accesorios");
  const entrenamiento = tasks.filter((t) => t.block === "Entrenamiento");

  return (
    <div className="rounded-xl p-3" style={{ background: "var(--p-surface-2)", border: "1px solid var(--p-border)" }}>
      <div className="flex items-baseline justify-between mb-2">
        <div className="font-semibold text-sm capitalize">
          {dayName} <span className="font-normal" style={{ color: "var(--p-text-dim)" }}>· {dayDate}</span>
        </div>
      </div>

      {accessorios.length > 0 && (
        <TaskGroup label="Accesorios" color="#3B82F6" tasks={accessorios} />
      )}
      {entrenamiento.length > 0 && (
        <TaskGroup label="Entrenamiento" color="#F59E0B" tasks={entrenamiento} />
      )}
      {tasks.length === 0 && (
        <div className="text-[11px] italic" style={{ color: "var(--p-text-faint)" }}>
          No hay detalle del entreno guardado para este día.
        </div>
      )}

      {log.patientNotes && (
        <div className="mt-3 rounded-lg p-2.5" style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--p-text-faint)" }}>
            ✍️ Mis sensaciones
          </div>
          <p className="text-xs whitespace-pre-wrap" style={{ color: "var(--p-text)" }}>{log.patientNotes}</p>
        </div>
      )}
    </div>
  );
}

function TaskGroup({ label, color, tasks }: { label: string; color: string; tasks: SnapshotTask[] }) {
  return (
    <div className="mb-2 last:mb-0">
      <div
        className="inline-flex items-center text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded mb-1.5"
        style={{ background: `${color}33`, color }}
      >
        {label.toUpperCase()}
      </div>
      <div className="space-y-1.5">
        {tasks.map((t) => (
          <div
            key={t.id}
            className="rounded-lg p-2"
            style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}
          >
            <div className="flex items-start gap-1.5">
              <span className="text-sm mt-0.5">{TYPE_ICONS[t.type] || "•"}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{t.title}</div>
                {t.bodyText && (
                  <div className="text-[11px] mt-1 whitespace-pre-wrap" style={{ color: "var(--p-text-dim)" }}>
                    {t.bodyText}
                  </div>
                )}
                {t.youtubeUrl && (
                  <a
                    href={t.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium mt-1 hover:underline"
                    style={{ color: "var(--p-accent)" }}
                  >
                    Ver vídeo →
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
