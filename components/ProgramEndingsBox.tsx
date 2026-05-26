"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock, Check } from "lucide-react";

type Item = {
  assignmentId: string;
  patientId: string;
  patientName: string;
  programName: string;
  daysLeft: number;
  reviewed: boolean;
  notificationId: string | null;
};

export function ProgramEndingsBox({ initialItems }: { initialItems: Item[] }) {
  const [items, setItems] = useState<Item[]>(initialItems);

  if (items.length === 0) return null;

  async function markReviewed(it: Item) {
    if (!it.notificationId) return;
    setItems((arr) => arr.map((x) => (x.assignmentId === it.assignmentId ? { ...x, reviewed: true } : x)));
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: it.notificationId }),
    }).catch(() => {});
  }

  const pending = items.filter((i) => !i.reviewed).length;

  return (
    <section className="card mb-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full" style={{ background: "linear-gradient(180deg, #FCD34D 0%, #F59E0B 100%)" }} />
      <div className="flex items-center gap-2 mb-3 pl-2">
        <CalendarClock size={16} className="text-amber-600" />
        <h2 className="font-medium text-sm">Programas a punto de terminar</h2>
        {pending > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#DC2626", color: "#fff" }}>{pending}</span>
        )}
      </div>
      <p className="text-xs text-neutral-500 pl-2 mb-3">
        Estos pacientes terminan un programa en menos de una semana. Prepara el siguiente bloque y márcalo como revisado.
      </p>

      <div className="divide-y divide-neutral-100 pl-2">
        {items.map((it) => (
          <div key={it.assignmentId} className={`flex items-center justify-between gap-3 py-2.5 ${it.reviewed ? "opacity-50" : ""}`}>
            <div className="min-w-0">
              <Link href={`/fisio/paciente/${it.patientId}/calendario`} className="text-sm font-medium hover:underline">
                {it.patientName}
              </Link>
              <div className="text-xs text-neutral-500 truncate">
                {it.programName} · {it.daysLeft === 0 ? "termina hoy" : `${it.daysLeft} día${it.daysLeft === 1 ? "" : "s"} para terminar`}
              </div>
            </div>
            {it.reviewed ? (
              <span className="text-xs text-emerald-700 flex items-center gap-1 flex-shrink-0"><Check size={14} /> Revisado</span>
            ) : (
              <button
                onClick={() => markReviewed(it)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0"
                style={{ background: "#FCD34D", color: "#0A0A0A" }}
              >
                Marcar revisado
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
