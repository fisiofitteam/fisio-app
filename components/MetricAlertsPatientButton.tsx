"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { MetricAlertsEditor } from "@/components/MetricAlertsEditor";

/**
 * Boton discreto en el header de la ficha del paciente que abre un modal
 * con la config de alertas por metricas de ESE paciente. Lee y guarda
 * contra /api/metric-alerts/patient/[id].
 */
export function MetricAlertsPatientButton({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<any | null>(null);
  const [override, setOverride] = useState(false);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function openAndLoad() {
    setOpen(true);
    setLoading(true);
    try {
      const r = await fetch(`/api/metric-alerts/patient/${patientId}`, { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        setConfig(data.config);
        setOverride(!!data.override);
        setMetrics(data.metrics ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={openAndLoad}
        className="btn btn-ghost text-xs justify-start flex items-center gap-1.5"
        title="Configurar alertas por metricas de este paciente"
      >
        <AlertTriangle size={13} /> Alertas métricas
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-base flex items-center gap-2">
                  🚨 Alertas por métricas
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Configuración solo para este paciente
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-neutral-400 hover:text-neutral-700">
                <X size={20} />
              </button>
            </div>
            {loading || !config ? (
              <p className="text-sm text-neutral-500 italic">Cargando…</p>
            ) : (
              <MetricAlertsEditor
                initial={config}
                initialOverride={override}
                scope="patient"
                metrics={metrics}
                onSave={async (cfg) => {
                  const r = await fetch(`/api/metric-alerts/patient/${patientId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ config: cfg }),
                  });
                  if (!r.ok) throw new Error();
                  const data = await r.json();
                  setOverride(true);
                  return data.config;
                }}
                onReset={async () => {
                  const r = await fetch(`/api/metric-alerts/patient/${patientId}`, {
                    method: "DELETE",
                  });
                  if (!r.ok) throw new Error();
                  const data = await r.json();
                  setOverride(false);
                  return data.config;
                }}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
