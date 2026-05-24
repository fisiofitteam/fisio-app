"use client";

import { useState } from "react";

// Cierra la sesión del paciente y lo manda al login.
export async function patientLogout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {}
  window.location.href = "/paciente/login";
}

// Indicador "Sesión activa" que, al pulsarse, despliega "Cerrar sesión".
export function PatientSessionMenu() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium"
        style={{ color: "#A3A3A3" }}
      >
        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "#22C55E" }} />
        Sesión activa
        <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
      </button>

      {open && (
        <>
          {/* Capa para cerrar al pulsar fuera */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 mt-2 z-20 rounded-lg overflow-hidden shadow-lg"
            style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.12)", minWidth: 170 }}
          >
            <button
              type="button"
              onClick={async () => {
                setLoading(true);
                await patientLogout();
              }}
              disabled={loading}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-white/5 disabled:opacity-60"
              style={{ color: "#FAFAFA" }}
            >
              {loading ? "Cerrando..." : "🔒 Cerrar sesión"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
