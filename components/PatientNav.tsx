"use client";

import Link from "next/link";
import { Home, Calendar, Zap, ClipboardList, Users, Trophy, BarChart3 } from "lucide-react";

export function PatientNav({
  patientId,
  active,
  variant = "default",
}: {
  patientId: string;
  active: string;
  variant?: "default" | "advance" | "prevention";
}) {
  const items = (() => {
    if (variant === "prevention") {
      // Prevention: sin PRs, sin adaptaciones, sin WOD. Solo contenido
      // semanal, métricas y comunidad.
      return [
        { id: "home", label: "Hoy", href: `/paciente/${patientId}`, Icon: Home },
        { id: "semana", label: "Semana", href: `/paciente/${patientId}/semana-completa`, Icon: Calendar },
        { id: "metricas", label: "Métricas", href: `/paciente/${patientId}/metricas`, Icon: BarChart3 },
        { id: "comunidad", label: "Comunidad", href: `/paciente/${patientId}/comunidad`, Icon: Users },
      ];
    }
    if (variant === "advance") {
      return [
        { id: "home", label: "Hoy", href: `/paciente/${patientId}`, Icon: Home },
        { id: "semana", label: "Semana", href: `/paciente/${patientId}/semana`, Icon: Calendar },
        { id: "prs", label: "PRs", href: `/paciente/${patientId}/prs`, Icon: Trophy },
        { id: "comunidad", label: "Comunidad", href: `/paciente/${patientId}/comunidad`, Icon: Users },
        { id: "metricas", label: "Métricas", href: `/paciente/${patientId}/metricas`, Icon: BarChart3 },
      ];
    }
    return [
      { id: "home", label: "Hoy", href: `/paciente/${patientId}`, Icon: Home },
      { id: "semana", label: "Semana", href: `/paciente/${patientId}/semana`, Icon: Calendar },
      { id: "wod", label: "WOD", href: `/paciente/${patientId}/wod`, Icon: Zap },
      { id: "comunidad", label: "Comunidad", href: `/paciente/${patientId}/comunidad`, Icon: Users },
      { id: "adapt", label: "Adaptaciones", href: `/paciente/${patientId}/adaptaciones`, Icon: ClipboardList },
    ];
  })();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 max-w-md mx-auto"
      style={{
        background: "var(--p-nav-bg)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: "1px solid var(--p-nav-border)",
      }}
    >
      <div className="flex">
        {items.map((it) => {
          const isActive = active === it.id;
          const Icon = it.Icon;
          return (
            <Link
              key={it.id}
              href={it.href}
              className="flex-1 flex flex-col items-center justify-center py-3 transition-colors"
              style={{
                color: isActive ? "var(--p-accent)" : "var(--p-text-faint)",
              }}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              <div
                className="text-[10px] mt-1"
                style={{
                  fontWeight: isActive ? 600 : 400,
                  letterSpacing: "0.02em",
                }}
              >
                {it.label}
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
