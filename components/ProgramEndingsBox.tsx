"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock } from "lucide-react";

type Item = {
  patientId: string;
  patientName: string;
  programName: string;
  daysLeft: number;
  notificationId: string;
};

export function ProgramEndingsBox({ initialItems }: { initialItems: Item[] }) {
  const [items, setItems] = useState<Item[]>(initialItems);

  async function markReviewed(it: Item) {
    setItems((arr) => arr.filter((x) => x.patientId !== it.patientId)); // desaparece
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: it.notificationId }),
    }).catch(() => {});
  }

  return (
    <section className="card mb-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full" style={{ background: "linear-gradient(180deg, #FCD34D 0%, #F59E0B 100%)" }} />
      <div className="flex items-center gap-2 mb-3 pl-2">
        <CalendarClock size={16} className="text-amber-600" />
        <h2 className="font-medium text-sm">Programas a punto de terminar</h2>
        {items.length > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#DC2626", color: "#fff" }}>{items.length}</span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-neutral-400 pl-2 py-2">Sin programas pendientes de terminar.</p>
      ) : (
        <>
          <p className="text-xs text-neutral-500 pl-2 mb-3">
            Estos pacientes terminan un programa en menos de una semana. Prepara el siguiente bloque y márcalo como revisado.
          </p>
          <div className="divide-y divide-neutral-100 pl-2">
            {items.map((it) => (
              <div key={it.patientId} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <Link href={`/fisio/paciente/${it.patientId}/calendario`} className="text-sm font-medium hover:underline">
                    {it.patientName}
                  </Link>
                  <div className="text-xs text-neutral-500 truncate">
                    {it.programName} · {it.daysLeft === 0 ? "termina hoy" : `${it.daysLeft} día${it.daysLeft === 1 ? "" : "s"} para terminar`}
                  </div>
                </div>
                <button
                  onClick={() => markReviewed(it)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0"
                  style={{ background: "#FCD34D", color: "#0A0A0A" }}
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
