"use client";
/**
 * Latido de "estoy activo en la app" para el panel de actividad del equipo.
 *
 * Manda POST /api/activity/ping cada minuto SOLO si:
 *   - la pestaña esta visible (no en background)
 *   - hubo interaccion (mouse/teclado/scroll/touch) en los ultimos 90s
 *
 * Mide tiempo activo dentro de la app, NO trabajo. El servidor cierra la
 * puerta a inflados con cap de 120s por latido.
 */
import { useEffect, useRef } from "react";

const IDLE_MS = 90_000;   // inactivo tras 90s sin interaccion
const TICK_MS = 60_000;   // un latido por minuto

export function ActivityHeartbeat() {
  const lastActivity = useRef(Date.now());

  useEffect(() => {
    const bump = () => { lastActivity.current = Date.now(); };
    const events: (keyof WindowEventMap)[] = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const onVis = () => { if (document.visibilityState === "visible") lastActivity.current = Date.now(); };
    document.addEventListener("visibilitychange", onVis);

    async function tick(seconds: number) {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActivity.current > IDLE_MS) return;
      try {
        await fetch("/api/activity/ping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seconds, hour: new Date().getHours() }),
          keepalive: true, // sobrevive al cierre de pestaña
        });
      } catch { /* silencioso */ }
    }

    // Primer latido a los 15s para no perder visitas cortas.
    const first = setTimeout(() => tick(15), 15_000);
    const iv = setInterval(() => tick(60), TICK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
      events.forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return null;
}
