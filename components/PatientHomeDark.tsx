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
  Settings,
  Users,
} from "lucide-react";

// Icono de WhatsApp compatible con la API de Lucide (acepta size + style.color).
// El fill usa currentColor para que herede el color del style del padre.
function WhatsAppIcon({ size = 22, style, className }: { size?: number; strokeWidth?: number; style?: React.CSSProperties; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="currentColor"
      style={style}
      className={className}
      aria-hidden
    >
      <path d="M16 .5C7.4.5.5 7.4.5 16c0 2.8.7 5.4 2 7.8L.5 31.5l7.9-2.1c2.3 1.2 4.9 1.9 7.6 1.9 8.6 0 15.5-6.9 15.5-15.5S24.6.5 16 .5zm0 28c-2.4 0-4.7-.6-6.7-1.8l-.5-.3-4.7 1.2 1.3-4.6-.3-.5C3.9 20.5 3.2 18.3 3.2 16 3.2 8.9 8.9 3.2 16 3.2S28.8 8.9 28.8 16 23.1 28.5 16 28.5zm7.4-9.4c-.4-.2-2.4-1.2-2.7-1.3-.4-.1-.6-.2-.9.2-.3.4-1 1.3-1.2 1.5-.2.2-.4.3-.8.1-.4-.2-1.7-.6-3.2-2-1.2-1.1-2-2.4-2.2-2.8-.2-.4 0-.6.2-.8.2-.2.4-.4.5-.7.2-.2.2-.4.4-.6.1-.3 0-.5 0-.7-.1-.2-.9-2.1-1.2-2.9-.3-.8-.6-.7-.9-.7h-.7c-.2 0-.6.1-1 .5-.3.4-1.3 1.3-1.3 3.1s1.3 3.6 1.5 3.9c.2.2 2.6 4 6.3 5.6.9.4 1.6.6 2.1.8.9.3 1.7.2 2.3.1.7-.1 2.4-1 2.7-1.9.3-.9.3-1.7.2-1.9-.1-.2-.3-.3-.7-.5z" />
    </svg>
  );
}
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
  whatsappGroupUrl: string | null;
  photoUrl: string | null;
  shippingComplete: boolean;
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
  welcomeLine1 = "Lo difícil era empezar.",
  welcomeLine2 = "Ya estás aquí.",
}: {
  patient: Patient;
  todaySessions: TodaySession[];
  nextSession: NextSession | null;
  adherence: Adherence | null;
  upcomingPause?: { startDate: string; endDate: string } | null;
  notifications?: { id: string; type: string; title: string; body: string }[];
  welcomeLine1?: string;
  welcomeLine2?: string;
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
    <main className="min-h-screen text-white" style={{ color: "var(--p-text)" }}>
      <div className="relative max-w-md mx-auto px-5 py-7 pb-28">
        {/* Notificaciones persistentes (vacaciones del fisio, etc) */}
        {visibleNotifications.map((n) => (
          <div
            key={n.id}
            className="mb-3 rounded-xl px-4 py-3 text-sm"
            style={{
              background: "var(--p-green-bg)",
              border: "1px solid var(--p-green-border)",
              color: "var(--p-green-text)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="font-medium mb-1">🎁 {n.title}</div>
                <div className="text-xs leading-relaxed" style={{ color: "var(--p-text-dim)" }}>
                  {n.body}
                </div>
              </div>
              <button
                onClick={() => dismissNotification(n.id)}
                className="text-xs px-2 py-1 rounded shrink-0"
                style={{ background: "var(--p-green-chip-bg)", color: "var(--p-green-text)" }}
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
              background: "var(--p-amber-bg)",
              border: "1px solid var(--p-amber-border)",
              color: "var(--p-amber-text)",
            }}
          >
            <div className="font-medium mb-0.5">📅 Pausa programada</div>
            <div className="text-xs" style={{ color: "var(--p-text-dim)" }}>
              Del {new Date(upcomingPause.startDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} al{" "}
              {new Date(upcomingPause.endDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}.
              Tu programa se reanuda automáticamente.
            </div>
          </div>
        )}

        {!patient.photoUrl && (
          <Link
            href={`/paciente/${patient.id}/ajustes#foto`}
            className="mb-5 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3"
            style={{
              background: "var(--p-amber-bg)",
              border: "1px solid var(--p-amber-border)",
              color: "var(--p-amber-text)",
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium mb-0.5">📸 Sube tu foto de perfil</div>
              <div className="text-xs" style={{ color: "var(--p-text-dim)" }}>
                Para que el equipo y la comunidad te reconozcan. Tarda 10 segundos.
              </div>
            </div>
            <span className="text-xs font-medium underline flex-shrink-0">Subir</span>
          </Link>
        )}

        {!patient.shippingComplete && (
          <Link
            href={`/paciente/${patient.id}/ajustes#direccion`}
            className="mb-5 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3"
            style={{
              background: "var(--p-amber-bg)",
              border: "1px solid var(--p-amber-border)",
              color: "var(--p-amber-text)",
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium mb-0.5">📮 Completa tu dirección postal</div>
              <div className="text-xs" style={{ color: "var(--p-text-dim)" }}>
                Faltan datos de contacto básicos en tu ficha.
              </div>
            </div>
            <span className="text-xs font-medium underline flex-shrink-0">Completar</span>
          </Link>
        )}
        {/* Header */}
        <header className="mb-7">
          <div className="flex justify-between items-center mb-5">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-xs"
              style={{ color: "var(--p-text-faint)" }}
            >
              <ArrowLeft size={12} /> Cambiar usuario
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href={`/paciente/${patient.id}/ajustes`}
                title="Ajustes"
                className="p-1.5 rounded-lg"
                style={{ color: "var(--p-text-dim)" }}
              >
                <Settings size={18} />
              </Link>
              <PatientSessionMenu />
            </div>
          </div>

          {/* Avatar + saludo + acceso a seguimiento (WhatsApp) */}
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              title="Cerrar sesión"
              onClick={() => { if (confirm("¿Cerrar sesión?")) patientLogout(); }}
              className="flex items-center justify-center font-bold flex-shrink-0 cursor-pointer overflow-hidden"
              style={{
                width: 52, height: 52, borderRadius: 14,
                background: patient.photoUrl ? "transparent" : "linear-gradient(135deg, var(--p-accent) 0%, #F59E0B 100%)",
                color: "var(--p-accent-ink)",
                fontSize: 22,
                letterSpacing: "-0.03em",
                border: patient.photoUrl ? "1px solid var(--p-border-strong)" : "none",
              }}
            >
              {patient.photoUrl ? (
                <img src={patient.photoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                initial
              )}
            </button>
            <div>
              <div className="text-xs" style={{ color: "var(--p-text-dim)" }}>Bienvenido</div>
              <div className="text-lg font-semibold" style={{ letterSpacing: "-0.025em" }}>
                {patient.firstName}
              </div>
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
            {welcomeLine1}<br />
            <span className="brand-gradient-text">{welcomeLine2}</span>
          </h1>

          <p className="text-xs mt-3" style={{ color: "var(--p-text-faint)" }}>
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
          <ActionCard
            href={`/paciente/${patient.id}/comunidad`}
            Icon={Users}
            label="Comunidad"
            sublabel="Equipo y otros atletas"
          />
          {patient.whatsappGroupUrl && (
            <ActionCard
              href={patient.whatsappGroupUrl}
              Icon={WhatsAppIcon}
              label="Mi seguimiento"
              sublabel="Grupo de WhatsApp"
              external
            />
          )}
        </div>

        {/* Plan de hoy / próxima sesión - card destacada */}
        <div
          id="plan-de-hoy"
          className="rounded-2xl p-4 mb-6 scroll-mt-4"
          style={{
            background: "var(--p-surface)",
            border: "1px solid var(--p-border)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Activity size={16} style={{ color: "var(--p-accent)" }} />
            <h2 className="text-sm font-semibold" style={{ letterSpacing: "-0.015em" }}>
              Plan de hoy
            </h2>
          </div>

          {todaySessions.length === 0 ? (
            <>
              <p className="text-sm py-2" style={{ color: "var(--p-text-dim)" }}>
                💤 Hoy descansas. ¡Aprovecha!
              </p>
              {nextSession && (
                <Link
                  href={`/paciente/${patient.id}/sesion/${nextSession.id}`}
                  className="block mt-3 pt-3"
                  style={{ borderTop: "1px solid var(--p-border)" }}
                >
                  <div className="text-[10px] uppercase mb-1.5" style={{ color: "var(--p-text-faint)", letterSpacing: "0.1em" }}>
                    Próxima sesión
                  </div>
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm font-medium capitalize" style={{ letterSpacing: "-0.015em" }}>
                        {new Date(nextSession.date).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--p-text-dim)" }}>
                        {nextSession.programName} · {nextSession.tasksCount} tareas
                      </div>
                    </div>
                    <ChevronRight size={18} style={{ color: "var(--p-accent)" }} />
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
                    border: "1px solid var(--p-surface-2)",
                  }}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium" style={{ letterSpacing: "-0.015em" }}>
                        {s.programName}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--p-text-dim)" }}>
                        {s.tasksCount} {s.tasksCount === 1 ? "tarea" : "tareas"}
                      </div>
                    </div>
                    {s.completed ? (
                      <span
                        className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: "var(--p-accent)", color: "var(--p-accent-ink)" }}
                      >
                        ✓ Hecho
                      </span>
                    ) : (
                      <ChevronRight size={18} style={{ color: "var(--p-accent)" }} />
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
              background: "var(--p-surface)",
              border: "1px solid var(--p-border)",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold" style={{ letterSpacing: "-0.015em" }}>
                Tu cumplimiento
              </h2>
            </div>

            <div
              className="w-full h-2.5 rounded-full overflow-hidden mb-3"
              style={{ background: "var(--p-border)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${adherence.percentage}%`,
                  background: "linear-gradient(90deg, var(--p-accent) 0%, #F59E0B 100%)",
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
  external,
}: {
  href: string;
  Icon: any;
  label: string;
  sublabel: string;
  highlight?: boolean;
  external?: boolean;
}) {
  const className = "block rounded-2xl px-3 py-3 transition-transform active:scale-95";
  const style = {
    background: highlight ? "linear-gradient(135deg, var(--p-accent) 0%, #F59E0B 100%)" : "var(--p-surface)",
    color: highlight ? "var(--p-accent-ink)" : "var(--p-text)",
    border: highlight ? "none" : "1px solid var(--p-border)",
  } as const;
  const content = (
    <div className="flex items-center gap-2.5">
      <Icon
        size={22}
        strokeWidth={2}
        className="flex-shrink-0"
        style={{ color: highlight ? "var(--p-accent-ink)" : "var(--p-accent)" }}
      />
      <div className="min-w-0">
        <div className="font-semibold text-sm leading-tight truncate" style={{ letterSpacing: "-0.02em" }}>
          {label}
        </div>
        <div
          className="text-[10px] leading-tight truncate"
          style={{
            color: highlight ? "rgba(10,10,10,0.7)" : "var(--p-text-dim)",
            letterSpacing: "-0.005em",
          }}
        >
          {sublabel}
        </div>
      </div>
    </div>
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} style={style}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={className} style={style}>
      {content}
    </Link>
  );
}
