import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function fDateTime(d: Date): string {
  return new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) +
    " · " + new Date(d).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

/** Lunes UTC midnight de la semana que contiene la fecha dada. */
function weekStartUtc(d: Date): Date {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = day.getUTCDay(); // 0=Dom .. 6=Sab
  const offset = dow === 0 ? -6 : 1 - dow;
  day.setUTCDate(day.getUTCDate() + offset);
  return day;
}

/** "L 12 – D 18 may 2026" o similar. Añade "· semana actual" si aplica. */
function weekRangeLabel(mondayUtc: Date): string {
  const sunday = new Date(mondayUtc);
  sunday.setUTCDate(mondayUtc.getUTCDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const monStr = mondayUtc.toLocaleDateString("es-ES", opts);
  const sunStr = sunday.toLocaleDateString("es-ES", { ...opts, year: "numeric" });
  return `Semana del ${monStr} al ${sunStr}`;
}

/** Extrae de un tasksSnapshot (JSON string) el texto plano de los entrenos:
 *  cada bloque WORKOUT/VIDEO como "Título\nbody...\n\nOtro título...". */
function extractWorkoutText(snapshot: string | null): string {
  if (!snapshot) return "";
  try {
    const tasks = JSON.parse(snapshot) as any[];
    if (!Array.isArray(tasks)) return "";
    const chunks: string[] = [];
    for (const t of tasks) {
      if (t?.type === "FORM" || t?.type === "EVOLUTION") continue;
      const title = String(t?.title ?? "").trim();
      const body = String(t?.bodyText ?? t?.description ?? "").trim();
      const bit = [title, body].filter(Boolean).join("\n");
      if (bit) chunks.push(bit);
    }
    return chunks.join("\n\n");
  } catch {
    return "";
  }
}

export default async function PatientWodsTab({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!patient) notFound();

  const [logs, sessionsWithNotes] = await Promise.all([
    prisma.wodLog.findMany({
      where: { patientId: params.id },
      orderBy: { submittedAt: "desc" },
      take: 50,
    }),
    // Sesiones completadas de RECUPERA/CONSOLIDA con sensaciones del paciente.
    // Se rellena con el textarea obligatorio del nuevo botón "Marcar como
    // completada con mis sensaciones" en el runner de sesión.
    prisma.programSession.findMany({
      where: {
        assignment: { patientId: params.id },
        patientNotes: { not: null },
        completedAt: { not: null },
      },
      orderBy: { completedAt: "desc" },
      take: 40,
      include: { assignment: { include: { program: { select: { name: true } } } } },
    }),
  ]);

  return (
    <div>
      {/* ── Registro de sesiones + sensaciones, AGRUPADO POR SEMANA ── */}
      <section className="mb-6">
        <header className="mb-3">
          <h2 className="font-medium">Registro de sensaciones tras sesión</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            {sessionsWithNotes.length === 0
              ? "Todavía no hay sensaciones registradas."
              : `${sessionsWithNotes.length} ${sessionsWithNotes.length === 1 ? "sesión con feedback" : "sesiones con feedback"}`}
          </p>
        </header>

        {sessionsWithNotes.length === 0 ? (
          <p className="text-sm text-neutral-500 text-center py-6 card">
            Al terminar cada sesión el paciente escribe cómo se ha sentido — aparecerá aquí en cuanto lo haga.
          </p>
        ) : (
          (() => {
            // Agrupamos por semana ISO (lunes UTC). Dentro de cada semana
            // ordenamos las sesiones ASCendente (L → D) para leer la semana
            // como un timeline vertical. Las semanas entre sí van de más
            // reciente a más antigua.
            const groups = new Map<string, { monday: Date; items: typeof sessionsWithNotes }>();
            for (const s of sessionsWithNotes) {
              const base = s.completedAt ?? s.scheduledDate;
              const monday = weekStartUtc(new Date(base));
              const key = monday.toISOString();
              if (!groups.has(key)) groups.set(key, { monday, items: [] });
              groups.get(key)!.items.push(s);
            }
            // Sort interno L→D dentro de cada semana.
            for (const g of groups.values()) {
              g.items.sort((a, b) => {
                const ta = new Date(a.scheduledDate ?? a.completedAt ?? 0).getTime();
                const tb = new Date(b.scheduledDate ?? b.completedAt ?? 0).getTime();
                return ta - tb;
              });
            }
            const orderedWeeks = Array.from(groups.values()).sort(
              (a, b) => b.monday.getTime() - a.monday.getTime()
            );
            const currentWeekKey = weekStartUtc(new Date()).toISOString();
            return (
              <div className="space-y-2">
                {orderedWeeks.map(({ monday, items }) => {
                  const isCurrent = monday.toISOString() === currentWeekKey;
                  return (
                    <details key={monday.toISOString()} className="card group" open={isCurrent}>
                      <summary className="flex justify-between items-center gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                        <div className="min-w-0">
                          <div className="font-medium text-sm">
                            {weekRangeLabel(monday)}
                            {isCurrent && <span className="ml-2 text-[10px] font-bold uppercase text-emerald-700">semana actual</span>}
                          </div>
                          <div className="text-xs text-neutral-500 mt-0.5">
                            {items.length} {items.length === 1 ? "sesión con feedback" : "sesiones con feedback"}
                          </div>
                        </div>
                        <span className="text-neutral-400 text-xs group-open:rotate-180 transition-transform">▼</span>
                      </summary>
                      <div className="mt-3 border-t border-neutral-100 pt-3 space-y-3">
                        {items.map((s) => {
                          const workoutText = extractWorkoutText(s.tasksSnapshot);
                          const when = new Date(s.scheduledDate ?? s.completedAt ?? Date.now());
                          const dayName = when.toLocaleDateString("es-ES", { weekday: "long" });
                          const dayDate = when.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
                          return (
                            <div key={s.id} className="rounded-lg border border-neutral-200 p-3 space-y-2">
                              <div className="flex justify-between items-baseline gap-2">
                                <div>
                                  <div className="font-semibold text-sm capitalize">
                                    {dayName} <span className="text-neutral-500 font-normal">· {dayDate}</span>
                                  </div>
                                  <div className="text-[11px] text-neutral-400 mt-0.5">
                                    Completada {s.completedAt ? fDateTime(s.completedAt) : "—"}
                                  </div>
                                </div>
                                <div className="text-xs text-neutral-500 text-right">
                                  {s.assignment.program.name}
                                </div>
                              </div>
                              {workoutText && (
                                <div>
                                  <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-medium mb-1">
                                    Entreno de la sesión
                                  </div>
                                  <pre className="text-xs text-neutral-800 whitespace-pre-wrap font-mono bg-neutral-50 rounded-lg p-3">
                                    {workoutText}
                                  </pre>
                                </div>
                              )}
                              <div>
                                <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-medium mb-1">
                                  Sensaciones del paciente
                                </div>
                                <p className="text-sm text-neutral-800 whitespace-pre-wrap">{s.patientNotes}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}
              </div>
            );
          })()
        )}
      </section>

      <header className="mb-4">
        <h2 className="font-medium">WODs registrados</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          {logs.length === 0 ? "Sin registros todavía" : `${logs.length} ${logs.length === 1 ? "WOD registrado" : "WODs registrados"}`}
          {logs.length === 50 && " (mostrando los 50 más recientes)"}
        </p>
      </header>

      {logs.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-12 card">
          El paciente todavía no ha registrado ningún WOD desde la pestaña de adaptación.
        </p>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <details key={log.id} className="card group">
              <summary className="flex justify-between items-center gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{fDateTime(log.submittedAt)}</div>
                  <div className="text-xs text-neutral-500 truncate mt-0.5">
                    {(log.rawText || "").replace(/\s*\n\s*/g, " / ").slice(0, 100)}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-xs text-right">
                    {log.rpe !== null && (
                      <div className="text-neutral-700">
                        RPE <span className="font-medium">{log.rpe}</span>
                      </div>
                    )}
                    {log.painScore !== null && log.painScore > 0 && (
                      <div className="text-amber-700 mt-0.5">Dolor {log.painScore}/10</div>
                    )}
                  </div>
                  <span className="text-neutral-400 text-xs group-open:rotate-180 transition-transform">▼</span>
                </div>
              </summary>

              <div className="mt-3 border-t border-neutral-100 pt-3 space-y-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-medium mb-1">WOD del entrenador (lo que escribió)</div>
                  <pre className="text-xs text-neutral-800 whitespace-pre-wrap font-mono bg-neutral-50 rounded-lg p-3">{log.rawText || "—"}</pre>
                </div>
                {log.adaptedText && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-medium mb-1">Versión adaptada</div>
                    <pre className="text-xs text-neutral-800 whitespace-pre-wrap font-mono bg-emerald-50 rounded-lg p-3">{log.adaptedText}</pre>
                  </div>
                )}
                {log.notes && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-medium mb-1">Notas del paciente</div>
                    <p className="text-xs italic text-neutral-700">{log.notes}</p>
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
