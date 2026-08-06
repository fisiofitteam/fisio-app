"use client";

/**
 * Botón "📥 Marcar como paciente existente" en la sidebar de la ficha
 * del paciente. Aparece solo si el paciente NO es ya legacy y solo para
 * CEO/head_success.
 *
 * Se usa cuando un fisio se equivocó y creó a alguien con "+ Nuevo
 * paciente" (o vino de ventas por error) siendo alguien que ya llevaba
 * meses tratándose fuera de la plataforma.
 *
 * Al pulsar → modal pequeño con confirmación + input de "Fecha real
 * de inicio del periodo actual" (opcional). Envía POST al endpoint
 * mark-as-legacy que reclasifica y ajusta fechas.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export function MarkAsLegacyButton({
  patientId,
  patientName,
  currentSubscriptionStartDate,
}: {
  patientId: string;
  patientName: string;
  currentSubscriptionStartDate: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState<string>(
    currentSubscriptionStartDate?.split("T")[0] ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/patients/${patientId}/mark-as-legacy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionStartDate: startDate || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-ghost text-xs justify-start"
        title="Reclasificar como paciente existente (legacy). No le pedirá anamnesis+contrato al entrar."
      >
        📥 Marcar como paciente existente
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold text-base">
                📥 Marcar como paciente existente
              </h3>
              <button
                onClick={() => setOpen(false)}
                disabled={saving}
                className="text-neutral-400 text-xl leading-none px-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-neutral-600 mb-3">
              Vas a reclasificar a <strong>{patientName}</strong> como paciente
              existente (legacy). Efectos:
            </p>
            <ul className="text-[11px] text-neutral-600 space-y-1 mb-3 pl-3 list-disc">
              <li>Deja de aparecer en el bloque "Onboarding · Semana 0".</li>
              <li>
                Cuando entre en la app, <strong>no se le pedirá</strong>{" "}
                anamnesis ni contrato.
              </li>
              <li>
                No aparecerá en envíos pendientes de camiseta/parches (se
                asume que ya los recibió).
              </li>
              <li>
                Si ajustas la fecha de inicio del periodo, se recalcula el
                fin y el "Renueva en X días".
              </li>
            </ul>

            <div className="rounded-lg p-2 mb-3 text-xs" style={{ background: "#FEF3C7", border: "1px solid #FCD34D", color: "#78350F" }}>
              Solo para casos donde el fisio se equivocó de botón al crear
              al paciente. Si viene de una compra real por PayPal, no lo
              conviertas — perderías la traza de pago.
            </div>

            <div>
              <label className="text-xs text-neutral-500 block mb-1">
                Fecha real de inicio del periodo actual (opcional)
              </label>
              <input
                type="date"
                className="input text-sm"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={saving}
              />
              <p className="text-[11px] text-neutral-500 mt-1">
                Déjala tal cual si la actual ya es correcta. Cámbiala si el
                paciente lleva tiempo tratándose y queremos que "Renueva en
                X días" cuadre con la realidad.
              </p>
            </div>

            {error && (
              <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-neutral-100">
              <button
                onClick={() => setOpen(false)}
                disabled={saving}
                className="text-sm text-neutral-500 px-3 py-2"
              >
                Cancelar
              </button>
              <button
                onClick={apply}
                disabled={saving}
                className="text-sm font-semibold px-4 py-2 rounded-lg"
                style={{ background: "#0A0A0A", color: "#FAFAFA" }}
              >
                {saving ? "Aplicando…" : "Reclasificar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
