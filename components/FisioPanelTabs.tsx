"use client";

import { useState } from "react";
import { MySalaryTab } from "@/components/MySalaryTab";

type Tab = "panel" | "team" | "salary";

/**
 * Pestañas del panel para fisio / head_success.
 *
 * - Fisio normal: solo "📋 Panel" y "💶 Mis métricas y salario".
 * - Head_success: además "📊 Métricas equipo" en medio (cuando se pasa
 *   `teamBlock`). En esa pestaña se aísla todo lo del equipo (renovaciones,
 *   adherencia por fisio, etc.), dejando el panel principal limpio para su
 *   trabajo con pacientes.
 */
export function FisioPanelTabs({
  panel,
  teamBlock,
  professionalId,
}: {
  panel: React.ReactNode;
  /** Bloque de métricas de equipo. Si es null/undefined, no se muestra la pestaña. */
  teamBlock?: React.ReactNode | null;
  professionalId: string;
}) {
  const [tab, setTab] = useState<Tab>("panel");
  const showTeam = !!teamBlock;

  function btnClass(active: boolean): string {
    return `px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
      active ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"
    }`;
  }

  return (
    <>
      <div className="mb-4 flex gap-1 border-b border-neutral-200 overflow-x-auto">
        <button onClick={() => setTab("panel")} className={btnClass(tab === "panel")}>
          📋 Panel
        </button>
        {showTeam && (
          <button onClick={() => setTab("team")} className={btnClass(tab === "team")}>
            📊 Métricas equipo
          </button>
        )}
        <button onClick={() => setTab("salary")} className={btnClass(tab === "salary")}>
          💶 Mis métricas y salario
        </button>
      </div>

      {tab === "panel" && panel}
      {tab === "team" && showTeam && teamBlock}
      {tab === "salary" && <MySalaryTab professionalId={professionalId} />}
    </>
  );
}
