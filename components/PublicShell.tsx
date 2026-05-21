"use client";

import React from "react";

/**
 * Chrome visual compartido de las pantallas públicas (login equipo, login paciente, reset, home).
 *
 * Estructura: 2 columnas en desktop (hero a la izquierda con imagen + frase de marca,
 * panel claro a la derecha con el formulario). En móvil colapsa a una columna apilada.
 *
 * Props:
 * - title: título principal del panel derecho (ej "Inicia sesión")
 * - subtitle: subtítulo bajo el título (ej "Accede a tu panel personal.")
 * - children: el formulario o contenido del panel derecho
 * - footer: contenido opcional debajo del formulario (links a "olvidé contraseña", etc)
 * - heroTitle: opcional, sobrescribe el título del hero (por defecto: "Readaptación para atletas de CrossFit")
 * - heroSubtitle: opcional, frase pequeña bajo el hero (ej "Acceso al equipo")
 */
export function PublicShell({
  title,
  subtitle,
  children,
  footer,
  heroTitle,
  heroSubtitle,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  heroTitle?: React.ReactNode;
  heroSubtitle?: string;
}) {
  return (
    <main
      style={{ background: "#0A0A0A", minHeight: "100vh", color: "#FAFAFA" }}
      className="relative overflow-hidden"
    >
      {/* Imagen de fondo del box CrossFit, muy difuminada para que no compita con el texto */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "url(/box.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: 0.18,
        }}
      />
      {/* Halos cálidos sutiles */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 14% 22%, rgba(252, 211, 77, 0.18) 0, transparent 38%), radial-gradient(circle at 86% 88%, rgba(245, 158, 11, 0.10) 0, transparent 42%)",
        }}
      />
      {/* Textura de grano */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />

      <div className="relative max-w-6xl mx-auto min-h-screen grid lg:grid-cols-[1.2fr_1fr] gap-0">
        {/* Hero (columna izquierda) */}
        <section className="flex flex-col justify-between p-8 md:p-10 lg:p-14">
          <a href="/" className="inline-flex items-center gap-2.5 font-semibold text-sm self-start" style={{ letterSpacing: "-0.01em" }}>
            <span
              className="inline-flex items-center justify-center"
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)",
              }}
            >
              <svg viewBox="0 0 24 24" width={18} height={18} fill="#0A0A0A" stroke="#0A0A0A" strokeWidth={2} strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </span>
            FisioFit App
          </a>

          <div className="my-10 lg:my-auto">
            <h1
              className="font-bold leading-none"
              style={{ fontSize: "clamp(36px, 5.5vw, 60px)", letterSpacing: "-0.035em" }}
            >
              {heroTitle ?? (
                <>
                  Readaptación
                  <br />
                  para atletas
                  <br />
                  de <span className="brand-gradient-text">CrossFit.</span>
                </>
              )}
            </h1>
            {heroSubtitle && (
              <p className="mt-4 text-sm md:text-base" style={{ color: "#A3A3A3", letterSpacing: "-0.005em" }}>
                {heroSubtitle}
              </p>
            )}
          </div>

          <div className="text-xs" style={{ color: "#525252", letterSpacing: "0.04em" }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: "#22C55E" }} />
            FisioFit Team · 2026
          </div>
        </section>

        {/* Panel claro (columna derecha) */}
        <section
          className="flex flex-col justify-center p-8 md:p-10 lg:p-14"
          style={{ background: "#FAFAFA", color: "#0A0A0A" }}
        >
          <h2 className="text-2xl font-semibold" style={{ letterSpacing: "-0.025em" }}>
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm mt-1 mb-7" style={{ color: "#737373" }}>
              {subtitle}
            </p>
          )}
          {!subtitle && <div className="mb-7" />}

          {children}

          {footer && <div className="mt-6 pt-4" style={{ borderTop: "1px dashed #E5E5E5" }}>{footer}</div>}
        </section>
      </div>
    </main>
  );
}

// ============================================================================
// Helpers visuales para inputs y botones de las pantallas públicas
// ============================================================================

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block text-[11px] font-semibold uppercase mb-1.5"
      style={{ letterSpacing: "0.1em", color: "#525252" }}
    >
      {children}
    </label>
  );
}

export const fieldInputStyle: React.CSSProperties = {
  padding: "11px 13px",
  border: "1px solid #E5E5E5",
  borderRadius: 10,
  fontSize: 14,
  background: "#FFFFFF",
  color: "#0A0A0A",
  outline: "none",
  width: "100%",
};

export const primaryButtonStyle: React.CSSProperties = {
  background: "#0A0A0A",
  color: "#FAFAFA",
  border: "none",
  borderRadius: 10,
  padding: 13,
  fontSize: 14,
  fontWeight: 500,
  width: "100%",
  cursor: "pointer",
};
