"use client";

/**
 * Modal fullscreen con timer para tareas WORKOUT del rolling. Cubre EMOM,
 * Tabata, Intervalos, AMRAP y For time. Incluye:
 *   - Pitos programáticos con Web Audio API (sin assets externos).
 *   - Vibración en móvil (navigator.vibrate).
 *   - Wake Lock para no dormir el iPhone durante la sesión.
 *   - Precisión via performance.now() + requestAnimationFrame (no
 *     acumulamos drift del setInterval).
 *
 * Si viene con `initialConfig` (detectado desde el título/body de la tarea)
 * arranca en la pantalla READY. Si no, muestra selector de modo.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Play, Pause, RotateCcw, Volume2, VolumeX, Vibrate, Settings2 } from "lucide-react";
import {
  detectTimerConfig,
  estimateTimerTotalSeconds,
  modeLabel,
  type TimerConfig,
  type TimerMode,
} from "@/lib/parse-timer-config";

// ────────────────────────── helpers de tiempo ──────────────────────────

function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

// ────────────────────────── audio + vibración ──────────────────────────

// Pito programático con OscillatorNode. Único audio-context reutilizado.
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (_audioCtx) return _audioCtx;
  try {
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) return null;
    _audioCtx = new AC();
    return _audioCtx;
  } catch { return null; }
}

function beep(freq: number, durationMs: number) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.value = 0;
  osc.connect(gain).connect(ctx.destination);
  const now = ctx.currentTime;
  gain.gain.linearRampToValueAtTime(0.35, now + 0.005);
  gain.gain.linearRampToValueAtTime(0, now + durationMs / 1000);
  osc.start(now);
  osc.stop(now + durationMs / 1000 + 0.02);
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try { (navigator as any).vibrate(pattern); } catch { /* noop */ }
  }
}

// ────────────────────────── wake lock ──────────────────────────

function useWakeLock(active: boolean) {
  const lockRef = useRef<any>(null);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      try {
        if ("wakeLock" in navigator) {
          const lock = await (navigator as any).wakeLock.request("screen");
          if (cancelled) { lock.release(); return; }
          lockRef.current = lock;
        }
      } catch { /* ignore */ }
    })();
    return () => {
      cancelled = true;
      lockRef.current?.release?.().catch(() => {});
      lockRef.current = null;
    };
  }, [active]);
}

// ────────────────────────── estado del timer ──────────────────────────

type Phase = "ready" | "prep" | "work" | "rest" | "done";

type Snapshot = {
  phase: Phase;
  round: number;          // 1-based
  totalRounds: number;    // 0 = no aplica (AMRAP / For time)
  phaseRemainingMs: number;
  totalElapsedMs: number; // For time
};

const PREP_MS = 3000; // 3 segundos de cuenta atrás antes de arrancar

function initialSnapshot(cfg: TimerConfig): Snapshot {
  switch (cfg.mode) {
    case "emom": {
      const totalRounds = Math.max(1, Math.round(cfg.totalSeconds / cfg.intervalSeconds));
      return { phase: "ready", round: 1, totalRounds, phaseRemainingMs: cfg.intervalSeconds * 1000, totalElapsedMs: 0 };
    }
    case "tabata":
    case "intervals":
      return { phase: "ready", round: 1, totalRounds: cfg.rounds, phaseRemainingMs: cfg.workSeconds * 1000, totalElapsedMs: 0 };
    case "amrap":
      return { phase: "ready", round: 0, totalRounds: 0, phaseRemainingMs: cfg.totalSeconds * 1000, totalElapsedMs: 0 };
    case "fortime":
      return { phase: "ready", round: 0, totalRounds: 0, phaseRemainingMs: cfg.capSeconds ? cfg.capSeconds * 1000 : 0, totalElapsedMs: 0 };
  }
}

// ────────────────────────── componente ──────────────────────────

