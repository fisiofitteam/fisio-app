"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Pro = { id: string; fullName: string; role: string };
type Pat = { id: string; fullName: string };

export function LoginLanding({
  professionals,
  patients,
}: {
  professionals: Pro[];
  patients: Pat[];
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function trasteo(professionalId: string) {
    setLoadingId(professionalId);
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ professionalId }),
    });
    router.push("/fisio");
    router.refresh();
  }

  function goPatient(id: string) {
    router.push(`/paciente/${id}`);
  }

  return (
    <main
      style={{
        background: "#0A0A0A",
        minHeight: "100vh",
        color: "#FAFAFA",
      }}
      className="relative overflow-hidden"
    >
      {/* Halos cálidos sutiles */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 14% 22%, rgba(252, 211, 77, 0.10) 0, transparent 38%), radial-gradient(circle at 86% 88%, rgba(245, 158, 11, 0.06) 0, transparent 42%)",
        }}
      />
      {/* Textura de grano */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />

      <div className="relative max-w-6xl mx-auto min-h-screen grid lg:grid-cols-[1.2fr_1fr] gap-0">
        {/* Hero */}
        <section className="flex flex-col justify-between p-10 lg:p-14">
          <div className="inline-flex items-center gap-2.5 font-semibold text-sm" style={{ letterSpacing: "-0.01em" }}>
            <span
              className="inline-flex items-center justify-center"
              style={{
                width: 32, height: 32, borderRadius: 9,
                background: "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)",
              }}
            >
              <svg viewBox="0 0 24 24" width={18} height={18} fill="#0A0A0A" stroke="#0A0A0A" strokeWidth={2} strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </span>
            FisioFit App
          </div>

          <div className="my-auto">
            <h1
              className="font-bold leading-none"
              style={{
                fontSize: "clamp(40px, 6vw, 60px)",
                letterSpacing: "-0.035em",
              }}
            >
              Readaptación<br />
              para atletas<br />
              de <span className="brand-gradient-text">CrossFit.</span>
            </h1>
          </div>

          <div className="text-xs" style={{ color: "#525252", letterSpacing: "0.04em" }}>
            <span
              className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
              style={{ background: "#22C55E" }}
            />
            FisioFit Team · 2026
          </div>
        </section>

        {/* Panel login */}
        <section
          className="flex flex-col justify-center p-10 lg:p-14"
          style={{
            background: "#FAFAFA",
            color: "#0A0A0A",
          }}
        >
          <h2 className="text-2xl font-semibold" style={{ letterSpacing: "-0.025em" }}>
            Inicia sesión
          </h2>
          <p className="text-sm mt-1 mb-7" style={{ color: "#737373" }}>
            Accede a tu panel personal.
          </p>

          <form
            onSubmit={(e) => { e.preventDefault(); alert("El login real aún no está conectado. Usa el modo trasteo de abajo."); }}
            className="space-y-3"
          >
            <div>
              <label className="block text-[11px] font-semibold uppercase mb-1.5" style={{ letterSpacing: "0.1em", color: "#525252" }}>
                Correo
              </label>
              <input
                type="email"
                placeholder="tu@fisiofit.team"
                className="w-full"
                style={{
                  padding: "11px 13px",
                  border: "1px solid #E5E5E5",
                  borderRadius: 10,
                  fontSize: 14,
                  background: "#FFFFFF",
                  color: "#0A0A0A",
                  outline: "none",
                }}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase mb-1.5" style={{ letterSpacing: "0.1em", color: "#525252" }}>
                Contraseña
              </label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full"
                style={{
                  padding: "11px 13px",
                  border: "1px solid #E5E5E5",
                  borderRadius: 10,
                  fontSize: 14,
                  background: "#FFFFFF",
                  color: "#0A0A0A",
                  outline: "none",
                }}
              />
            </div>
            <button
              type="submit"
              className="block w-full"
              style={{
                background: "#0A0A0A",
                color: "#FAFAFA",
                border: "none",
                borderRadius: 10,
                padding: 13,
                fontSize: 14,
                fontWeight: 500,
                marginTop: 14,
                cursor: "pointer",
              }}
            >
              Entrar →
            </button>
          </form>

          <p className="text-center text-xs mt-3.5" style={{ color: "#737373" }}>
            ¿Olvidaste tu contraseña?{" "}
            <a href="#" style={{ color: "#0A0A0A", textDecoration: "underline" }}>
              Recupérala
            </a>
          </p>

          {/* Modo trasteo */}
          <div
            className="mt-6 pt-4"
            style={{ borderTop: "1px dashed #E5E5E5" }}
          >
            <div
              className="text-[10px] font-semibold uppercase mb-2"
              style={{ letterSpacing: "0.14em", color: "#A3A3A3" }}
            >
              ⚡ Modo trasteo (solo en desarrollo)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {professionals.map((p) => (
                <button
                  key={p.id}
                  onClick={() => trasteo(p.id)}
                  disabled={loadingId !== null}
                  className="text-xs font-medium disabled:opacity-50"
                  style={{
                    background: "#FCD34D",
                    color: "#0A0A0A",
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "none",
                    cursor: "pointer",
                  }}
                  title={`Entrar como ${p.fullName} (${p.role})`}
                >
                  {loadingId === p.id ? "..." : p.fullName.split(" ")[0]}
                </button>
              ))}
              {patients.map((p) => (
                <button
                  key={p.id}
                  onClick={() => goPatient(p.id)}
                  className="text-xs"
                  style={{
                    background: "#F5F5F5",
                    color: "#525252",
                    padding: "4px 9px",
                    borderRadius: 999,
                    border: "1px solid #E5E5E5",
                    cursor: "pointer",
                  }}
                  title={`Ver como paciente: ${p.fullName}`}
                >
                  {p.fullName.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
