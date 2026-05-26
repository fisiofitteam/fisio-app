"use client";

import { useState } from "react";
import { MySalaryTab } from "@/components/MySalaryTab";

export function FisioPanelTabs({ panel, professionalId }: { panel: React.ReactNode; professionalId: string }) {
  const [tab, setTab] = useState<"panel" | "salary">("panel");

  return (
    <>
      <div className="mb-4 flex gap-1 border-b border-neutral-200 overflow-x-auto">
        <button
          onClick={() => setTab("panel")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === "panel" ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"}`}
        >
          📋 Panel
        </button>
        <button
          onClick={() => setTab("salary")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === "salary" ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"}`}
        >
          💶 Mis métricas y salario
        </button>
      </div>

      {tab === "panel" ? panel : <MySalaryTab professionalId={professionalId} />}
    </>
  );
}
