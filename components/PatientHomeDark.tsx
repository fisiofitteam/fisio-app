"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Zap,
  Calendar,
  ClipboardList,
  BookOpen,
  Activity,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { PatientNav } from "@/components/PatientNav";
import { PatientSessionMenu, patientLogout } from "@/components/PatientSessionMenu";

type TodaySession = {
  id: string;
  programName: string;
  completed: boolean;
  tasksCount: number;
};

type NextSession = {
  id: string;
  date: string;
  programName: string;
  tasksCount: number;
};

type Patient = {
  id: string;
  firstName: string;
  programType: string | null;
  difficulty: string | null;
  appliedLevelName: string | null;
};

type Adherence = {
  completed: number;
  total: number;
  percentage: number;
};

const DAY_NAMES = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export function PatientHomeDark({
  patient,
  todaySessions,
  nextSession,
  adherence,
  upcomingPause,
  notifications,
}: {
  patient: Patient;
  todaySessions: TodaySession[];
  nextSession: NextSession | null;
  adherence: Adherence | null;
  upcomingPause?: { startDate: string; endDate: string } | null;
  notifications?: { id: string; type: string; title: string; body: string }[];
}) {
  const dow = new Date().getDay() === 0 ? 7 : new Date().getDay();
  const todayDate = new Date();
  const initial = patient.firstName[0]?.toUpperCase() ?? "?";

  // Estado local para ocultar notificaciones tras marcarlas leídas
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visibleNotifications = (notifications || []).filter((n) => !dismissed.has(n.id));

  async function dismissNotification(id: string) {
    setDismissed((prev) => new Set([...prev, id]));
    fetch("/api/patient-notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  return (
    <main className="min-h-screen text-white" style={{ color: "#FAFAFA" }}>
      <div className="relative max-w-md mx-auto px-5 py-7 pb-28">
        {/* Notificaciones persistentes (vacaciones del fisio, etc) */}
        {visibleNotifications.map((n) => (
          <div
            key={n.id}
            className="mb-3 rounded-xl px-4 py-3 text-sm"
            style={{
              background: "rgba(34, 197, 94, 0.10)",
              border: "1px solid rgba(34, 197, 94, 0.30)",
              color: "#86EFAC",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="font-medium mb-1">🎁 {n.title}</div>
                <div className="text-xs leading-relaxed" style={{ color: "#A3A3A3" }}>
                  {n.body}
                </div>
              </div>
              <button
                onClick={() => dismissNotification(n.id)}
                className="text-xs px-2 py-1 rounded shrink-0"
                style={{ background: "rgba(34, 197, 94, 0.2)", color: "#86EFAC" }}
              >
                OK
              </button>
            </div>
          </div>
        ))}

        {upcomingPause && (
          <div
            className="mb-5 rounded-xl px-4 py-3 text-sm"
            style={{
              background: "rgba(251, 191, 36, 0.10)",
              border: "1px solid rgba(251, 191, 36, 0.30)",
              color: "#FBBF24",
            }}
          >
            <div className="font-medium mb-0.5">📅 Pausa programada</div>
            <div className="text-xs" style={{ color: "#A3A3A3" }}>
              Del {new Date(upcomingPause.startDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} al{" "}
              {new Date(upcomingPause.endDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}.
              Tu programa se reanuda automáticamente.
            </div>
          </div>
        )}
        {/* Header */}
        <header className="mb-7">
          <div className="flex justify-between items-center mb-5">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-xs"
              style={{ color: "#737373" }}
            >
              <ArrowLeft size={12} /> Cambiar usuario
            </Link>
            <PatientSessionMenu />
          </div>

          {/* Avatar + saludo */}
          <div className="flex items-center gap-3 mb-5">
            <button
              type="button"
              title="Cerrar sesión"
              onClick={() => { if (confirm("¿Cerrar sesión?")) patientLogout(); }}
              className="flex items-center justify-center font-bold flex-shrink-0 cursor-pointer"
              style={{
                width: 52, height: 52, borderRadius: 14,
                background: "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)",
                color: "#0A0A0A",
                fontSize: 22,
                letterSpacing: "-0.03em",
                border: "none",
              }}
            >
              {initial}
            </button>
            <div>
              <div className="text-xs" style={{ color: "#A3A3A3" }}>Bienvenido</div>
              <div className="text-lg font-semibold" style={{ letterSpacing: "-0.025em" }}>
                {patient.firstName}
              </div>
            </div>
          </div>

          {/* Frase de marca */}
          <h1
            className="font-bold"
            style={{
              fontSize: 30,
              lineHeight: 1.05,
              letterSpacing: "-0.035em",
            }}
          >
            Lo difícil era empezar.<br />
            <span className="brand-gradient-text">Ya estás aquí.</span>
          </h1>

          <p className="text-xs mt-3" style={{ color: "#737373" }}>
            {DAY_NAMES[dow]}, {todayDate.toLocaleDateString("es-ES", { day: "numeric", month: "long" })}
          </p>
        </header>

        {/* Grid de accesos */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <ActionCard
            href={`/paciente/${patient.id}/wod`}
            Icon={Zap}
            label="Adaptar WOD"
            sublabel="Pega tu workout"
            highlight
          />
          <ActionCard
            href={`/paciente/${patient.id}/semana`}
            Icon={Calendar}
            label="Mi semana"
            sublabel="Plan de los próximos días"
          />
          <ActionCard
            href={`/paciente/${patient.id}/adaptaciones`}
            Icon={ClipboardList}
            label="Adaptaciones"
            sublabel="Mis restricciones"
          />
          <ActionCard
            href={`/paciente/${patient.id}/biblioteca`}
            Icon={BookOpen}
            label="Biblioteca"
            sublabel="Recursos y vídeos"
          />
        </div>

        {/* Plan de hoy / próxima sesión - card destacada */}
        <div
          id="plan-de-hoy"
          className="rounded-2xl p-4 mb-6 scroll-mt-4"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Activity size={16} style={{ color: "#FCD34D" }} />
            <h2 className="text-sm font-semibold" style={{ letterSpacing: "-0.015em" }}>
              Plan de hoy
            </h2>
          </div>

          {todaySessions.length === 0 ? (
            <>
              <p className="text-sm py-2" style={{ color: "#A3A3A3" }}>
                💤 Hoy descansas. ¡Aprovecha!
              </p>
              {nextSession && (
                <Link
                  href={`/paciente/${patient.id}/sesion/${nextSession.id}`}
                  className="block mt-3 pt-3"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="text-[10px] uppercase mb-1.5" style={{ color: "#737373", letterSpacing: "0.1em" }}>
                    Próxima sesión
                  </div>
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm font-medium capitalize" style={{ letterSpacing: "-0.015em" }}>
                        {new Date(nextSession.date).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "#A3A3A3" }}>
                        {nextSession.programName} · {nextSession.tasksCount} tareas
                      </div>
                    </div>
                    <ChevronRight size={18} style={{ color: "#FCD34D" }} />
                  </div>
                </Link>
              )}
            </>
          ) : (
            <div className="space-y-2">
              {todaySessions.map((s) => (
                <Link
                  key={s.id}
                  href={`/paciente/${patient.id}/sesion/${s.id}`}
                  className="block p-3 rounded-xl"
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium" style={{ letterSpacing: "-0.015em" }}>
                        {s.programName}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "#A3A3A3" }}>
                        {s.tasksCount} {s.tasksCount === 1 ? "tarea" : "tareas"}
                      </div>
                    </div>
                    {s.completed ? (
                      <span
                        className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: "#FCD34D", color: "#0A0A0A" }}
                      >
                        ✓ Hecho
                      </span>
                    ) : (
                      <ChevronRight size={18} style={{ color: "#FCD34D" }} />
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Cumplimiento */}
        {adherence && (
          <div
            className="rounded-2xl p-4 mb-6"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold" style={{ letterSpacing: "-0.015em" }}>
                Tu cumplimiento
              </h2>
            </div>

            <div
              className="w-full h-2.5 rounded-full overflow-hidden mb-3"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${adherence.percentage}%`,
                  background: "linear-gradient(90deg, #FCD34D 0%, #F59E0B 100%)",
                }}
              />
            </div>
            <div className="text-3xl font-bold brand-gradient-text" style={{ letterSpacing: "-0.03em" }}>
              {adherence.percentage}%
            </div>
          </div>
        )}
      </div>

      <PatientNav patientId={patient.id} active="home" />
    </main>
  );
}

function ActionCard({
  href,
  Icon,
  label,
  sublabel,
  highlight,
}: {
  href: string;
  Icon: any;
  label: string;
  sublabel: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl p-4 transition-transform active:scale-95"
      style={{
        background: highlight ? "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)" : "rgba(255,255,255,0.04)",
        color: highlight ? "#0A0A0A" : "#FAFAFA",
        border: highlight ? "none" : "1px solid rgba(255,255,255,0.08)",
        minHeight: 130,
      }}
    >
      <div className="flex flex-col h-full justify-between">
        <Icon
          size={28}
          strokeWidth={2}
          style={{ color: highlight ? "#0A0A0A" : "#FCD34D" }}
        />
        <div className="mt-auto">
          <div className="font-semibold text-sm" style={{ letterSpacing: "-0.02em" }}>
            {label}
          </div>
          <div
            className="text-[11px] mt-0.5"
            style={{
              color: highlight ? "rgba(10,10,10,0.7)" : "#A3A3A3",
              letterSpacing: "-0.005em",
            }}
          >
            {sublabel}
          </div>
        </div>
      </div>
    </Link>
  );
}
