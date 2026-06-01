"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dumbbell } from "lucide-react";

const OPTIONS = [2, 3, 4, 5];

/**
 * Selector compacto que vive en la cabecera de la ficha del paciente, junto a
 * "Exportar PDF". Permite al fisio elegir cada cuántas semanas quiere revisar
 * el control de cargas del paciente. El valor se persiste en
 * Patient.loadReviewIntervalWeeks y alimenta el recuadro "Controles de cargas
 * pendientes" del panel principal.
 */
export function LoadReviewIntervalSelector({
  patientId,
  initialWeeks,
}: {
  patientId: string;
  initialWeeks: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [weeks, setWeeks] = useState<number>(initialWeeks);
  const [saving, setSaving] = useState(false);

  async function pick(n: number) {
    setSaving(true);
    setWeeks(n);
    setOpen(false);
    await fetch("/api/patients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: patientId, loadReviewIntervalWeeks: n }),
    }).catch(() => {});
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        className="btn btn-ghost text-xs flex items-center gap-1.5"
        title="Cada cuántas semanas revisar el control de cargas"
      >
        <Dumbbell size={13} />
        Revisión de cargas
        <span className="font-semibold tabular-nums">{weeks}sem</span>
        <span className="text-neutral-400" style={{ fontSize: 9 }}>▼</span>
      </button>
      {open && (
        <>
          {/* Overlay para cerrar al pulsar fuera */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 mt-1 rounded-lg shadow-lg z-40 py-1"
            style={{ background: "#fff", border: "1px solid #E5E5E5", minWidth: 140 }}
          >
            <div className="text-[10px] text-neutral-500 uppercase tracking-wider px-3 py-1.5">
              Cada cuántas semanas
            </div>
            {OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => pick(n)}
                className={`w-full text-left text-sm px-3 py-1.5 hover:bg-neutral-50 flex items-center justify-between ${
                  weeks === n ? "font-semibold text-neutral-900" : "text-neutral-700"
                }`}
              >
                <span>{n} semanas</span>
                {weeks === n && <span className="text-emerald-600">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
