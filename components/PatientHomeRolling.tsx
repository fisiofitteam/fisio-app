"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type RollingTask = {
  id: string;
  type: string;
  title: string;
  bodyText: string | null;
  youtubeUrl: string | null;
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

export function PatientHomeRolling({
  firstName,
  mode,
  weekStartIso,
  title,
  days,
  daysToExpire,
}: {
  firstName: string;
  patientId: string;
  mode: "ready" | "pending" | "expired";
  weekStartIso: string;
  title?: string | null;
  days: RollingDay[];
  daysToExpire?: number | null;
}) {
  const initial = firstName[0]?.toUpperCase() ?? "?";

  if (mode === "expired") {
    return (
      <main className="min-h-screen flex items-center justify-center px-5" style={{ color: "#FAFAFA" }}>
        <div className="max-w-md w-full text-center py-10">
          <Link href="/" className="inline-flex items-center gap-1 text-xs mb-8" style={{ color: "#737373" }}>
            <ArrowLeft size={12} /> Cambiar usuario
          </Link>
          <div className="text-5xl mb-4">⏰</div>
          <h1 className="text-2xl font-bold mb-2" style={{ letterSpacing: "-0.03em" }}>
            Tu programa ha caducado
          </h1>
          <p className="text-sm" style={{ color: "#A3A3A3" }}>
            Habla con tu coach para renovar y volver a tener acceso al contenido semanal.
          </p>
        </div>
      </main>
    );
  }

  // Construir mapa dow → tasks (para mostrar 5 días aunque algunos estén vacíos)
  const daysByDow: Record<number, RollingTask[]> = {};
  for (let i = 1; i <= 5; i++) daysByDow[i] = [];
  for (const d of days) daysByDow[d.dayOfWeek] = d.tasks;

  const today = new Date();
  const todayDow = today.getDay() === 0 ? 7 : today.getDay(); // 1-7

  return (
    <main className="min-h-screen" style={{ color: "#FAFAFA" }}>
      <div className="relative max-w-md mx-auto px-5 py-7 pb-28">
        {/* Header */}
        <header className="mb-7">
          <div className="flex justify-between items-center mb-5">
            <Link href="/" className="inline-flex items-center gap-1 text-xs" style={{ color: "#737373" }}>
              <ArrowLeft size={12} /> Cambiar usuario
            </Link>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: "#A3A3A3" }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#22C55E" }} />
              Sesión activa
            </div>
          </div>

          <div className="flex items-center gap-3 mb-5">
            <div
              className="flex items-center justify-center font-bold flex-shrink-0"
              style={{
                width: 52, height: 52, borderRadius: 14,
                background: "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)",
                color: "#0A0A0A",
                fontSize: 22,
                letterSpacing: "-0.03em",
              }}
            >
              {initial}
            </div>
            <div>
              <div className="text-2xl font-bold" style={{ letterSpacing: "-0.03em" }}>
                Hola, {firstName}
              </div>
              <div className="text-xs" style={{ color: "#737373" }}>
                Esta es tu semana
              </div>
            </div>
          </div>

          {daysToExpire !== null && daysToExpire !== undefined && daysToExpire <= 14 && daysToExpire >= 0 && (
            <div
              className="rounded-xl px-4 py-3 mb-3 text-sm"
              style={{
                background: daysToExpire <= 7 ? "rgba(239, 68, 68, 0.10)" : "rgba(251, 191, 36, 0.10)",
                border: `1px solid ${daysToExpire <= 7 ? "rgba(239, 68, 68, 0.30)" : "rgba(251, 191, 36, 0.30)"}`,
                color: daysToExpire <= 7 ? "#FCA5A5" : "#FBBF24",
              }}
            >
              <div className="font-medium">⏰ Tu programa caduca en {daysToExpire} {daysToExpire === 1 ? "día" : "días"}</div>
              <div className="text-xs mt-0.5" style={{ color: "#A3A3A3" }}>
                Habla con tu coach para renovar.
              </div>
            </div>
          )}
        </header>

        <div className="text-[11px] font-medium mb-1 tracking-wider" style={{ color: "#737373" }}>
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
            style={{ background: "#171717", border: "1px solid #262626" }}
          >
            <div className="text-3xl mb-2">⚒️</div>
            <p className="text-sm" style={{ color: "#A3A3A3" }}>
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
                    background: isToday ? "rgba(252, 211, 77, 0.08)" : "#171717",
                    border: `1px solid ${isToday ? "rgba(252, 211, 77, 0.25)" : "#262626"}`,
                    opacity: isPast ? 0.6 : 1,
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[11px] font-bold tracking-wider" style={{ color: isToday ? "#FCD34D" : "#737373" }}>
                      {DAY_NAMES[dow].toUpperCase()}{isToday ? " · HOY" : ""}
                    </div>
                  </div>

                  {tasks.length === 0 ? (
                    <p className="text-xs italic" style={{ color: "#525252" }}>Día de descanso</p>
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
      </div>
    </main>
  );
}

function RollingTaskCard({ task }: { task: RollingTask }) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "#0F0F0F", border: "1px solid #262626" }}
    >
      <div className="flex items-start gap-2 mb-1">
        <div className="text-base">{TYPE_ICONS[task.type] || "•"}</div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm" style={{ letterSpacing: "-0.01em" }}>
            {task.title}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: "#737373" }}>
            {TYPE_LABELS[task.type] || task.type}
          </div>
        </div>
      </div>

      {task.bodyText && (
        <div className="text-xs whitespace-pre-wrap mt-2 leading-relaxed" style={{ color: "#A3A3A3" }}>
          {task.bodyText}
        </div>
      )}

      {task.youtubeUrl && (
        <a
          href={task.youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs mt-2 hover:underline"
          style={{ color: "#FCD34D" }}
        >
          Abrir vídeo →
        </a>
      )}
    </div>
  );
}
