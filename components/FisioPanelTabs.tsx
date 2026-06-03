"use client";

import { useState } from "react";
import { MySalaryTab } from "@/components/MySalaryTab";

type Tab = "tareas" | "gestion" | "team" | "salary";

/**
 * Pestañas del panel para fisio / head_success.
 *
 * - Fisio normal: "📋 Tareas", "👥 Gestión de pacientes" y "💶 Mis métricas y salario".
 * - Head_success: lo anterior + "📊 Métricas equipo".
 *
 * Reorganización: antes había una pestaña 'Panel' que contenía todo. Ahora
 * dividimos en "Tareas" (board semanal + puntuales) y "Gestión de pacientes"
 * (Programas a terminar, controles de cargas, renovaciones, formularios,
 * llamadas) para que el panel principal no se quede saturado.
 */
export function FisioPanelTabs({
  tareasContent,
  gestionContent,
  panel,
  teamBlock,
  professionalId,
}: {
  tareasContent?: React.ReactNode;
  gestionContent?: React.ReactNode;
  /** Modo legacy: un único contenido sin pestañas internas (cerrador). */
  panel?: React.ReactNode;
  teamBlock?: React.ReactNode | null;
  professionalId: string;
}) {
  const splitMode = tareasContent !== undefined || gestionContent !== undefined;
  const [tab, setTab] = useState<Tab>(splitMode ? "tareas" : "gestion");
  const showTeam = !!teamBlock;

  function btnClass(active: boolean): string {
    return `px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
      active ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"
    }`;
  }

  // Modo legacy (un solo `panel`): se usa para el closer. Mostramos
  // "Panel" + (Métricas equipo) + "Mis métricas y salario".
  if (!splitMode) {
    // Mapeamos "tareas" → "panel" virtualmente.
    const legacyTab: "panel" | "team" | "salary" =
      tab === "team" ? "team" : tab === "salary" ? "salary" : "panel";
    const setLegacy = (s: "panel" | "team" | "salary") => setTab((s === "panel" ? "tareas" : s) as Tab);
    return (
      <>
        <div className="mb-4 flex gap-1 border-b border-neutral-200 overflow-x-auto">
          <button onClick={() => setLegacy("panel")} className={btnClass(legacyTab === "panel")}>📋 Panel</button>
          {showTeam && <button onClick={() => setLegacy("team")} className={btnClass(legacyTab === "team")}>📊 Métricas equipo</button>}
          <button onClick={() => setLegacy("salary")} className={btnClass(legacyTab === "salary")}>💶 Mis métricas y salario</button>
        </div>
        {legacyTab === "panel" && panel}
        {legacyTab === "team" && showTeam && teamBlock}
        {legacyTab === "salary" && <MySalaryTab professionalId={professionalId} />}
      </>
    );
  }

  return (
    <>
      <div className="mb-4 flex gap-1 border-b border-neutral-200 overflow-x-auto">
        <button onClick={() => setTab("tareas")} className={btnClass(tab === "tareas")}>
          📋 Tareas
        </button>
        <button onClick={() => setTab("gestion")} className={btnClass(tab === "gestion")}>
          👥 Gestión de pacientes
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

      {tab === "tareas" && tareasContent}
      {tab === "gestion" && gestionContent}
      {tab === "team" && showTeam && teamBlock}
      {tab === "salary" && <MySalaryTab professionalId={professionalId} />}
    </>
  );
}
