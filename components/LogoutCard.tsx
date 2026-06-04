"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

/**
 * Tarjeta "Cerrar sesión" para /fisio/ajustes. Útil sobre todo en móvil,
 * donde la versión que está en el sidebar de escritorio no es accesible.
 *
 * Mismo flujo que LogoutButton (FisioSidebar): POST /api/auth/logout y
 * redirige a /login. Pedimos confirmación para no salir por accidente.
 */
export function LogoutCard() {
  const [busy, setBusy] = useState(false);

  async function logout() {
    if (!confirm("¿Cerrar sesión? Volverás a la pantalla de login.")) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignoramos errores de red — limpiamos cookies del cliente igual */
    }
    window.location.href = "/login";
  }

  return (
    <button
      onClick={logout}
      disabled={busy}
      className="w-full block rounded-lg p-3 text-left bg-white border border-neutral-200 hover:bg-neutral-50 disabled:opacity-60"
    >
      <div className="flex items-center gap-3">
        <span
          className="flex items-center justify-center w-7 h-7 rounded-full"
          style={{ background: "#FEE2E2", color: "#991B1B" }}
        >
          <LogOut size={14} />
        </span>
        <div className="flex-1">
          <div className="font-medium text-sm" style={{ color: "#991B1B" }}>
            {busy ? "Cerrando sesión…" : "Cerrar sesión"}
          </div>
          <div className="text-xs text-neutral-500">
            Salir de tu cuenta y volver al login
          </div>
        </div>
      </div>
    </button>
  );
}
