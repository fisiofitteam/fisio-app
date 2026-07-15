"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  Users,
  Target,
  CalendarDays,
  Settings,
  Timer,
} from "lucide-react";
import { PatientSessionMenu, patientLogout } from "@/components/PatientSessionMenu";
import { PatientNav } from "@/components/PatientNav";

type PreventionTask = {
  id: string;
  type: string;
  title: string;
  bodyText: string | null;
  youtubeUrl: string | null;
};

type PreventionDay = {
  dayOfWeek: number;
  tasks: PreventionTask[];
};

const DAY_NAMES = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

/**
 * Home dedicado del paciente FisioFit Prevention.
 *
 * Diferencias vs. PatientHomeRolling (Advance):
 *  - Sin PRs (no aplica al público Prevention).
 *  - Sin badge de fisio asignado (Prevention no lleva fisio).
 *  - Header sutil "Modo Prevention" y avisos de renovación de la
 *    suscripción cuando queden ≤ 14 días.
 *
 * El motor de contenido (RollingWeekView, sesion-hoy, ejercicios con
 * vídeo) se reutiliza tal cual — Prevention es "single-rolling" y las
 * páginas hijas detectan programType==="PREVENTION" para ocultar los
 * bloques Accesorios/Entrenamiento.
 */
export function PatientHomePrevention({
  firstName,
  patientId,
  patientPhotoUrl,
  communityUnread,
  challenge,
  mode,
  weekStartIso,
  weekTitle,
  days,
  daysToRenewal,
  subscriptionStatus,
  cancelAtPeriodEnd,
}: {
  firstName: string;
  patientId: string;
  patientPhotoUrl?: string | null;
  communityUnread?: number;
  challenge?: { id: string; title: string; description: string | null } | null;
  mode: "ready" | "pending";
  weekStartIso: string;
  weekTitle?: string | null;
  days: PreventionDay[];
  daysToRenewal?: number | null;
  subscriptionStatus?: string | null;
  cancelAtPeriodEnd?: boolean;
}) {
  const initial = firstName[0]?.toUpperCase() ?? "?";

  // Localizar tareas de HOY para saber si mostrar CTA de sesión
  const daysByDow: Record<number, PreventionTask[]> = {};
  for (let i = 1; i <= 5; i++) daysByDow[i] = [];
  for (const d of days) daysByDow[d.dayOfWeek] = d.tasks;
  const today = new Date();
  const todayDow = today.getDay() === 0 ? 7 : today.getDay();
  const hasSessionToday = mode === "ready" && (daysByDow[todayDow] ?? []).length > 0;

  return (
    <main className="min-h-screen" style={{ color: "var(--p-text)" }}>
      <div className="relative max-w-md mx-auto px-5 py-7 pb-28">
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
                background: patientPhotoUrl
                  ? "transparent"
                  : "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)",
                color: "#FFFFFF",
                fontSize: 22,
                letterSpacing: "-0.03em",
                border: patientPhotoUrl ? "1px solid var(--p-border-strong)" : "none",
              }}
            >
              {patientPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
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
                🛡 FisioFit Prevention
              </div>
            </div>
          </div>

          {/* Aviso sobre estado de la suscripción */}
          {subscriptionStatus === "past_due" && (
            <div
              className="rounded-xl px-4 py-3 mb-3 text-sm"
              style={{
                background: "var(--p-red-bg)",
                border: "1px solid var(--p-red-border)",
                color: "var(--p-red-text)",
              }}
            >
              <div className="font-medium">⚠ Tu último pago falló</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--p-text-dim)" }}>
                Actualiza tu método de pago en Ajustes para no perder acceso.
              </div>
            </div>
          )}
          {subscriptionStatus !== "past_due" &&
            typeof daysToRenewal === "number" &&
            daysToRenewal <= 14 &&
            daysToRenewal >= 0 && (
              <div
                className="rounded-xl px-4 py-3 mb-3 text-sm"
                style={{
                  background: daysToRenewal <= 7 ? "var(--p-amber-bg)" : "var(--p-surface-2)",
                  border: `1px solid ${
                    daysToRenewal <= 7 ? "var(--p-amber-border)" : "var(--p-border)"
                  }`,
                  color: daysToRenewal <= 7 ? "var(--p-amber-text)" : "var(--p-text-dim)",
                }}
              >
                <div className="font-medium">
                  {cancelAtPeriodEnd
                    ? `⏰ Tu suscripción termina en ${daysToRenewal} ${
                        daysToRenewal === 1 ? "día" : "días"
                      }`
                    : subscriptionStatus === "trialing"
                      ? `⏰ Tu prueba termina en ${daysToRenewal} ${
                          daysToRenewal === 1 ? "día" : "días"
                        }`
                      : `🔄 Se renueva automáticamente en ${daysToRenewal} ${
                          daysToRenewal === 1 ? "día" : "días"
                        }`}
                </div>
                {cancelAtPeriodEnd && (
                  <div className="text-xs mt-0.5" style={{ color: "var(--p-text-dim)" }}>
                    Reactiva en Ajustes si cambias de idea.
                  </div>
                )}
              </div>
            )}
        </header>

        {/* 💪 Sesión de hoy CTA principal */}
        {hasSessionToday && (
          <Link
            href={`/paciente/${patientId}/sesion-hoy`}
            className="block rounded-2xl p-5 mb-5 transition-transform active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)",
              color: "#1F2937",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-bold tracking-wider uppercase opacity-70 mb-1">
                  Hoy · {DAY_NAMES[todayDow]}
                </div>
                <div className="text-2xl font-bold flex items-center gap-2" style={{ letterSpacing: "-0.025em" }}>
                  🏋️ Tu sesión
                </div>
                <div className="text-xs mt-1.5 font-medium opacity-70">
                  Pulsa para empezar
                </div>
              </div>
              <div className="text-2xl font-bold flex-shrink-0">→</div>
            </div>
          </Link>
        )}

        {/* Grid de accesos rápidos */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <PreventionActionCard
            href={`/paciente/${patientId}/semana-completa`}
            Icon={CalendarDays}
            label="Semana completa"
            sublabel="Los 5 días L-V"
          />
          <PreventionActionCard
            href={`/paciente/${patientId}/metricas`}
            Icon={BarChart3}
            label="Mis métricas"
            sublabel="Fatiga, RPE, sueño…"
          />
          <PreventionActionCard
            href={`/paciente/${patientId}/comunidad`}
            Icon={Users}
            label="Comunidad"
            sublabel={communityUnread && communityUnread > 0 ? "Tienes novedades" : "Equipo y atletas"}
            badge={communityUnread}
          />
          {challenge && (
            <PreventionActionCard
              href={`/paciente/${patientId}/reto`}
              Icon={Target}
              label="Reto del mes"
              sublabel={challenge.title}
            />
          )}
          <PreventionActionCard
            href={`/paciente/${patientId}/timer`}
            Icon={Timer}
            label="Timer"
            sublabel="EMOM, AMRAP, Tabata…"
          />
        </div>

        {/* Aviso ligero cuando la semana aún no está publicada */}
        {mode === "pending" && (
          <section
            className="rounded-2xl p-4 text-center"
            style={{ background: "var(--p-surface-2)", border: "1px solid var(--p-border)" }}
          >
            <div className="text-2xl mb-1">⚒️</div>
            <p className="text-xs" style={{ color: "var(--p-text-dim)" }}>
              Estamos preparando tu semana.
            </p>
          </section>
        )}
      </div>
      <PatientNav patientId={patientId} active="home" variant="prevention" />
    </main>
  );
}

