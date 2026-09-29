"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Banner persistente que aparece en TODAS las páginas del layout /fisio
 * cuando al miembro del equipo (head coach / fisio) le toca rellenar
 * el reporte mensual y aún no lo ha enviado. Mismo estilo y patrón
 * que CommunityTodayBanner.
 *
 * La ventana de tiempo la calcula el backend (a partir del primer
 * lunes del mes actual en TZ Madrid). Este componente solo consulta
 * /api/team-monthly-reports/window y decide si pintarse.
 */
type WindowState = {
  pending: boolean;
  monthLabel?: string;
  href?: string;
};

export function MonthlyReportBanner() {
  const [state, setState] = useState<WindowState | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/team-monthly-reports/window", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as WindowState;
        if (!cancelled) setState(data);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state?.pending) return null;

  return (
    <div
      className="mb-3 rounded-lg px-4 py-3 flex items-start gap-3 flex-wrap"
      style={{ background: "#FEF3C7", border: "1px solid #F59E0B", color: "#78350F" }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold flex items-center gap-1.5">
          📝 Toca rellenar el reporte mensual
          {state.monthLabel && (
            <span
              className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: "#FDE68A", color: "#78350F" }}
            >
              {state.monthLabel}
            </span>
          )}
        </div>
        <p className="text-xs mt-1" style={{ color: "#92400E" }}>
          10 preguntas para contarnos cómo va el mes. Se guarda automático mientras escribes.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          href={state.href ?? "/fisio/biblioteca/reporte-mensual"}
          className="text-xs font-semibold px-3 py-1.5 rounded-md"
          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
        >
          Ir al reporte →
        </Link>
      </div>
    </div>
  );
}
