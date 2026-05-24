"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { patientLogout } from "@/components/PatientSessionMenu";

export function PatientHomePaused({
  firstName,
  endDate,
  daysRemaining,
  reason,
}: {
  firstName: string;
  endDate: string;
  daysRemaining: number;
  reason: string | null;
}) {
  const endFormatted = new Date(endDate).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const initial = firstName[0]?.toUpperCase() ?? "?";

  return (
    <main className="min-h-screen flex items-center justify-center px-5" style={{ color: "#FAFAFA" }}>
      <div className="relative max-w-md mx-auto py-10 w-full">
        {/* Botón cambiar usuario */}
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs mb-8"
          style={{ color: "#737373" }}
        >
          <ArrowLeft size={12} /> Cambiar usuario
        </Link>

        {/* Avatar (pulsar para cerrar sesión) */}
        <button
          type="button"
          title="Cerrar sesión"
          onClick={() => { if (confirm("¿Cerrar sesión?")) patientLogout(); }}
          className="flex items-center justify-center font-bold flex-shrink-0 mx-auto mb-5 cursor-pointer"
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)",
            color: "#0A0A0A",
            fontSize: 28,
            letterSpacing: "-0.03em",
            border: "none",
          }}
        >
          {initial}
        </button>

        <h1 className="text-3xl font-bold text-center mb-2" style={{ letterSpacing: "-0.03em" }}>
          Tu programa está
          <br />
          <span className="brand-gradient-text">en pausa</span>
        </h1>

        <p className="text-center text-sm mb-8" style={{ color: "#A3A3A3" }}>
          Disfruta {firstName}, te esperamos pronto.
        </p>

        {/* Countdown destacado */}
        <div
          className="rounded-2xl p-6 text-center mb-4"
          style={{
            background: "rgba(252, 211, 77, 0.08)",
            border: "1px solid rgba(252, 211, 77, 0.20)",
          }}
        >
          <div
            className="text-5xl font-bold"
            style={{
              letterSpacing: "-0.04em",
              background: "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            {daysRemaining}
          </div>
          <div className="text-sm mt-1" style={{ color: "#FAFAFA" }}>
            {daysRemaining === 1 ? "día" : "días"} para volver
          </div>
        </div>

        <div
          className="rounded-xl p-4 text-sm text-center"
          style={{
            background: "#171717",
            border: "1px solid #262626",
            color: "#A3A3A3",
          }}
        >
          <div className="text-xs mb-1" style={{ color: "#737373" }}>VUELVES EL</div>
          <div className="font-medium capitalize" style={{ color: "#FAFAFA" }}>{endFormatted}</div>
          {reason && (
            <div className="text-xs mt-2 italic" style={{ color: "#737373" }}>
              {reason}
            </div>
          )}
        </div>

        <p className="text-[11px] text-center mt-6 italic" style={{ color: "#525252" }}>
          Tu suscripción se ha extendido automáticamente los días de la pausa.
        </p>
      </div>
    </main>
  );
}
