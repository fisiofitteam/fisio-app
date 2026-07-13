"use client";

/**
 * Botón "⏱ Timer" que aparece dentro de una tarea WORKOUT del rolling.
 * Al pulsar abre el WorkoutTimer en modal fullscreen, precargado con la
 * config detectada desde el título/body de la tarea (si el parser matchea).
 * Si no matchea, el modal empieza en pantalla de configuración manual.
 */

import { useState } from "react";
import { Timer } from "lucide-react";
import { WorkoutTimer } from "@/components/WorkoutTimer";
import { detectTimerConfig, modeLabel } from "@/lib/parse-timer-config";

export function TaskTimerButton({
  taskTitle,
  taskBody,
}: {
  taskTitle: string;
  taskBody?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const detected = detectTimerConfig({ title: taskTitle, body: taskBody });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 mt-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
        style={{
          background: "var(--p-accent, #FCD34D)",
          color: "#0A0A0A",
        }}
      >
        <Timer size={15} />
        {detected ? `Iniciar ${modeLabel(detected.mode)}` : "Abrir cronómetro"}
      </button>
      {open && (
        <WorkoutTimer
          taskTitle={taskTitle}
          initialConfig={detected}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
