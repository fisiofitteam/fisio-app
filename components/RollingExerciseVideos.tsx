"use client";

import { useState } from "react";
import { youtubeEmbedUrl } from "@/lib/youtube";

export type RollingExercise = {
  id: string;
  name: string;
  category: string;
  youtubeUrl: string | null;
  description: string | null;
};

/**
 * Bloque "Vídeos de referencia" que se muestra al final de una tarea WORKOUT
 * del programa rolling ADVANCE. Cada ejercicio es una fila colapsable que
 * despliega un iframe de YouTube. Espejo del comportamiento que ya existe
 * en SessionRunner para RECUPERA/CONSOLIDA.
 */
export function RollingExerciseVideos({ exercises }: { exercises: RollingExercise[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (exercises.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--p-text-faint)" }}>
        🎥 Vídeos de referencia
      </div>
      <div className="space-y-2">
        {exercises.map((ex) => {
          const embed = ex.youtubeUrl ? youtubeEmbedUrl(ex.youtubeUrl) : null;
          const isOpen = openId === ex.id;
          return (
            <div
              key={ex.id}
              className="rounded-lg overflow-hidden"
              style={{ background: "var(--p-surface-2)", border: "1px solid var(--p-border)" }}
            >
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : ex.id)}
                className="w-full text-left p-3 flex justify-between items-center"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{ex.name}</div>
                  <div className="text-[11px]" style={{ color: "var(--p-text-faint)" }}>
                    {ex.category}
                  </div>
                </div>
                <span style={{ color: "var(--p-text-faint)" }} className="text-lg leading-none">
                  {isOpen ? "▴" : "▾"}
                </span>
              </button>
              {isOpen && (
                <div className="border-t p-3" style={{ borderColor: "var(--p-border)", background: "var(--p-surface)" }}>
                  {embed ? (
                    <div className="aspect-video rounded-lg overflow-hidden bg-black mb-2">
                      <iframe src={embed} className="w-full h-full" allowFullScreen />
                    </div>
                  ) : (
                    <p className="text-xs italic" style={{ color: "var(--p-text-faint)" }}>Sin vídeo asociado.</p>
                  )}
                  {ex.description && (
                    <p className="text-xs italic" style={{ color: "var(--p-text-dim)" }}>{ex.description}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
