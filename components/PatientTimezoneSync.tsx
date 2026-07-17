"use client";

import { useEffect } from "react";

/**
 * Componente sin UI que envía la zona horaria del navegador al server al
 * cargar cualquier página del paciente. Se ejecuta una vez por sesión de
 * navegador (guarda un flag en sessionStorage para no llamar en cada
 * navegación).
 *
 * El endpoint es idempotente — si ya está guardada la misma TZ, la
 * actualización en Prisma no cambia nada. Puedes moverte de país y la
 * app se adapta al día siguiente que abras la app.
 */
const FLAG_KEY = "fisio-tz-synced";

export function PatientTimezoneSync() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Sync una vez por pestaña — no queremos hits en cada navegación.
    if (sessionStorage.getItem(FLAG_KEY)) return;
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!timezone) return;
      fetch("/api/patient/timezone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone }),
      }).then(() => {
        sessionStorage.setItem(FLAG_KEY, "1");
      }).catch(() => { /* silencioso — no bloqueamos UX si falla */ });
    } catch { /* noop */ }
  }, []);
  return null;
}
