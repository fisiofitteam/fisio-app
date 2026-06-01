"use client";

import Link from "next/link";
import { useState } from "react";
import { Dumbbell } from "lucide-react";
import type { LoadReviewItem } from "@/lib/load-reviews";

export function LoadReviewsBox({ initialItems }: { initialItems: LoadReviewItem[] }) {
  const [items, setItems] = useState<LoadReviewItem[]>(initialItems);

  async function markReviewed(it: LoadReviewItem) {
    setItems((arr) => arr.filter((x) => x.patientId !== it.patientId));
    await fetch("/api/patients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: it.patientId, loadReviewLastAt: new Date().toISOString() }),
    }).catch(() => {});
  }

  return (
    <section className="card relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full" style={{ background: "linear-gradient(180deg, #93C5FD 0%, #2563EB 100%)" }} />
      <div className="flex items-center gap-2 mb-3 pl-2">
        <Dumbbell size={16} className="text-blue-600" />
        <h2 className="font-medium text-sm">Controles de cargas pendientes</h2>
        {items.length > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#DC2626", color: "#fff" }}>{items.length}</span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-neutral-400 pl-2 py-2">Sin revisiones pendientes esta semana.</p>
      ) : (
        <>
          <p className="text-xs text-neutral-500 pl-2 mb-3">
            Atletas a los que toca revisar el control de cargas. Cuando lo hagas, marca aquí mismo como revisado y volverá a salir cuando toque.
          </p>
          <div className="divide-y divide-neutral-100 pl-2">
            {items.map((it) => (
              <div key={it.patientId} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <Link href={`/fisio/paciente/${it.patientId}/cargas`} className="text-sm font-medium hover:underline">
                    {it.patientName}
                  </Link>
                  <div className="text-xs text-neutral-500 truncate">
                    Cada {it.intervalWeeks} sem ·{" "}
                    {it.firstTime
                      ? "primera revisión"
                      : it.daysOverdue === 0
                      ? "toca hoy"
                      : `${it.daysOverdue} día${it.daysOverdue === 1 ? "" : "s"} de retraso`}
                  </div>
                </div>
                <button
                  onClick={() => markReviewed(it)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0"
                  style={{ background: "#DBEAFE", color: "#1E3A8A" }}
                >
                  Marcar revisado
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
