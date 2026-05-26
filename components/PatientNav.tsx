"use client";

import Link from "next/link";
import { Home, Calendar, Zap, ClipboardList, Users } from "lucide-react";

export function PatientNav({
  patientId,
  active,
}: {
  patientId: string;
  active: "home" | "semana" | "wod" | "adapt" | "comunidad";
}) {
  const items = [
    { id: "home", label: "Hoy", href: `/paciente/${patientId}`, Icon: Home },
    { id: "semana", label: "Semana", href: `/paciente/${patientId}/semana`, Icon: Calendar },
    { id: "wod", label: "WOD", href: `/paciente/${patientId}/wod`, Icon: Zap },
    { id: "comunidad", label: "Comunidad", href: `/paciente/${patientId}/comunidad`, Icon: Users },
    { id: "adapt", label: "Adaptaciones", href: `/paciente/${patientId}/adaptaciones`, Icon: ClipboardList },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 max-w-md mx-auto"
      style={{
        background: "rgba(10, 10, 10, 0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
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
                color: isActive ? "#FCD34D" : "#737373",
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