function PreventionActionCard({
  href,
  Icon,
  label,
  sublabel,
  badge,
}: {
  href: string;
  Icon: any;
  label: string;
  sublabel: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl px-3 py-5 transition-transform active:scale-95 relative"
      style={{
        background: "var(--p-surface)",
        color: "var(--p-text)",
        border: "1px solid var(--p-border)",
      }}
    >
      {badge !== undefined && badge > 0 && (
        <span
          className="absolute flex items-center justify-center font-bold rounded-full"
          style={{
            top: -6,
            right: -6,
            minWidth: 20,
            height: 20,
            padding: "0 5px",
            background: "#EF4444",
            color: "#FFFFFF",
            fontSize: 11,
            border: "2px solid var(--p-bg, #0A0A0A)",
          }}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
      <div className="flex flex-col items-center text-center gap-2">
        <Icon size={28} strokeWidth={2} style={{ color: "#FCD34D" }} />
        <div className="min-w-0 w-full">
          <div className="font-semibold text-sm leading-tight" style={{ letterSpacing: "-0.02em" }}>
            {label}
          </div>
          <div
            className="text-[11px] leading-tight mt-0.5 truncate"
            style={{ color: "var(--p-text-dim)", letterSpacing: "-0.005em" }}
          >
            {sublabel}
          </div>
        </div>
      </div>
    </Link>
  );
}
