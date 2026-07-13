"use client";

/**
 * Modal fullscreen con timer para tareas WORKOUT del rolling. Cubre EMOM,
 * Tabata, Intervalos, AMRAP y For time. Incluye:
 *   - Pitos programáticos con Web Audio API (sin assets externos).
 *   - Vibración en móvil (navigator.vibrate).
 *   - Wake Lock para no dormir el iPhone durante la sesión.
 *   - Precisión via performance.now() + requestAnimationFrame (no
 *     acumulamos drift del setInterval).
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
  round: number;
  totalRounds: number;      // 0 = no aplica (AMRAP / For time)
  phaseRemainingMs: number;
  totalElapsedMs: number;
};

const PREP_MS = 3000;

function initialSnapshot(cfg: TimerConfig): Snapshot {
  switch (cfg.mode) {
    case "emom": {
      const totalRounds = Math.max(1, Math.round(cfg.totalSeconds / cfg.intervalSeconds));
      return { phase: "ready", round: 0, totalRounds, phaseRemainingMs: cfg.intervalSeconds * 1000, totalElapsedMs: 0 };
    }
    case "tabata":
    case "intervals":
      return { phase: "ready", round: 0, totalRounds: cfg.rounds, phaseRemainingMs: cfg.workSeconds * 1000, totalElapsedMs: 0 };
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

  // Refs para audio/vibra sin re-crear callbacks en cada render
  const audioOnRef = useRef(audioOn);
  const vibrateOnRef = useRef(vibrateOn);
  useEffect(() => { audioOnRef.current = audioOn; }, [audioOn]);
  useEffect(() => { vibrateOnRef.current = vibrateOn; }, [vibrateOn]);

  useWakeLock(running);

  // Refs del motor del tiempo
  const phaseStartRef = useRef<number>(0);
  const phaseTotalRef = useRef<number>(0);
  const totalStartRef = useRef<number>(0);
  const prevSecondRef = useRef<number>(-1);

  // Feedback
  const tickBeep = useCallback(() => {
    if (audioOnRef.current) beep(880, 120);
    if (vibrateOnRef.current) vibrate(80);
  }, []);
  const countdownBeep = useCallback(() => {
    if (audioOnRef.current) beep(660, 80);
    if (vibrateOnRef.current) vibrate(50);
  }, []);
  const startBeep = useCallback(() => {
    if (audioOnRef.current) beep(880, 180);
    if (vibrateOnRef.current) vibrate([120, 50, 120]);
  }, []);
  const restBeep = useCallback(() => {
    if (audioOnRef.current) beep(440, 200);
    if (vibrateOnRef.current) vibrate(120);
  }, []);
  const finishBeep = useCallback(() => {
    if (audioOnRef.current) {
      beep(1046, 250);
      setTimeout(() => beep(1318, 300), 260);
    }
    if (vibrateOnRef.current) vibrate([200, 100, 200, 100, 400]);
  }, []);

  // ─── Avance de fase ───
  const advancePhase = useCallback(
    (cfg: TimerConfig, curr: Snapshot, totalElapsedNow: number, now: number): Snapshot => {
      // PREP → primera fase real de trabajo
      if (curr.phase === "prep") {
        startBeep();
        phaseStartRef.current = now;
        prevSecondRef.current = -1;
        totalStartRef.current = now;
        if (cfg.mode === "fortime") {
          return { ...curr, phase: "work", phaseRemainingMs: 0, totalElapsedMs: 0 };
        }
        if (cfg.mode === "amrap") {
          phaseTotalRef.current = cfg.totalSeconds * 1000;
          return { ...curr, phase: "work", phaseRemainingMs: cfg.totalSeconds * 1000, totalElapsedMs: 0 };
        }
        if (cfg.mode === "emom") {
          phaseTotalRef.current = cfg.intervalSeconds * 1000;
          return { ...curr, phase: "work", round: 1, phaseRemainingMs: cfg.intervalSeconds * 1000, totalElapsedMs: 0 };
        }
        // tabata / intervals
        phaseTotalRef.current = cfg.workSeconds * 1000;
        return { ...curr, phase: "work", round: 1, phaseRemainingMs: cfg.workSeconds * 1000, totalElapsedMs: 0 };
      }

      switch (cfg.mode) {
        case "emom": {
          if (curr.round >= curr.totalRounds) {
            finishBeep();
            queueMicrotask(() => setRunning(false));
            return { ...curr, phase: "done", phaseRemainingMs: 0, totalElapsedMs: totalElapsedNow };
          }
          tickBeep();
          phaseStartRef.current = now;
          phaseTotalRef.current = cfg.intervalSeconds * 1000;
          prevSecondRef.current = -1;
          return { ...curr, round: curr.round + 1, phase: "work", phaseRemainingMs: cfg.intervalSeconds * 1000, totalElapsedMs: totalElapsedNow };
        }
        case "tabata":
        case "intervals": {
          // Termina un WORK → si hay rest, ir a rest. Si no, siguiente work o fin.
          if (curr.phase === "work") {
            if (cfg.restSeconds > 0 && curr.round < curr.totalRounds) {
              restBeep();
              phaseStartRef.current = now;
              phaseTotalRef.current = cfg.restSeconds * 1000;
              prevSecondRef.current = -1;
              return { ...curr, phase: "rest", phaseRemainingMs: cfg.restSeconds * 1000, totalElapsedMs: totalElapsedNow };
            }
            // Sin rest: work terminado → siguiente work o done
            if (curr.round >= curr.totalRounds) {
              finishBeep();
              queueMicrotask(() => setRunning(false));
              return { ...curr, phase: "done", phaseRemainingMs: 0, totalElapsedMs: totalElapsedNow };
            }
            tickBeep();
            phaseStartRef.current = now;
            phaseTotalRef.current = cfg.workSeconds * 1000;
            prevSecondRef.current = -1;
            return { ...curr, round: curr.round + 1, phase: "work", phaseRemainingMs: cfg.workSeconds * 1000, totalElapsedMs: totalElapsedNow };
          }
          // Termina un REST → siguiente work o done
          if (curr.round >= curr.totalRounds) {
            finishBeep();
            queueMicrotask(() => setRunning(false));
            return { ...curr, phase: "done", phaseRemainingMs: 0, totalElapsedMs: totalElapsedNow };
          }
          tickBeep();
          phaseStartRef.current = now;
          phaseTotalRef.current = cfg.workSeconds * 1000;
          prevSecondRef.current = -1;
          return { ...curr, round: curr.round + 1, phase: "work", phaseRemainingMs: cfg.workSeconds * 1000, totalElapsedMs: totalElapsedNow };
        }
        case "amrap": {
          finishBeep();
          queueMicrotask(() => setRunning(false));
          return { ...curr, phase: "done", phaseRemainingMs: 0, totalElapsedMs: totalElapsedNow };
        }
        case "fortime": {
          // No cuenta atrás excepto por cap manejado antes; no debería llegar aquí.
          return curr;
        }
      }
    },
    [startBeep, tickBeep, restBeep, finishBeep],
  );

  // ─── Bucle rAF único ───
  useEffect(() => {
    if (!running || !config) return;
    let raf = 0;
    const loop = () => {
      setSnap((prev) => {
        if (!prev) return prev;
        const now = performance.now();
        const totalElapsed = now - totalStartRef.current;

        // For time: sube. No cambia de fase salvo por cap.
        if (config.mode === "fortime" && prev.phase !== "prep") {
          if (config.capSeconds && totalElapsed >= config.capSeconds * 1000) {
            finishBeep();
            queueMicrotask(() => setRunning(false));
            return { ...prev, phase: "done", totalElapsedMs: config.capSeconds * 1000 };
          }
          const currentSec = Math.floor(totalElapsed / 1000);
          if (currentSec !== prevSecondRef.current && currentSec > 0 && currentSec % 60 === 0) {
            tickBeep();
          }
          prevSecondRef.current = currentSec;
          return { ...prev, totalElapsedMs: totalElapsed };
        }

        // Cuenta atrás dentro de la fase actual
        const phaseElapsed = now - phaseStartRef.current;
        const remainingMs = phaseTotalRef.current - phaseElapsed;

        const remainingSec = Math.ceil(remainingMs / 1000);
        if (remainingSec !== prevSecondRef.current && remainingSec > 0 && remainingSec <= 3) {
          countdownBeep();
        }
        prevSecondRef.current = remainingSec;

        if (remainingMs <= 0) {
          return advancePhase(config, prev, totalElapsed, now);
        }
        return { ...prev, phaseRemainingMs: remainingMs, totalElapsedMs: totalElapsed };
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, config, advancePhase, countdownBeep, tickBeep, finishBeep]);

  // ─── Control START/PAUSE/RESET ───
  const start = () => {
    if (!config) return;
    const ctx = getAudioCtx();
    if (ctx?.state === "suspended") ctx.resume().catch(() => {});

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

  const pause = () => setRunning(false);

  const resume = () => {
    if (!snap || !config) return;
    const now = performance.now();
    phaseStartRef.current = now - (phaseTotalRef.current - snap.phaseRemainingMs);
    totalStartRef.current = now - snap.totalElapsedMs;
    prevSecondRef.current = -1;
    setRunning(true);
  };

  const reset = () => {
    if (!config) return;
    setRunning(false);
    setSnap(initialSnapshot(config));
    prevSecondRef.current = -1;
  };

  // ─── UI derivada ───
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
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 text-white">
        <button onClick={onClose} aria-label="Cerrar" className="p-2 -ml-2">
          <X size={22} />
        </button>
        <div className="text-center min-w-0 flex-1 mx-2">
          <div className="text-xs font-medium truncate opacity-70">{taskTitle}</div>
          {config && (
            <div className="text-[10px] uppercase tracking-widest opacity-50">
              {modeLabel(config.mode)}
              {snap && snap.totalRounds > 0 ? ` · ${Math.max(1, snap.round)}/${snap.totalRounds}` : ""}
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
              Ronda {Math.max(1, snap.round)} / {snap.totalRounds}
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

/**
 * Input numérico controlado por string local — no clamea mientras escribes.
 * Solo al hacer blur (o al pulsar Enter) se aplica el clamp min/max.
 * Fix del bug: antes, si borrabas "20" a "0" y min=5, saltaba a "5" y no
 * dejaba escribir "50". Ahora el input muestra siempre lo que has tecleado.
 */
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
  const [text, setText] = useState<string>(String(value));
  const lastPropRef = useRef(value);
  useEffect(() => {
    // Sincroniza si el padre cambia el value externamente (ej. cambio de modo)
    if (lastPropRef.current !== value) {
      lastPropRef.current = value;
      setText(String(value));
    }
  }, [value]);

  function commit() {
    const trimmed = text.trim();
    if (trimmed === "") {
      // vacío → volver al valor actual del padre
      setText(String(value));
      return;
    }
    const n = Number(trimmed);
    if (!isFinite(n)) {
      setText(String(value));
      return;
    }
    const clamped = Math.max(min, Math.min(max, n));
    lastPropRef.current = clamped;
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  }

  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-white/60 block mb-1">{label}</span>
      <input
        type="number"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
        min={min}
        max={max}
        step={step}
        className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-lg font-mono tabular-nums outline-none focus:border-white/40"
      />
    </label>
  );
}

export { detectTimerConfig };
