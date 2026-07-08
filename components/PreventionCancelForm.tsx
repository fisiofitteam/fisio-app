"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Sección "Cancelar renovación" dentro de /paciente/[id]/ajustes para
 * pacientes Prevention. Muestra el estado actual y permite:
 *
 *  - Marcar cancel_at_period_end si la suscripción está activa/trialing.
 *  - Reactivar la renovación si ya estaba marcada.
 *
 * No cancela inmediatamente — el paciente mantiene el acceso hasta el
 * final del periodo pagado. Al llegar la fecha, Stripe manda
 * subscription.deleted y el webhook cierra la fila local.
 */
export function PreventionCancelForm({
  initialCancelAtPeriodEnd,
  currentPeriodEndIso,
  trialEndsAtIso,
  status,
}: {
  initialCancelAtPeriodEnd: boolean;
  currentPeriodEndIso: string | null;
  trialEndsAtIso: string | null;
  status: string;
}) {
  const router = useRouter();
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(initialCancelAtPeriodEnd);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const isTrialing = status === "trialing";
  const endDate = isTrialing && trialEndsAtIso ? trialEndsAtIso : currentPeriodEndIso;

  async function toggle(reactivate: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/prevention/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reactivate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error || "No se pudo actualizar");
        return;
      }
      setCancelAtPeriodEnd(data.cancelAtPeriodEnd);
      setConfirming(false);
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setSaving(false);
    }
  }

  // Estado 1: ya está cancelada — mostrar aviso + botón "Reactivar"
  if (cancelAtPeriodEnd) {
    return (
      <div className="text-xs" style={{ color: "var(--p-text-dim)" }}>
        <div
          className="rounded-lg px-3 py-2.5 mb-3"
          style={{
            background: "var(--p-amber-bg)",
            border: "1px solid var(--p-amber-border)",
            color: "var(--p-amber-text)",
          }}
        >
          <div className="font-medium mb-0.5">Renovación desactivada</div>
          <div style={{ color: "var(--p-text-dim)" }}>
            Mantienes el acceso hasta {endDate ? fmtDate(endDate) : "el final del periodo"}. Después no se cobrará más.
          </div>
        </div>
        <button
          onClick={() => toggle(true)}
          disabled={saving}
          className="text-xs font-semibold px-4 py-2 rounded-lg"
          style={{
            background: "var(--p-accent)",
            color: "var(--p-accent-ink)",
            opacity: saving ? 0.5 : 1,
          }}
        >
          {saving ? "Guardando…" : "Reactivar renovación"}
        </button>
        {error && (
          <div className="mt-2 text-xs" style={{ color: "#EF4444" }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  // Estado 2: no está cancelada — botón "Cancelar" con modal de confirmación
  return (
    <div className="text-xs" style={{ color: "var(--p-text-dim)" }}>
      <p className="mb-3">
        Puedes desactivar la renovación en cualquier momento. Mantienes el
        acceso hasta el final del periodo ya pagado y no se te cobrará más.
      </p>
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="text-xs font-medium px-4 py-2 rounded-lg"
          style={{
            background: "transparent",
            color: "var(--p-text)",
            border: "1px solid var(--p-border-strong)",
          }}
        >
          Cancelar renovación
        </button>
      ) : (
        <div
          className="rounded-lg p-3"
          style={{
            background: "var(--p-surface-2)",
            border: "1px solid var(--p-border-strong)",
          }}
        >
          <div className="text-xs mb-3" style={{ color: "var(--p-text)" }}>
            ¿Seguro? Tu suscripción no volverá a renovarse. Podrás seguir
            usando la app hasta {endDate ? fmtDate(endDate) : "el final del periodo actual"}.
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => toggle(false)}
              disabled={saving}
              className="flex-1 text-xs font-semibold px-3 py-2 rounded-lg"
              style={{
                background: "#EF4444",
                color: "#FFFFFF",
                opacity: saving ? 0.5 : 1,
              }}
            >
              {saving ? "Cancelando…" : "Sí, cancelar"}
            </button>
            <button
              onClick={() => { setConfirming(false); setError(null); }}
              disabled={saving}
              className="flex-1 text-xs font-medium px-3 py-2 rounded-lg"
              style={{
                background: "transparent",
                color: "var(--p-text-dim)",
                border: "1px solid var(--p-border)",
              }}
            >
              Mantener
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="mt-2 text-xs" style={{ color: "#EF4444" }}>
          {error}
        </div>
      )}
    </div>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
