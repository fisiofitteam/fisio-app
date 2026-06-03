"use client";

import { useState } from "react";
import type { MeetingCategory } from "@/lib/team-meetings";

const LABELS: Record<MeetingCategory, string> = {
  head_success: "⭐ Head Success",
  comercial: "💼 Equipo Comercial",
  clinical: "🩺 Sesiones Clínicas",
  other: "📌 Otras",
};

export function ReunionesTabs({
  visibleCategories,
  contents,
}: {
  visibleCategories: MeetingCategory[];
  /** Objeto category → ReactNode. Solo se renderizan los del array visible. */
  contents: Partial<Record<MeetingCategory, React.ReactNode>>;
}) {
  const [tab, setTab] = useState<MeetingCategory>(visibleCategories[0] ?? "other");

  function btnClass(active: boolean): string {
    return `px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
      active ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"
    }`;
  }

  return (
    <>
      <div className="mb-4 flex gap-1 border-b border-neutral-200 overflow-x-auto">
        {visibleCategories.map((c) => (
          <button key={c} onClick={() => setTab(c)} className={btnClass(tab === c)}>
            {LABELS[c]}
          </button>
        ))}
      </div>
      {contents[tab]}
    </>
  );
}
