"use client";

/**
 * Botón "⏱ Timer" dentro de una tarea WORKOUT. Al abrir el modal:
 *   1. Comprueba caché localStorage por hash del texto.
 *   2. Si no hay caché, llama a /api/timer-parse (Claude Haiku) para
 *      interpretar el enunciado y devolver la config del timer.
 *   3. Fallback: si la IA no confía o falla, usa el parser regex local.
 *   4. Si tampoco → abre el modal con selector manual vacío.
 */

import { useState } from "react";
import { Timer, Sparkles } from "lucide-react";
import { WorkoutTimer } from "@/components/WorkoutTimer";
import { detectTimerConfig, type TimerConfig } from "@/lib/parse-timer-config";

const CACHE_PREFIX = "fisio-timer-cfg-v4:";

function contentHash(s: string): string {
  // Hash simple djb2 — suficiente para cache key
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function getCached(key: string): TimerConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as TimerConfig) : null;
  } catch { return null; }
}
function setCached(key: string, cfg: TimerConfig) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(cfg)); } catch { /* noop */ }
}

export function TaskTimerButton({
  taskTitle,
  taskBody,
}: {
  taskTitle: string;
  taskBody?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cfg, setCfg] = useState<TimerConfig | null>(null);

  async function handleClick() {
    if (loading) return;
    const key = contentHash(`${taskTitle}\n${taskBody ?? ""}`);
    const cached = getCached(key);
    if (cached) {
      setCfg(cached);
      setOpen(true);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/timer-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: taskTitle, body: taskBody ?? "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok && data?.config?.blocks?.length) {
        setCached(key, data.config);
        setCfg(data.config);
      } else {
        // Fallback al parser regex local
        const local = detectTimerConfig({ title: taskTitle, body: taskBody });
        setCfg(local ?? null);
      }
    } catch {
      const local = detectTimerConfig({ title: taskTitle, body: taskBody });
      setCfg(local ?? null);
    } finally {
      setLoading(false);
      setOpen(true);
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 mt-3 px-4 py-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-70 shadow-sm hover:shadow-md"
        style={{
          background: "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)",
          color: "#0A0A0A",
        }}
      >
        {loading ? (
          <>
            <Sparkles size={15} className="animate-pulse" />
            Interpretando…
          </>
        ) : (
          <>
            <Timer size={15} />
            Iniciar cronómetro
          </>
        )}
      </button>
      {open && (
        <WorkoutTimer
          taskTitle={taskTitle}
          taskBody={taskBody}
          initialConfig={cfg}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
