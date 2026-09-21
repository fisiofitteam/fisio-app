"use client";

import { useEffect, useState } from "react";
import { CapacityReport } from "@/components/CapacityReport";
import type { CapacityReport as CapacityReportData } from "@/lib/capacity";

/**
 * Wrapper cliente que carga el reporte de capacidad al montarse. Se usa
 * dentro del tab del panel del CEO: al abrir el tab se instancia el
 * componente y se dispara el fetch — el resto de tabs no pagan el coste.
 */
export function CapacityReportLazy() {
  const [data, setData] = useState<CapacityReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/capacity-report");
        if (!r.ok) {
          if (!cancelled) setError(`Error ${r.status}`);
          return;
        }
        const d = await r.json();
        if (!cancelled) setData(d.data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Error inesperado");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return <p className="text-sm text-red-600 py-6 text-center">{error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-neutral-500 italic py-10 text-center">Calculando capacidad operativa…</p>;
  }
  return <CapacityReport data={data} embedded />;
}