export function WorkoutTimer({
  taskTitle,
  initialConfig,
  onClose,
}: {
  taskTitle: string;
  initialConfig?: TimerConfig | null;
  onClose: () => void;
}) {
  const [config, setConfig] = useState<TimerConfig | null>(initialConfig ?? null);
  const [snap, setSnap] = useState<Snapshot | null>(config ? initialSnapshot(config) : null);
  const [running, setRunning] = useState(false);
  const [audioOn, setAudioOn] = useState(true);
  const [vibrateOn, setVibrateOn] = useState(true);
  const [showConfig, setShowConfig] = useState(!config);

  useWakeLock(running);

  // ─── Motor del tiempo: performance.now() + rAF ───
  // Guardamos la marca absoluta de comienzo de la fase, y en cada frame
  // recalculamos remainingMs para no acumular drift.
  const phaseStartRef = useRef<number>(0);       // performance.now() al empezar la fase actual
  const phaseTotalRef = useRef<number>(0);        // duración total en ms de la fase actual
  const totalStartRef = useRef<number>(0);        // performance.now() al empezar el timer
  const rafRef = useRef<number | null>(null);
  const prevSecondRef = useRef<number>(-1);       // para no repetir beeps al bajar del mismo segundo

  const scheduleFrame = useCallback(() => {
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const tick = useCallback(() => {
    setSnap((prev) => {
      if (!prev || !config) return prev;
      const now = performance.now();
      const phaseElapsed = now - phaseStartRef.current;
      const totalElapsed = now - totalStartRef.current;

      // For time: sube. El resto: baja.
      if (config.mode === "fortime") {
        // ¿cap alcanzado?
        if (config.capSeconds && totalElapsed >= config.capSeconds * 1000) {
          finishBeep();
          setRunning(false);
          return { ...prev, phase: "done", totalElapsedMs: config.capSeconds * 1000 };
        }
        // Beep cada minuto exacto
        const currentSec = Math.floor(totalElapsed / 1000);
        if (currentSec !== prevSecondRef.current && currentSec > 0 && currentSec % 60 === 0) {
          tickBeep();
        }
        prevSecondRef.current = currentSec;
        return { ...prev, totalElapsedMs: totalElapsed };
      }

      const remainingMs = phaseTotalRef.current - phaseElapsed;

      // Últimos 3s de la fase: pitos cortos por segundo
      const remainingSec = Math.ceil(remainingMs / 1000);
      if (remainingSec !== prevSecondRef.current && remainingSec > 0 && remainingSec <= 3) {
        countdownBeep();
      }
      prevSecondRef.current = remainingSec;

      if (remainingMs <= 0) {
        return advancePhase(config, prev, totalElapsed);
      }
      return { ...prev, phaseRemainingMs: remainingMs, totalElapsedMs: totalElapsed };
    });
    if (rafRef.current !== null) scheduleFrame();
  }, [config, scheduleFrame]);

  // ─── Feedback: beeps + vibración ───
  const tickBeep = () => { if (audioOn) beep(880, 120); if (vibrateOn) vibrate(80); };
  const countdownBeep = () => { if (audioOn) beep(660, 80); if (vibrateOn) vibrate(50); };
  const startBeep = () => { if (audioOn) { beep(880, 180); } if (vibrateOn) vibrate([120, 50, 120]); };
  const restBeep = () => { if (audioOn) beep(440, 200); if (vibrateOn) vibrate(120); };
  const finishBeep = () => {
    if (audioOn) { beep(1046, 250); setTimeout(() => beep(1318, 300), 260); }
    if (vibrateOn) vibrate([200, 100, 200, 100, 400]);
  };

  // ─── Avance de fase (llamado cuando remainingMs llega a 0) ───
  function advancePhase(cfg: TimerConfig, curr: Snapshot, totalElapsed: number): Snapshot {
    const now = performance.now();

    switch (cfg.mode) {
      case "emom": {
        if (curr.round >= curr.totalRounds) {
          finishBeep();
          setRunning(false);
          return { ...curr, phase: "done", phaseRemainingMs: 0, totalElapsedMs: totalElapsed };
        }
        tickBeep();
        const nextRound = curr.round + 1;
        phaseStartRef.current = now;
        phaseTotalRef.current = cfg.intervalSeconds * 1000;
        prevSecondRef.current = -1;
        return { ...curr, round: nextRound, phase: "work", phaseRemainingMs: cfg.intervalSeconds * 1000, totalElapsedMs: totalElapsed };
      }
      case "tabata":
      case "intervals": {
        if (curr.phase === "work" || curr.phase === "prep") {
          // Pasa a rest, salvo que restSeconds sea 0 y saltamos directo a la próxima work
          if (cfg.restSeconds > 0) {
            restBeep();
            phaseStartRef.current = now;
            phaseTotalRef.current = cfg.restSeconds * 1000;
            prevSecondRef.current = -1;
            return { ...curr, phase: "rest", phaseRemainingMs: cfg.restSeconds * 1000, totalElapsedMs: totalElapsed };
          }
        }
        // Terminó rest (o work sin rest) → próxima ronda o fin
        if (curr.round >= curr.totalRounds) {
          finishBeep();
          setRunning(false);
          return { ...curr, phase: "done", phaseRemainingMs: 0, totalElapsedMs: totalElapsed };
        }
        tickBeep();
        phaseStartRef.current = now;
        phaseTotalRef.current = cfg.workSeconds * 1000;
        prevSecondRef.current = -1;
        return { ...curr, phase: "work", round: curr.round + 1, phaseRemainingMs: cfg.workSeconds * 1000, totalElapsedMs: totalElapsed };
      }
      case "amrap": {
        finishBeep();
        setRunning(false);
        return { ...curr, phase: "done", phaseRemainingMs: 0, totalElapsedMs: totalElapsed };
      }
      case "fortime": {
        // Nunca llegamos aquí normalmente (For time no cuenta atrás salvo cap)
        return curr;
      }
    }
  }

  // ─── Control START/PAUSE/RESET ───
  const start = () => {
    if (!config) return;
    // Un tap del user habilita el audio en iOS
    const ctx = getAudioCtx();
    if (ctx?.state === "suspended") ctx.resume().catch(() => {});

    // Prep de 3 segundos
    setSnap((prev) => {
      if (!prev) return prev;
      const now = performance.now();
      phaseStartRef.current = now;
      phaseTotalRef.current = PREP_MS;
      totalStartRef.current = now;
      prevSecondRef.current = -1;
      return { ...prev, phase: "prep", phaseRemainingMs: PREP_MS, totalElapsedMs: 0 };
    });
    setRunning(true);
    setShowConfig(false);
  };

  const pause = () => {
    // Cancela el rAF; guarda cuánto tiempo llevaba de fase y luego, al reanudar,
    // vuelve a marcar phaseStartRef ajustando ese offset.
    setRunning(false);
  };

  const resume = () => {
    if (!snap || !config) return;
    const now = performance.now();
    // Rehacer phase/total start references
    phaseStartRef.current = now - (phaseTotalRef.current - snap.phaseRemainingMs);
    totalStartRef.current = now - snap.totalElapsedMs;
    prevSecondRef.current = -1;
    setRunning(true);
  };

  const reset = () => {
    if (!config) return;
    setSnap(initialSnapshot(config));
    setRunning(false);
    prevSecondRef.current = -1;
  };

  // ─── Bucle rAF ligado a running ───
  useEffect(() => {
    if (!running) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    // Cuando se reanuda tras pause, tick() ya calcula sobre las refs actualizadas.
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [running, tick]);

  // ─── Prep → primera fase real ───
  // Cuando la fase "prep" llega a 0, arrancamos "work" (o el modo directo).
  useEffect(() => {
    if (!snap || snap.phase !== "prep") return;
    if (snap.phaseRemainingMs > 0) return;
    if (!config) return;
    // Arrancar fase real
    startBeep();
    const now = performance.now();
    phaseStartRef.current = now;
    prevSecondRef.current = -1;

    if (config.mode === "fortime") {
      totalStartRef.current = now;
      setSnap((s) => (s ? { ...s, phase: "work", phaseRemainingMs: 0, totalElapsedMs: 0 } : s));
      return;
    }
    if (config.mode === "amrap") {
      phaseTotalRef.current = config.totalSeconds * 1000;
      setSnap((s) => (s ? { ...s, phase: "work", phaseRemainingMs: config.totalSeconds * 1000 } : s));
      return;
    }
    if (config.mode === "emom") {
      phaseTotalRef.current = config.intervalSeconds * 1000;
      setSnap((s) => (s ? { ...s, phase: "work", phaseRemainingMs: config.intervalSeconds * 1000, round: 1 } : s));
      return;
    }
    // tabata / intervals
    phaseTotalRef.current = config.workSeconds * 1000;
    setSnap((s) => (s ? { ...s, phase: "work", phaseRemainingMs: config.workSeconds * 1000, round: 1 } : s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap?.phase, snap?.phaseRemainingMs, config]);

  // ─── UI ───
  const displaySeconds = useMemo(() => {
    if (!snap || !config) return 0;
    if (snap.phase === "done") return 0;
    if (snap.phase === "prep") return Math.ceil(snap.phaseRemainingMs / 1000);
    if (config.mode === "fortime") return Math.floor(snap.totalElapsedMs / 1000);
    return Math.ceil(snap.phaseRemainingMs / 1000);
  }, [snap, config]);

  const phaseLabel = (() => {
    if (!snap) return "";
    if (snap.phase === "prep") return "PREPARADO";
    if (snap.phase === "done") return "COMPLETADO";
    if (snap.phase === "rest") return "DESCANSO";
    if (config?.mode === "amrap") return "AMRAP";
    if (config?.mode === "fortime") return "FOR TIME";
    return "GO";
  })();

  const bgColor = (() => {
    if (!snap) return "#0A0A0A";
    if (snap.phase === "prep") return "#1E293B";
    if (snap.phase === "rest") return "#0F766E";
    if (snap.phase === "done") return "#166534";
    return "#0A0A0A";
  })();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: bgColor }}>
      {/* Cabecera fija */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 text-white">
        <button onClick={onClose} aria-label="Cerrar" className="p-2 -ml-2">
          <X size={22} />
        </button>
        <div className="text-center min-w-0 flex-1 mx-2">
          <div className="text-xs font-medium truncate opacity-70">{taskTitle}</div>
          {config && (
            <div className="text-[10px] uppercase tracking-widest opacity-50">
              {modeLabel(config.mode)}
              {snap && snap.totalRounds > 0 ? ` · ${snap.round}/${snap.totalRounds}` : ""}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setAudioOn((v) => !v)} className="p-2" aria-label="Sonido">
            {audioOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button onClick={() => setVibrateOn((v) => !v)} className={`p-2 ${vibrateOn ? "" : "opacity-40"}`} aria-label="Vibración">
            <Vibrate size={18} />
          </button>
          {config && (
            <button onClick={() => setShowConfig((v) => !v)} className="p-2" aria-label="Configuración">
              <Settings2 size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Config panel o display principal */}
      {showConfig ? (
        <ConfigPanel
          initial={config}
          onCancel={() => (config ? setShowConfig(false) : onClose())}
          onSave={(c) => {
            setConfig(c);
            setSnap(initialSnapshot(c));
            setShowConfig(false);
            setRunning(false);
          }}
        />
      ) : snap ? (
        <div className="flex flex-col items-center justify-center text-white select-none">
          <div className="text-[10px] uppercase tracking-[0.3em] opacity-60 mb-3">{phaseLabel}</div>
          <div className="font-mono font-bold tabular-nums leading-none" style={{ fontSize: "min(30vw, 22rem)" }}>
            {snap.phase === "prep" ? displaySeconds : fmtTime(displaySeconds)}
          </div>
          {config && snap.totalRounds > 0 && (
            <div className="mt-4 text-sm opacity-70">
              Ronda {snap.round} / {snap.totalRounds}
            </div>
          )}
          <div className="mt-10 flex items-center gap-3">
            <button
              onClick={reset}
              className="w-14 h-14 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20"
              aria-label="Reset"
            >
              <RotateCcw size={22} />
            </button>
            {snap.phase === "done" ? (
              <button
                onClick={reset}
                className="px-8 py-4 rounded-full bg-white text-neutral-900 font-semibold text-lg"
              >
                Repetir
              </button>
            ) : running ? (
              <button
                onClick={pause}
                className="w-20 h-20 rounded-full flex items-center justify-center bg-white text-neutral-900"
                aria-label="Pausar"
              >
                <Pause size={32} />
              </button>
            ) : (
              <button
                onClick={snap.phase === "ready" ? start : resume}
                className="w-20 h-20 rounded-full flex items-center justify-center bg-white text-neutral-900"
                aria-label="Iniciar"
              >
                <Play size={32} className="ml-1" />
              </button>
            )}
            <div className="w-14 h-14" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ────────────────────────── panel de configuración ──────────────────────────

function ConfigPanel({
  initial,
  onSave,
  onCancel,
}: {
  initial: TimerConfig | null;
  onSave: (cfg: TimerConfig) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<TimerMode>(initial?.mode ?? "amrap");
  // Un state por modo para no perder valores al alternar
  const [emomMin, setEmomMin] = useState<number>(initial?.mode === "emom" ? initial.totalSeconds / 60 : 12);
  const [emomInterval, setEmomInterval] = useState<number>(initial?.mode === "emom" ? initial.intervalSeconds : 60);
  const [tabWork, setTabWork] = useState<number>(initial?.mode === "tabata" ? initial.workSeconds : 20);
  const [tabRest, setTabRest] = useState<number>(initial?.mode === "tabata" ? initial.restSeconds : 10);
  const [tabRounds, setTabRounds] = useState<number>(initial?.mode === "tabata" ? initial.rounds : 8);
  const [intWork, setIntWork] = useState<number>(initial?.mode === "intervals" ? initial.workSeconds : 180);
  const [intRest, setIntRest] = useState<number>(initial?.mode === "intervals" ? initial.restSeconds : 90);
  const [intRounds, setIntRounds] = useState<number>(initial?.mode === "intervals" ? initial.rounds : 5);
  const [amrapMin, setAmrapMin] = useState<number>(initial?.mode === "amrap" ? initial.totalSeconds / 60 : 15);
  const [ftCapMin, setFtCapMin] = useState<number>(initial?.mode === "fortime" ? (initial.capSeconds ?? 20) / 60 : 20);
  const [ftUseCap, setFtUseCap] = useState<boolean>(initial?.mode === "fortime" ? initial.capSeconds !== null : false);

  function build(): TimerConfig {
    switch (mode) {
      case "emom": return { mode, totalSeconds: emomMin * 60, intervalSeconds: emomInterval };
      case "tabata": return { mode, workSeconds: tabWork, restSeconds: tabRest, rounds: tabRounds };
      case "intervals": return { mode, workSeconds: intWork, restSeconds: intRest, rounds: intRounds };
      case "amrap": return { mode, totalSeconds: amrapMin * 60 };
      case "fortime": return { mode, capSeconds: ftUseCap ? ftCapMin * 60 : null };
    }
  }

  const MODES: TimerMode[] = ["emom", "tabata", "intervals", "amrap", "fortime"];

  return (
    <div className="w-full max-w-md text-white px-6 py-8">
      <h2 className="text-lg font-semibold mb-4">Configura el timer</h2>

      <div className="grid grid-cols-5 gap-1 mb-6">
        {MODES.map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`text-[10px] font-semibold py-2 rounded-md ${
              mode === m ? "bg-white text-neutral-900" : "bg-white/10 text-white/70 hover:bg-white/20"
            }`}
          >
            {modeLabel(m)}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {mode === "emom" && (
          <>
            <NumInput label="Duración total (min)" value={emomMin} onChange={setEmomMin} min={1} max={60} />
            <NumInput label="Intervalo entre pitos (seg)" value={emomInterval} onChange={setEmomInterval} min={10} max={300} step={5} />
          </>
        )}
        {mode === "tabata" && (
          <>
            <NumInput label="Work (seg)" value={tabWork} onChange={setTabWork} min={5} max={120} />
            <NumInput label="Rest (seg)" value={tabRest} onChange={setTabRest} min={0} max={120} />
            <NumInput label="Rondas" value={tabRounds} onChange={setTabRounds} min={1} max={30} />
          </>
        )}
        {mode === "intervals" && (
          <>
            <NumInput label="Work (seg)" value={intWork} onChange={setIntWork} min={5} max={900} step={5} />
            <NumInput label="Rest (seg)" value={intRest} onChange={setIntRest} min={0} max={600} step={5} />
            <NumInput label="Rondas" value={intRounds} onChange={setIntRounds} min={1} max={30} />
          </>
        )}
        {mode === "amrap" && (
          <NumInput label="Duración (min)" value={amrapMin} onChange={setAmrapMin} min={1} max={90} />
        )}
        {mode === "fortime" && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={ftUseCap} onChange={(e) => setFtUseCap(e.target.checked)} />
              Con time cap (parar automáticamente)
            </label>
            {ftUseCap && <NumInput label="Cap (min)" value={ftCapMin} onChange={setFtCapMin} min={1} max={90} />}
          </>
        )}

        <div className="text-[11px] text-white/50 pt-1">
          Duración estimada: {fmtTime(estimateTimerTotalSeconds(build()))} · Se añaden 3s de cuenta atrás inicial.
        </div>
      </div>

      <div className="flex gap-2 mt-6">
        <button onClick={onCancel} className="flex-1 py-3 rounded-lg bg-white/10 text-sm font-medium hover:bg-white/20">
          Cancelar
        </button>
        <button onClick={() => onSave(build())} className="flex-1 py-3 rounded-lg bg-white text-neutral-900 text-sm font-semibold">
          Usar este timer
        </button>
      </div>
    </div>
  );
}

function NumInput({
  label, value, onChange, min, max, step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-white/60 block mb-1">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!isFinite(n)) return;
          onChange(Math.max(min, Math.min(max, n)));
        }}
        min={min}
        max={max}
        step={step}
        className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-lg font-mono tabular-nums outline-none focus:border-white/40"
      />
    </label>
  );
}

// Helper exportado por si otros consumidores quieren detectar sin instanciar el componente.
export { detectTimerConfig };
