"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Bloque "Zona de peligro" para borrar un paciente. Solo se renderiza si el
 * usuario es CEO.
 *
 * Flujo:
 *  1. Estado colapsado: solo un texto pequeño "Borrar paciente" (rojo, pequeño).
 *  2. Al click: se expande mostrando:
 *     - Advertencia explícita de lo que se borra
 *     - Input donde hay que teclear el NOMBRE EXACTO del paciente
 *     - Botón "Borrar definitivamente" deshabilitado hasta que el nombre coincida
 *  3. Al confirmar: DELETE /api/patients/[id] con { confirm: fullName }.
 *  4. Tras éxito: redirige a /fisio/pacientes.
 *
 * No se puede deshacer. Los datos contables (Sale) se conservan
 * desvinculados; el resto cascade-delete.
 */
export function DeletePatientButton({
  patientId,
  fullName,
}: {
  patientId: string;
  fullName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = typed.trim() === fullName.trim();

  async function doDelete() {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/patients/${patientId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: fullName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      // Redirección hard para limpiar cualquier estado en memoria.
      window.location.href = "/fisio/pacientes";
    } catch (e: any) {
      setError(e?.message || "Error al borrar el paciente");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-8 pt-4 border-t border-neutral-100">
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-red-600 hover:text-red-800 hover:underline"
        >
          🗑️ Borrar paciente
        </button>
      </div>
    );
  }

  return (
    <div
      className="mt-8 rounded-xl p-4"
      style={{ background: "#FEF2F2", border: "1px solid #FCA5A5" }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h3 className="text-sm font-bold" style={{ color: "#991B1B" }}>
          ⚠️ Zona de peligro
        </h3>
        <button
          onClick={() => {
            setOpen(false);
            setTyped("");
            setError(null);
          }}
          className="text-xs text-red-700 hover:underline"
        >
          Cancelar
        </button>
      </div>

      <p className="text-xs mb-3" style={{ color: "#7F1D1D" }}>
        Vas a borrar definitivamente a <strong>{fullName}</strong> de la base de datos.
        Esto incluye sus métricas, sesiones, WODs, PRs, daily logs, pausas, adaptaciones,
        notificaciones, login codes, casos clínicos, posts en comunidad, comentarios,
        reacciones, progreso de lecciones y resultados de challenges.
        <br />
        <br />
        Las ventas (facturación) se conservan desvinculadas — no se borran datos contables.
        <br />
        <br />
        <strong>Esta acción no se puede deshacer.</strong>
      </p>

      <label className="text-xs font-medium block mb-1.5" style={{ color: "#7F1D1D" }}>
        Para confirmar, escribe el nombre exacto del paciente:
        <span className="block font-mono mt-1 px-2 py-1 rounded text-[11px]" style={{ background: "#FFFFFF", border: "1px solid #FCA5A5", color: "#0A0A0A" }}>
          {fullName}
        </span>
      </label>
      <input
        type="text"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder="Escribe el nombre completo aquí"
        className="w-full text-sm p-2.5 rounded-lg outline-none mt-2 font-mono"
        style={{ background: "#FFFFFF", border: "1px solid #FCA5A5" }}
        autoFocus
      />

      {error && (
        <div
          className="rounded-lg px-3 py-2 mt-3 text-xs"
          style={{ background: "#FEE2E2", border: "1px solid #DC2626", color: "#7F1D1D" }}
        >
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={() => {
            setOpen(false);
            setTyped("");
            setError(null);
          }}
          className="text-xs px-3 py-2 rounded-lg"
          style={{ color: "#7F1D1D" }}
          disabled={busy}
        >
          Cancelar
        </button>
        <button
          onClick={doDelete}
          disabled={!canConfirm || busy}
          className="text-xs font-bold px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "#DC2626", color: "#FFFFFF", border: "none" }}
        >
          {busy ? "Borrando…" : "Borrar definitivamente"}
        </button>
      </div>
    </div>
  );
}
