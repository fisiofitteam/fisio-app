"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { WorkoutTimer } from "@/components/WorkoutTimer";

/**
 * Pantalla dedicada al cronómetro libre del atleta. Renderiza el mismo
 * WorkoutTimer que se abre desde una tarea, pero sin taskBody y sin
 * initialConfig — así arranca directo en el editor de bloques (config
 * panel) para que el atleta arme lo que quiera.
 *
 * Al cerrar el timer (X), vuelve al home del paciente.
 */
export function StandaloneTimerScreen({ patientId }: { patientId: string }) {
  // El timer se abre montado desde el primer render — no necesita un botón
  // intermedio; el atleta ya pulsó "Timer" en el home para llegar aquí.
  // Estado local por si en algún momento cerramos temporalmente sin navegar.
  const [visible, setVisible] = useState(true);

  if (!visible) {
    return (
      <main
        className="min-h-screen flex items-center justify-center px-5"
        style={{ background: "#0A0A0A", color: "#FAFAFA" }}
      >
        <div className="text-center">
          <p className="text-sm opacity-70 mb-4">Timer cerrado</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => setVisible(true)}
              className="px-4 py-2 rounded-lg font-semibold"
              style={{ background: "#FCD34D", color: "#0A0A0A" }}
            >
              Volver a abrir
            </button>
            <Link
              href={`/paciente/${patientId}`}
              className="px-4 py-2 rounded-lg border border-white/20 text-sm inline-flex items-center gap-1"
            >
              <ArrowLeft size={14} /> Inicio
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <WorkoutTimer
      taskTitle="Cronómetro libre"
      onClose={() => setVisible(false)}
    />
  );
}
