"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowLeft, Trophy, BarChart3, BookOpen, Users, Target, CalendarDays, Settings, Sparkles, Timer, History } from "lucide-react";
import { PatientSessionMenu, patientLogout } from "@/components/PatientSessionMenu";
import { PatientNav } from "@/components/PatientNav";
import { PatientShirtSizePicker } from "@/components/PatientShirtSizePicker";
import { PendingFormsBanner } from "@/components/PendingFormsBanner";
import { writeCachedProgramType } from "@/lib/patient-program-type-cache";

// Icono de WhatsApp en amarillo (currentColor para compat con la API de Lucide).
function WhatsAppIcon({ size = 22, style, className }: { size?: number; strokeWidth?: number; style?: React.CSSProperties; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="currentColor" style={style} className={className} aria-hidden>
      <path d="M16 .5C7.4.5.5 7.4.5 16c0 2.8.7 5.4 2 7.8L.5 31.5l7.9-2.1c2.3 1.2 4.9 1.9 7.6 1.9 8.6 0 15.5-6.9 15.5-15.5S24.6.5 16 .5zm0 28c-2.4 0-4.7-.6-6.7-1.8l-.5-.3-4.7 1.2 1.3-4.6-.3-.5C3.9 20.5 3.2 18.3 3.2 16 3.2 8.9 8.9 3.2 16 3.2S28.8 8.9 28.8 16 23.1 28.5 16 28.5zm7.4-9.4c-.4-.2-2.4-1.2-2.7-1.3-.4-.1-.6-.2-.9.2-.3.4-1 1.3-1.2 1.5-.2.2-.4.3-.8.1-.4-.2-1.7-.6-3.2-2-1.2-1.1-2-2.4-2.2-2.8-.2-.4 0-.6.2-.8.2-.2.4-.4.5-.7.2-.2.2-.4.4-.6.1-.3 0-.5 0-.7-.1-.2-.9-2.1-1.2-2.9-.3-.8-.6-.7-.9-.7h-.7c-.2 0-.6.1-1 .5-.3.4-1.3 1.3-1.3 3.1s1.3 3.6 1.5 3.9c.2.2 2.6 4 6.3 5.6.9.4 1.6.6 2.1.8.9.3 1.7.2 2.3.1.7-.1 2.4-1 2.7-1.9.3-.9.3-1.7.2-1.9-.1-.2-.3-.3-.7-.5z" />
    </svg>
  );
}

