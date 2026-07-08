"use client";

import Link from "next/link";

type RollingTask = {
  id: string;
  type: string;
  title: string;
  bodyText: string | null;
  youtubeUrl: string | null;
  blockLabel?: string;
  blockColor?: string;
};

type RollingDay = {
  dayOfWeek: number;
  tasks: RollingTask[];
};

const DAY_NAMES = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

const TYPE_LABELS: Record<string, string> = {
  WORKOUT: "Workout",
  VIDEO: "Vídeo",
  FORM: "Formulario",
  EVOLUTION: "Evolución",
};

const TYPE_ICONS: Record<string, string> = {
  WORKOUT: "💪",
  VIDEO: "🎥",
  FORM: "📝",
  EVOLUTION: "📊",
};

function formatWeekLabel(iso: string): string {
  const d = new Date(iso);
  const end = new Date(d);
  end.setDate(d.getDate() + 4);
  const startStr = d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  const endStr = end.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
  return `${startStr} – ${endStr}`;
}

/**
 * Vista compartida "Semana completa" del programa rolling ADVANCE.
 * Muestra los 5 días L-V con sus tareas, resaltando "HOY".
 *
 * Se usa dentro de /paciente/[id]/semana-completa. Antes vivía inline en el
 * home del paciente pero la CEO pidió moverlo a su propia pantalla y dejar
 * el home más liviano.
 */
export function RollingWeekView({
  mode,
  weekStartIso,
  title,
  days,
}: {
  mode: "ready" | "pending";
  weekStartIso: string;
  title?: string | null;
  days: RollingDay[];
}) {
  // Mapa dow → tasks para pintar los 5 días aunque alguno esté vacío
  const daysByDow: Record<number, RollingTask[]> = {};
  for (let i = 1; i <= 5; i++) daysByDow[i] = [];
  for (const d of days) daysByDow[d.dayOfWeek] = d.tasks;

  const today = new Date();
  const todayDow = today.getDay() === 0 ? 7 : today.getDay();

  return (
    <>
      <div className="text-[11px] font-medium mb-1 tracking-wider" style={{ color: "var(--p-text-faint)" }}>
        SEMANA · {formatWeekLabel(weekStartIso).toUpperCase()}
      </div>
      {title && (
        <h2 className="text-xl font-bold mb-5" style={{ letterSpacing: "-0.025em" }}>
          {title}
        </h2>
      )}

      {mode === "pending" && (
        <section
          className="rounded-2xl p-5 text-center py-10"
          style={{ background: "var(--p-surface-2)", border: "1px solid var(--p-border)" }}
        >
          <div className="text-3xl mb-2">⚒️</div>
          <p className="text-sm" style={{ color: "var(--p-text-dim)" }}>
            Tu coach está preparando la semana.
          </p>
        </section>
      )}

      {mode === "ready" && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((dow) => {
            const tasks = daysByDow[dow];
            const isToday = dow === todayDow;
            const isPast = dow < todayDow;
            return (
              <section
                key={dow}
                className="rounded-2xl p-4"
                style={{
                  background: isToday ? "rgba(252, 211, 77, 0.08)" : "var(--p-surface-2)",
                  border: `1px solid ${isToday ? "rgba(252, 211, 77, 0.25)" : "var(--p-border)"}`,
                  opacity: isPast ? 0.6 : 1,
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div
                    className="text-[11px] font-bold tracking-wider"
                    style={{ color: isToday ? "var(--p-accent)" : "var(--p-text-faint)" }}
                  >
                    {DAY_NAMES[dow].toUpperCase()}{isToday ? " · HOY" : ""}
                  </div>
                </div>

                {tasks.length === 0 ? (
                  <p className="text-xs italic" style={{ color: "var(--p-text-faint)" }}>Día de descanso</p>
                ) : (
                  <div className="space-y-2">
                    {tasks.map((t) => (
                      <RollingTaskCard key={t.id} task={t} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function RollingTaskCard({ task }: { task: RollingTask }) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}
    >
      {task.blockLabel && (
        <div
          className="inline-flex items-center text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded mb-1.5"
          style={{
            background: `${task.blockColor || "#3B82F6"}33`,
            color: task.blockColor || "#3B82F6",
          }}
        >
          {task.blockLabel.toUpperCase()}
        </div>
      )}
      <div className="flex items-start gap-2 mb-1">
        <div className="text-base">{TYPE_ICONS[task.type] || "•"}</div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm" style={{ letterSpacing: "-0.01em" }}>
            {task.title}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: "var(--p-text-faint)" }}>
            {TYPE_LABELS[task.type] ?? task.type}
          </div>
        </div>
      </div>
      {task.bodyText && (
        <div className="text-xs whitespace-pre-wrap mt-2 leading-relaxed" style={{ color: "var(--p-text-dim)" }}>
          {task.bodyText}
        </div>
      )}
      {task.youtubeUrl && (
        <a
          href={task.youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs mt-2 hover:underline"
          style={{ color: "var(--p-accent)" }}
        >
          Abrir vídeo →
        </a>
      )}
    </div>
  );
}
