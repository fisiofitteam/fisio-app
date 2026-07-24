"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ghost } from "lucide-react";

/**
 * Toggle "Modo fantasma" solo visible al CEO en la sidebar de la ficha
 * del paciente. Al cambiar, se hace PATCH a /api/patients/[id]/test-mode
 * y router.refresh() para que las agregaciones (KPIs, alertas, etc)
 * vuelvan a calcularse.
 */
export function PatientTestModeToggle({ patientId, initial, patientName }: { patientId: string; initial: boolean; patientName: string }) {
  const router = useRouter();
  const [isTest, setIsTest] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !isTest;
    const msg = next
      ? `¿Marcar a ${patientName} como paciente fantasma? Dejará de contar en KPIs, alertas, resúmenes y llamadas automáticas.`
      : `¿Devolver a ${patientName} al pipeline normal? Volverá a contar en todas las métricas.`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/patients/${patientId}/test-mode`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isTest: next }),
      });
      if (r.ok) {
        setIsTest(next);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className="btn btn-ghost text-xs justify-start flex items-center gap-1.5 disabled:opacity-50"
      title={isTest ? "Marcado como fantasma — no cuenta en métricas" : "Marcar como paciente fantasma (test)"}
      style={isTest ? { color: "#7C3AED" } : undefined}
    >
      <Ghost size={13} /> {isTest ? "Devolver a real" : "Modo fantasma"}
    </button>
  );
}