type RollingTask = {
  id: string;
  type: string;
  title: string;
  bodyText: string | null;
  youtubeUrl: string | null;
  /** Etiqueta del bloque al que pertenece (Accesorios / Entrenamiento). Solo en ADVANCE multi-rolling. */
  blockLabel?: string;
  /** Color del bloque (hex). Si está, se usa para el badge del bloque. */
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

export function PatientHomeRolling({
  firstName,
  patientId,
  patientPhotoUrl,
  whatsappGroupUrl,
  communityUnread,
  challenge,
  mode,
  weekStartIso,
  title,
  days,
  daysToExpire,
  needsShirtSize,
  shippingComplete = true,
  individualSessionsToday,
  hasIndividualWork,
  pendingForms = [],
  programType,
  advanceWeek,
}: {
  firstName: string;
  patientId: string;
  patientPhotoUrl?: string | null;
  whatsappGroupUrl?: string | null;
  communityUnread?: number;
  challenge?: { id: string; title: string; description: string | null } | null;
  mode: "ready" | "pending" | "expired";
  weekStartIso: string;
  title?: string | null;
  days: RollingDay[];
  daysToExpire?: number | null;
  /** true si el paciente aún no ha rellenado su talla de camiseta ADVANCE. */
  needsShirtSize?: boolean;
  /** false → mostramos banner "Completa tu dirección postal" (mismo de Dark). */
  shippingComplete?: boolean;
  /**
   * Sesiones individuales del atleta que tocan HOY (puede haber varias si
   * tiene varios ProgramAssignments activos). Se pinta como header morado
   * "Trabajo específico" que enlaza a /sesion-combinada-hoy — esa ruta
   * decide si redirige a la única sesión o combina varias.
   */
  individualSessionsToday?: {
    count: number;
    allCompleted: boolean;
    singleSessionId: string | null;
  } | null;
  /** true si el atleta tiene ProgramAssignments activos (en cualquier día).
   *  Se usa para mostrar la tarjeta "Trabajo específico" en el grid. */
  hasIndividualWork?: boolean;
  pendingForms?: import("@/lib/pending-forms").PendingForm[];
  /**
   * Vista de la semana ADVANCE en modelo "Sesión N": next pendiente,
   * cuenta de completadas, total. Solo se pasa si programType==="ADVANCE".
   */
  advanceWeek?: {
    nextIndex: number | null;
    allCompleted: boolean;
    completedCount: number;
    totalCount: number;
  } | null;
  /** Se cachea en localStorage para que el WorkoutTimer sepa si el atleta
   *  es ADVANCE sin plumbing extra. */
  programType?: string | null;
}) {
  const initial = firstName[0]?.toUpperCase() ?? "?";

  // Cachea programType en localStorage → el WorkoutTimer lo usa para
  // decidir si muestra el modo ADVANCE en sus preferencias.
  useEffect(() => { writeCachedProgramType(programType ?? null); }, [programType]);

  if (mode === "expired") {
    return (
      <main className="min-h-screen flex items-center justify-center px-5" style={{ color: "var(--p-text)" }}>
        <div className="max-w-md w-full text-center py-10">
          <Link href="/" className="inline-flex items-center gap-1 text-xs mb-8" style={{ color: "var(--p-text-faint)" }}>
            <ArrowLeft size={12} /> Cambiar usuario
          </Link>
          <div className="text-5xl mb-4">⏰</div>
          <h1 className="text-2xl font-bold mb-2" style={{ letterSpacing: "-0.03em" }}>
            Tu programa ha caducado
          </h1>
          <p className="text-sm" style={{ color: "var(--p-text-dim)" }}>
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
    <main className="min-h-screen" style={{ color: "var(--p-text)" }}>
      <div className="relative max-w-md mx-auto px-5 py-7 pb-28">
        {pendingForms.length > 0 && (
          <div className="mb-5">
            <PendingFormsBanner patientId={patientId} pending={pendingForms} variant="dark" />
          </div>
        )}
        {/* Header */}
        <header className="mb-7">
          <div className="flex justify-between items-center mb-5">
            <Link href="/" className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--p-text-faint)" }}>
              <ArrowLeft size={12} /> Cambiar usuario
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href={`/paciente/${patientId}/ajustes`}
                title="Ajustes"
                className="p-1.5 rounded-lg"
                style={{ color: "var(--p-text-dim)" }}
              >
                <Settings size={18} />
              </Link>
              <PatientSessionMenu />
            </div>
          </div>

          <div className="flex items-center gap-3 mb-5">
            <button
              type="button"
              title="Cerrar sesión"
              onClick={() => { if (confirm("¿Cerrar sesión?")) patientLogout(); }}
              className="flex items-center justify-center font-bold flex-shrink-0 cursor-pointer overflow-hidden"
              style={{
                width: 52, height: 52, borderRadius: 14,
                background: patientPhotoUrl ? "transparent" : "linear-gradient(135deg, var(--p-accent) 0%, #F59E0B 100%)",
                color: "var(--p-accent-ink)",
                fontSize: 22,
                letterSpacing: "-0.03em",
                border: patientPhotoUrl ? "1px solid var(--p-border-strong)" : "none",
              }}
            >
              {patientPhotoUrl ? (
                <img src={patientPhotoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                initial
              )}
            </button>
            <div>
              <div className="text-2xl font-bold" style={{ letterSpacing: "-0.03em" }}>
                Hola, {firstName}
              </div>
              <div className="text-xs" style={{ color: "var(--p-text-faint)" }}>
                Modo ADVANCE
              </div>
            </div>
          </div>

          {daysToExpire !== null && daysToExpire !== undefined && daysToExpire <= 14 && daysToExpire >= 0 && (
            <div
              className="rounded-xl px-4 py-3 mb-3 text-sm"
              style={{
                background: daysToExpire <= 7 ? "var(--p-red-bg)" : "var(--p-amber-bg)",
                border: `1px solid ${daysToExpire <= 7 ? "var(--p-red-border)" : "var(--p-amber-border)"}`,
                color: daysToExpire <= 7 ? "var(--p-red-text)" : "var(--p-amber-text)",
              }}
            >
              <div className="font-medium">⏰ Tu programa caduca en {daysToExpire} {daysToExpire === 1 ? "día" : "días"}</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--p-text-dim)" }}>
                Habla con tu coach para renovar.
              </div>
            </div>
          )}
        </header>

        {!shippingComplete && (
          <Link
            href={`/paciente/${patientId}/ajustes#direccion`}
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

        {needsShirtSize && <PatientShirtSizePicker />}

        {/* 💪 Sesión de hoy — CTA en amarillo.
            - ADVANCE: modelo "Sesión N", auto-avanza al completar. No
              depende del día natural. Muestra el nº de sesión pendiente
              o el mensaje de semana completada.
            - PREVENTION: mantiene lógica del día natural. */}
        {mode === "ready" && programType === "ADVANCE" && advanceWeek && advanceWeek.totalCount > 0 && (
          <Link
            href={`/paciente/${patientId}/sesion-hoy`}
            className="block rounded-2xl p-5 mb-5 transition-transform active:scale-[0.98]"
            style={{
              background: advanceWeek.allCompleted
                ? "linear-gradient(135deg, #10B981 0%, #047857 100%)"
                : "linear-gradient(135deg, var(--p-accent) 0%, #F59E0B 100%)",
              color: "var(--p-accent-ink)",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-bold tracking-wider uppercase opacity-80 mb-1">
                  Semana {advanceWeek.completedCount}/{advanceWeek.totalCount}
                </div>
                <div className="text-2xl font-bold flex items-center gap-2" style={{ letterSpacing: "-0.025em" }}>
                  {advanceWeek.allCompleted
                    ? <>🎉 Semana completada</>
                    : advanceWeek.nextIndex
                      ? <>💪 Sesión {advanceWeek.nextIndex}</>
                      : <>💪 Sin sesiones</>}
                </div>
                <div className="text-xs mt-1.5 font-medium opacity-80">
                  {advanceWeek.allCompleted
                    ? "El lunes tienes nuevas sesiones."
                    : "Cuando puedas, no hace falta que sea hoy."}
                </div>
              </div>
              <div className="text-2xl font-bold flex-shrink-0">→</div>
            </div>
          </Link>
        )}
        {mode === "ready" && programType !== "ADVANCE" && (daysByDow[todayDow] ?? []).length > 0 && (
          <Link
            href={`/paciente/${patientId}/sesion-hoy`}
            className="block rounded-2xl p-5 mb-5 transition-transform active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, var(--p-accent) 0%, #F59E0B 100%)",
              color: "var(--p-accent-ink)",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-bold tracking-wider uppercase opacity-80 mb-1">
                  Hoy · {DAY_NAMES[todayDow]}
                </div>
                <div className="text-2xl font-bold flex items-center gap-2" style={{ letterSpacing: "-0.025em" }}>
                  💪 Sesión de hoy
                </div>
                <div className="text-xs mt-1.5 font-medium opacity-80">
                  Pulsa para empezar
                </div>
              </div>
              <div className="text-2xl font-bold flex-shrink-0">→</div>
            </div>
          </Link>
        )}

        {/* 🎯 Trabajo específico — el atleta ADVANCE tiene además Programs
             individuales asignados. Si hay 1 sesión de hoy vamos directo a
             ella; si hay varias, /sesion-combinada-hoy las une en una sola
             pantalla. */}
        {individualSessionsToday && individualSessionsToday.count > 0 && (
          <Link
            href={
              individualSessionsToday.singleSessionId
                ? `/paciente/${patientId}/sesion/${individualSessionsToday.singleSessionId}`
                : `/paciente/${patientId}/sesion-combinada-hoy`
            }
            className="block rounded-2xl p-5 mb-5 transition-transform active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)",
              color: "#FAFAFA",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-bold tracking-wider uppercase opacity-80 mb-1">
                  Trabajo específico
                </div>
                <div className="text-2xl font-bold flex items-center gap-2" style={{ letterSpacing: "-0.025em" }}>
                  🎯 Sesión de hoy
                </div>
                <div className="text-xs mt-1.5 font-medium opacity-80">
                  {individualSessionsToday.allCompleted
                    ? "Completada · pulsa para revisar"
                    : "Pulsa para empezar"}
                </div>
              </div>
              <div className="text-2xl font-bold flex-shrink-0">→</div>
            </div>
          </Link>
        )}

        {/* Grid de accesos compactos.
            Orden por parejas (izq / der):
              Trabajo específico · Semana completa
              Mis métricas       · Mis PRs
              Comunidad          · Reto del mes
              Biblioteca         · Timer                                 */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {hasIndividualWork && (
            <RollingActionCard
              href={`/paciente/${patientId}/semana`}
              Icon={Sparkles}
              label="Trabajo específico"
              sublabel="Sesiones propias de tu fisio"
            />
          )}
          <RollingActionCard
            href={`/paciente/${patientId}/semana-completa`}
            Icon={CalendarDays}
            label="Semana completa"
            sublabel="Los 5 días L-V"
          />
          <RollingActionCard
            href={`/paciente/${patientId}/metricas`}
            Icon={BarChart3}
            label="Mis métricas"
            sublabel="Fatiga, RPE, sueño…"
          />
          <RollingActionCard
            href={`/paciente/${patientId}/prs`}
            Icon={Trophy}
            label="Mis PRs"
            sublabel="Tus máximos"
          />
          <RollingActionCard
            href={`/paciente/${patientId}/comunidad`}
            Icon={Users}
            label="Comunidad"
            sublabel={communityUnread && communityUnread > 0 ? "Tienes novedades" : "Equipo y atletas"}
            badge={communityUnread}
          />
          {challenge && (
            <RollingActionCard
              href={`/paciente/${patientId}/reto`}
              Icon={Target}
              label="Reto del mes"
              sublabel={challenge.title}
            />
          )}
          {/* ADVANCE: sustituimos Biblioteca (vacia) por Historico —
              registro de entrenos + sensaciones dia a dia. Para PREVENTION
              mantenemos Biblioteca (aun no tiene historico propio). */}
          {programType === "ADVANCE" ? (
            <RollingActionCard
              href={`/paciente/${patientId}/historico`}
              Icon={History}
              label="Histórico"
              sublabel="Tus entrenos y sensaciones"
            />
          ) : (
            <RollingActionCard
              href={`/paciente/${patientId}/biblioteca`}
              Icon={BookOpen}
              label="Biblioteca"
              sublabel="Recursos y vídeos"
            />
          )}
          <RollingActionCard
            href={`/paciente/${patientId}/timer`}
            Icon={Timer}
            label="Timer"
            sublabel="EMOM, AMRAP, Tabata…"
          />
        </div>

        {/* Aviso ligero cuando la semana aún no está publicada. La vista completa
            de la semana vive ahora en /paciente/[id]/semana-completa. */}
        {mode === "pending" && (
          <section
            className="rounded-2xl p-4 text-center"
            style={{ background: "var(--p-surface-2)", border: "1px solid var(--p-border)" }}
          >
            <div className="text-2xl mb-1">⚒️</div>
            <p className="text-xs" style={{ color: "var(--p-text-dim)" }}>
              Tu coach está preparando la semana.
            </p>
          </section>
        )}
      </div>
      <PatientNav patientId={patientId} active="home" variant="advance" />
    </main>
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
            {TYPE_LABELS[task.type] || task.type}
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

function RollingActionCard({
  href, Icon, label, sublabel, external, badge,
}: {
  href: string;
  Icon: any;
  label: string;
  sublabel: string;
  external?: boolean;
  badge?: number;
}) {
  const className = "block rounded-2xl px-3 py-5 transition-transform active:scale-95 relative";
  const style = {
    background: "var(--p-surface)",
    color: "var(--p-text)",
    border: "1px solid var(--p-border)",
  } as const;
  const content = (
    <>
      {badge !== undefined && badge > 0 && (
        <span
          className="absolute flex items-center justify-center font-bold rounded-full"
          style={{
            top: -6, right: -6,
            minWidth: 20, height: 20, padding: "0 5px",
            background: "#EF4444", color: "#FFFFFF",
            fontSize: 11,
            border: "2px solid var(--p-bg, #0A0A0A)",
          }}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
      <div className="flex flex-col items-center text-center gap-2">
        <Icon size={28} strokeWidth={2} style={{ color: "var(--p-accent)" }} />
        <div className="min-w-0 w-full">
          <div className="font-semibold text-sm leading-tight" style={{ letterSpacing: "-0.02em" }}>
            {label}
          </div>
          <div className="text-[11px] leading-tight mt-0.5 truncate" style={{ color: "var(--p-text-dim)", letterSpacing: "-0.005em" }}>
            {sublabel}
          </div>
        </div>
      </div>
    </>
  );
  if (external) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className={className} style={style}>{content}</a>;
  }
  return <Link href={href} className={className} style={style}>{content}</Link>;
}

