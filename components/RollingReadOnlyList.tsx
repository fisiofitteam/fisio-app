"use client";

/**
 * Vista de solo lectura de N semanas de rolling. La usan los fisios en
 * /fisio/rolling-lectura para consultar qué hay programado sin tocar nada.
 */

const DAY_NAMES = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

const TYPE_ICONS: Record<string, string> = {
  WORKOUT: "💪",
  VIDEO: "🎥",
  FORM: "📝",
  EVOLUTION: "📊",
};

type Task = { id: string; type: string; title: string; bodyText: string | null; videoId: string | null; order: number };
type Day = { dayOfWeek: number; tasks: Task[] };
type Week = { id: string; weekStartDate: string; title: string | null; publishedAt: string | null; days: Day[] };

export function RollingReadOnlyList({ weeks }: { weeks: Week[] }) {
  if (weeks.length === 0) {
    return (
      <div className="card text-center py-8 text-sm text-neutral-500 italic">
        No hay semanas programadas para la próxima quincena.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {weeks.map((w) => (
        <section key={w.id} className="card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-medium text-sm">
                Semana del {new Date(w.weekStartDate).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}
                {w.title && <span className="ml-2 text-neutral-500 font-normal">· {w.title}</span>}
              </h2>
            </div>
            {!w.publishedAt && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Borrador (no visible al atleta)</span>}
          </div>

          {w.days.length === 0 ? (
            <p className="text-xs text-neutral-400 italic">Sin días programados.</p>
          ) : (
            <div className="space-y-2.5">
              {w.days.map((d) => (
                <div key={d.dayOfWeek} className="border-l-2 border-neutral-200 pl-3">
                  <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">
                    {DAY_NAMES[d.dayOfWeek]}
                  </div>
                  {d.tasks.length === 0 ? (
                    <div className="text-xs text-neutral-400 italic">—</div>
                  ) : (
                    <div className="space-y-1.5">
                      {d.tasks.map((t) => (
                        <div key={t.id} className="rounded-md border border-neutral-200 bg-neutral-50 p-2.5">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-sm">{TYPE_ICONS[t.type] || "•"}</span>
                            <span className="text-sm font-medium">{t.title}</span>
                          </div>
                          {t.bodyText && (
                            <div className="text-xs text-neutral-600 mt-1 whitespace-pre-wrap">
                              {t.bodyText}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
