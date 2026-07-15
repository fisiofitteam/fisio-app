"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { RollingExerciseVideos, type RollingExercise } from "@/components/RollingExerciseVideos";
import { TaskTimerButton } from "@/components/TaskTimerButton";

type RollingTask = {
  id: string;
  type: string;
  title: string;
  bodyText: string | null;
  youtubeUrl: string | null;
  exercises?: RollingExercise[];
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
 * Cada día es una fila colapsable — por defecto todo cerrado excepto HOY.
 * Al desplegar, las tareas se pintan con la misma tipografía grande que
 * "Sesión de hoy" para consistencia visual.
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
          {[1, 2, 3, 4, 5].map((dow) => (
            <DayRow
              key={dow}
              dow={dow}
              tasks={daysByDow[dow]}
              isToday={dow === todayDow}
              isPast={dow < todayDow}
              // Solo abrimos "HOY" por defecto para que al entrar no se vea
              // toda la semana de golpe.
              defaultOpen={dow === todayDow}
            />
          ))}
        </div>
      )}
    </>
  );
}

function DayRow({
  dow,
  tasks,
  isToday,
  isPast,
  defaultOpen,
}: {
  dow: number;
  tasks: RollingTask[];
  isToday: boolean;
  isPast: boolean;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasTasks = tasks.length > 0;

  return (
    <section
      className="rounded-2xl overflow-hidden"
      style={{
        background: isToday ? "rgba(252, 211, 77, 0.08)" : "var(--p-surface-2)",
        border: `1px solid ${isToday ? "rgba(252, 211, 77, 0.25)" : "var(--p-border)"}`,
        opacity: isPast ? 0.7 : 1,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-baseline gap-2">
          <div
            className="text-sm font-bold tracking-wide"
            style={{ color: isToday ? "var(--p-accent)" : "var(--p-text)" }}
          >
            {DAY_NAMES[dow]}
            {isToday && (
              <span className="ml-2 text-[10px] font-bold uppercase tracking-wider">
                · HOY
              </span>
            )}
          </div>
          <div className="text-[11px]" style={{ color: "var(--p-text-faint)" }}>
            {hasTasks
              ? `${tasks.length} ${tasks.length === 1 ? "tarea" : "tareas"}`
              : "descanso"}
          </div>
        </div>
        {hasTasks && (
          <div style={{ color: "var(--p-text-faint)" }} className="ml-2">
            {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        )}
      </button>

      {open && hasTasks && (
        <div className="px-4 pb-4 space-y-3">
          {tasks.map((t) => (
            <RollingTaskCard key={t.id} task={t} />
          ))}
        </div>
      )}
    </section>
  );
}

function RollingTaskCard({ task }: { task: RollingTask }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--p-surface)", border: "1px solid var(--p-border)" }}
    >
      {task.blockLabel && (
        <div
          className="inline-flex items-center text-[10px] font-bold tracking-wider px-2 py-0.5 rounded mb-2"
          style={{
            background: `${task.blockColor || "#3B82F6"}33`,
            color: task.blockColor || "#3B82F6",
          }}
        >
          {task.blockLabel.toUpperCase()}
        </div>
      )}
      <div className="flex items-start gap-2.5 mb-1">
        <div className="text-xl leading-none pt-0.5">{TYPE_ICONS[task.type] || "•"}</div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-base" style={{ letterSpacing: "-0.015em" }}>
            {task.title}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: "var(--p-text-faint)" }}>
            {TYPE_LABELS[task.type] ?? task.type}
          </div>
        </div>
      </div>
      {task.bodyText && (
        <div
          className="text-sm whitespace-pre-wrap mt-3 leading-relaxed"
          style={{ color: "var(--p-text-dim)" }}
        >
          {task.bodyText}
        </div>
      )}
      {task.youtubeUrl && (
        <a
          href={task.youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium mt-3 hover:underline"
          style={{ color: "var(--p-accent)" }}
        >
          Abrir vídeo →
        </a>
      )}
      {task.type === "WORKOUT" && (
        <TaskTimerButton taskTitle={task.title} taskBody={task.bodyText} />
      )}
      {/* En VIDEO también, por si el fisio mete el enunciado del trabajo
          en la descripción del vídeo demostrativo. */}
      {task.type === "VIDEO" && (
        <TaskTimerButton taskTitle={task.title} taskBody={task.bodyText} />
      )}
      {task.exercises && task.exercises.length > 0 && (
        <RollingExerciseVideos exercises={task.exercises} />
      )}
    </div>
  );
}
