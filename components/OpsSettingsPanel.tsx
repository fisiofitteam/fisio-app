"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OpsConfigShape } from "@/lib/ops-config";

/**
 * Modal de ajustes globales del panel de capacidad: umbrales, ventanas,
 * default y base de ocupación. El componente es controlado — recibe la
 * config actual y no hace fetch al abrir (evita parpadeo).
 *
 * Al guardar hace POST a /api/ops-config; el server normaliza y clamps.
 */
export function OpsSettingsPanel({
  initial,
  onClose,
}: {
  initial: OpsConfigShape;
  onClose: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<OpsConfigShape>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const r = await fetch("/api/ops-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    }).catch(() => null);
    if (r?.ok) {
      onClose();
      router.refresh();
    } else {
      const d = await r?.json().catch(() => ({}));
      setError(d?.error || "No se pudo guardar");
    }
    setSaving(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">⚙️ Ajustes de capacidad</h2>
          <button onClick={onClose} className="text-neutral-400 text-xl">×</button>
        </div>

        <div className="space-y-4">
          <NumField
            label="Capacidad por defecto (pacientes/coach)"
            hint="Se usa cuando el coach no tiene un valor propio en la tabla."
            value={draft.defaultMaxPatients}
            min={0}
            max={1000}
            onChange={(v) => setDraft((p) => ({ ...p, defaultMaxPatients: v }))}
          />

          <div>
            <div className="text-xs text-neutral-500 mb-1">Base de ocupación</div>
            <div className="flex gap-2">
              {(["active", "assigned"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setDraft((p) => ({ ...p, occupancyBasis: v }))}
                  className="flex-1 text-xs font-medium py-2 rounded-lg"
                  style={
                    draft.occupancyBasis === v
                      ? { background: "#0A0A0A", color: "#FAFAFA" }
                      : { background: "#F5F5F5", color: "#171717" }
                  }
                >
                  {v === "active" ? "Solo activos (recomendado)" : "Todos los asignados"}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-neutral-500 mt-1">
              {draft.occupancyBasis === "active"
                ? "Cuenta pacientes con SubscriptionRenewal activo + endDate futuro."
                : "Cuenta cualquier paciente con assignedProfessionalId = ese coach."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumField
              label="Ocupación · ámbar (%)"
              value={draft.occupancyWarn}
              min={0}
              max={100}
              onChange={(v) => setDraft((p) => ({ ...p, occupancyWarn: v }))}
            />
            <NumField
              label="Ocupación · rojo (%)"
              value={draft.occupancyCrit}
              min={0}
              max={200}
              onChange={(v) => setDraft((p) => ({ ...p, occupancyCrit: v }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumField
              label="Renov. · verde ≥ (%)"
              value={draft.renewalRateWarn}
              min={0}
              max={100}
              onChange={(v) => setDraft((p) => ({ ...p, renewalRateWarn: v }))}
            />
            <NumField
              label="Renov. · ámbar ≥ (%)"
              value={draft.renewalRateCrit}
              min={0}
              max={100}
              onChange={(v) => setDraft((p) => ({ ...p, renewalRateCrit: v }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumField
              label="Histórico tasa (meses)"
              value={draft.renewalHistoryMonths}
              min={1}
              max={24}
              onChange={(v) => setDraft((p) => ({ ...p, renewalHistoryMonths: v }))}
            />
            <NumField
              label="Renuevan pronto (días)"
              value={draft.expectedRenewDays}
              min={1}
              max={180}
              onChange={(v) => setDraft((p) => ({ ...p, expectedRenewDays: v }))}
            />
          </div>

          {error && <div className="text-xs text-red-600">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="text-xs px-3 py-1.5 rounded-lg bg-neutral-100"
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-40"
              style={{ background: "#0A0A0A", color: "#FAFAFA" }}
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NumField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="text-xs text-neutral-500 mb-1">{label}</div>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          if (Number.isFinite(n)) onChange(n);
        }}
        className="w-full text-sm p-2 rounded-lg"
        style={{ border: "1px solid #E5E5E5" }}
      />
      {hint && <div className="text-[10px] text-neutral-500 mt-1">{hint}</div>}
    </label>
  );
}
