"use client";

/**
 * WorkoutTimer — modal fullscreen con timer configurable por SECUENCIA
 * de bloques. Cada bloque puede ser AMRAP, EMOM, Tabata, Intervalos,
 * For time o Descanso. El motor recorre los bloques en orden.
 *
 * Skin: paleta FisioFit (negro carbón, amarillo #FCD34D hero, naranja
 * #F59E0B para descansos, verde/teal para rest interior).
 *
 * Audio: pitos programáticos con Web Audio API (sin assets).
 * Wake Lock + navigator.vibrate + fullscreen.
 * Precisión: performance.now() + requestAnimationFrame.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { readCachedProgramType } from "@/lib/patient-program-type-cache";
import {
  X, Play, Pause, RotateCcw, Volume2, VolumeX, Vibrate,
  Settings2, Plus, Trash2, ChevronUp, ChevronDown, Sliders,
} from "lucide-react";
import {
  blockLabel,
  configDurationSeconds,
  fmtDuration,
  type TimerBlock,
  type TimerBlockKind,
  type TimerConfig,
} from "@/lib/parse-timer-config";

// ────────────────────────── paleta FisioFit ──────────────────────────

const COLOR = {
  bgBase:      "#0A0A0A",
  bgWork:      "#0A0A0A",
  bgPrep:      "#111827",     // gris muy oscuro
  bgRest:      "#7C2D12",     // marrón/naranja para respirar
  bgBlockRest: "#4C1D95",     // violeta descanso entre bloques
  bgDone:      "#166534",     // verde éxito
  brandYellow: "#FCD34D",
  brandOrange: "#F59E0B",
  white:       "#FAFAFA",
  grayDim:     "rgba(250,250,250,0.6)",
  grayFaint:   "rgba(250,250,250,0.35)",
};

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
/** Reproduce un beep FUERTE. Optimizado para oírse sobre música de gym:
 *
 *  - Onda `square` (mucho más loudness percibida que `sine` a mismo peak).
 *  - Segundo oscilador una octava arriba con sine para brillo/pierce sin
 *    hacerlo áspero.
 *  - DynamicsCompressor al final: empuja los picos cerca del máximo sin
 *    saturar los altavoces del móvil, así el sonido gana ~6-9 dB de
 *    loudness percibida frente a la versión anterior de un simple sine.
 *
 *  `volume` (0..1) escala el master gain antes del compresor. El techo
 *  real depende del volumen del sistema — el atleta tiene que tener el
 *  móvil también al máximo. */
function beep(freq: number, durationMs: number, volume = 1) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const v = Math.max(0, Math.min(1, volume));
  if (v === 0) return;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 6;
  comp.ratio.value = 20;
  comp.attack.value = 0.001;
  comp.release.value = 0.08;
  comp.connect(ctx.destination);

  const master = ctx.createGain();
  master.connect(comp);
  const now = ctx.currentTime;
  const stop = now + durationMs / 1000;
  // Overdrive intencionado (x3) para saturar el compresor y maximizar el
  // RMS. Sin la etapa de compresión esto clipearía; con ella queda muy
  // alto pero limpio.
  const drive = v * 3;
  master.gain.setValueAtTime(0, now);
  master.gain.linearRampToValueAtTime(drive, now + 0.003);
  master.gain.linearRampToValueAtTime(0, stop);

  // Fundamental — square = máxima presencia en el rango medio.
  const osc1 = ctx.createOscillator();
  osc1.type = "square";
  osc1.frequency.value = freq;
  osc1.connect(master);

  // Octava superior, más suave, para brillo.
  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = freq * 2;
  const g2 = ctx.createGain();
  g2.gain.value = 0.5;
  osc2.connect(g2).connect(master);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(stop + 0.02);
  osc2.stop(stop + 0.02);
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

type Phase = "ready" | "prep" | "work" | "rest" | "block-rest" | "done";

type Snapshot = {
  blockIndex: number;
  phase: Phase;
  round: number;
  totalRounds: number;
  phaseRemainingMs: number;
  totalElapsedMs: number;   // para modo AMRAP dentro de bloque + For time
  blockElapsedMs: number;   // For time cuenta esto
};

const DEFAULT_PREP_SECONDS = 3;
const PREP_OPTIONS = [3, 5, 10] as const;

// Persistencia en localStorage — mantener preferencias del atleta entre
// aperturas del timer (aunque cierre y vuelva a abrir desde otra tarea).
const LS_VOLUME = "fisio-timer-volume";
const LS_PREP = "fisio-timer-prep-seconds";
const LS_AUDIO = "fisio-timer-audio-on";
const LS_VIBRATE = "fisio-timer-vibrate-on";
const LS_ADVANCED = "fisio-timer-advanced-mode";

function readStoredNumber(key: string, def: number): number {
  if (typeof window === "undefined") return def;
  const v = Number(localStorage.getItem(key));
  return Number.isFinite(v) && v > 0 ? v : def;
}
function readStoredBool(key: string, def: boolean): boolean {
  if (typeof window === "undefined") return def;
  const v = localStorage.getItem(key);
  return v == null ? def : v === "1";
}

/** Formatea milisegundos como m:ss o h:mm:ss según duración. */
function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function initialSnapshot(): Snapshot {
  return {
    blockIndex: 0,
    phase: "ready",
    round: 0,
    totalRounds: 0,
    phaseRemainingMs: 0,
    totalElapsedMs: 0,
    blockElapsedMs: 0,
  };
}

// ────────────────────────── ring de progreso ──────────────────────────

/**
 * Círculo SVG que rodea el número del countdown y avanza según el
 * progreso de la fase actual (0 → 1). El color hereda del acento
 * activo (amarillo por defecto, blanco en rest, etc.).
 *
 * Se dibuja con un fondo tenue de referencia + un stroke sobre el que
 * el dasharray recorta según `progress`. strokeLinecap round para que
 * el extremo quede como en el mockup del CEO.
 */
function ProgressRing({
  progress,
  color,
  phase,
  children,
}: {
  progress: number;
  color: string;
  phase: Phase;
  children: React.ReactNode;
}) {
  // viewBox 100x100 · radio 47 · circunferencia = 2πr ≈ 295.31
  const R = 47;
  const C = 2 * Math.PI * R;
  const p = Math.max(0, Math.min(1, progress));
  const dashOffset = C * (1 - p);

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: "min(78vw, 26rem)", height: "min(78vw, 26rem)" }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" style={{ transform: "rotate(-90deg)" }}>
        {/* Fondo tenue */}
        <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.9" />
        {/* Progreso */}
        <circle
          cx="50" cy="50" r={R} fill="none"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeDasharray={`${C}`}
          strokeDashoffset={dashOffset}
          style={{
            transition: phase === "done" ? "stroke-dashoffset 0.4s ease-out" : "none",
            filter: `drop-shadow(0 0 6px ${color}55)`,
          }}
        />
      </svg>
      <div className="relative flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

// ────────────────────────── componente ──────────────────────────

export function WorkoutTimer({
  taskTitle,
  taskBody,
  initialConfig,
  onClose,
}: {
  taskTitle: string;
  /** Descripción de la tarea (bodyText) — se muestra en un recuadro dentro
      del timer para que el atleta lo tenga siempre a la vista. */
  taskBody?: string | null;
  initialConfig?: TimerConfig | null;
  onClose: () => void;
}) {
  const [config, setConfig] = useState<TimerConfig | null>(initialConfig ?? null);
  const [snap, setSnap] = useState<Snapshot>(initialSnapshot());
  const [running, setRunning] = useState(false);
  const [audioOn, setAudioOn] = useState(true);
  const [vibrateOn, setVibrateOn] = useState(true);
  // Preferencias de sonido/cuenta atrás. Se leen de localStorage al montar y
  // se persisten al cambiar, así el atleta no las reconfigura cada vez.
  const [volume, setVolume] = useState<number>(1);
  const [prepSeconds, setPrepSeconds] = useState<number>(DEFAULT_PREP_SECONDS);
  const [showConfig, setShowConfig] = useState(!config || (config?.blocks.length ?? 0) === 0);
  const [showPrefs, setShowPrefs] = useState(false);

  // Modo ADVANCE (rondas + splits estilo Garmin laps). Toggle exclusivo
  // para atletas ADVANCE — lo cambia el atleta desde el panel de
  // preferencias del propio timer.
  const [advancedMode, setAdvancedMode] = useState(false);
  const [isAdvancePatient, setIsAdvancePatient] = useState(false);
  // Splits acumulados durante el timer: cada uno es el totalElapsedMs en el
  // momento de la pulsación de "Ronda". Vacío al arrancar.
  const [splits, setSplits] = useState<number[]>([]);
  // Modal de resumen al terminar el WOD.
  const [showRecap, setShowRecap] = useState(false);

  const audioOnRef = useRef(audioOn);
  const vibrateOnRef = useRef(vibrateOn);
  const volumeRef = useRef(volume);
  const prepSecondsRef = useRef(prepSeconds);
  useEffect(() => { audioOnRef.current = audioOn; }, [audioOn]);
  useEffect(() => { vibrateOnRef.current = vibrateOn; }, [vibrateOn]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { prepSecondsRef.current = prepSeconds; }, [prepSeconds]);

  // Hidratar preferencias desde localStorage (solo cliente).
  useEffect(() => {
    setVolume(readStoredNumber(LS_VOLUME, 1));
    setPrepSeconds(readStoredNumber(LS_PREP, DEFAULT_PREP_SECONDS));
    setAudioOn(readStoredBool(LS_AUDIO, true));
    setVibrateOn(readStoredBool(LS_VIBRATE, true));
    setAdvancedMode(readStoredBool(LS_ADVANCED, false));
    setIsAdvancePatient(readCachedProgramType() === "ADVANCE");
  }, []);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem(LS_VOLUME, String(volume)); }, [volume]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem(LS_PREP, String(prepSeconds)); }, [prepSeconds]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem(LS_AUDIO, audioOn ? "1" : "0"); }, [audioOn]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem(LS_VIBRATE, vibrateOn ? "1" : "0"); }, [vibrateOn]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem(LS_ADVANCED, advancedMode ? "1" : "0"); }, [advancedMode]);

  useWakeLock(running);

  // Bloquear scroll de la app de fondo mientras el timer esté abierto.
  // Sin esto, en móvil los deslizamientos "traspasan" y se ve moverse el
  // contenido por detrás — especialmente si el timer se abrió desde una
  // sesión con página scrolleable. Restauramos al desmontar.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevWidth = document.body.style.width;
    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.top = "";
      document.body.style.width = prevWidth;
      window.scrollTo(0, scrollY);
    };
  }, []);

  // Refs del motor
  const phaseStartRef = useRef<number>(0);
  const phaseTotalRef = useRef<number>(0);
  const blockStartRef = useRef<number>(0);
  const totalStartRef = useRef<number>(0);
  const prevSecondRef = useRef<number>(-1);

  // ─── Feedback ───
  const tickBeep = useCallback(() => {
    if (audioOnRef.current) beep(880, 120, volumeRef.current);
    if (vibrateOnRef.current) vibrate(80);
  }, []);
  const countdownBeep = useCallback(() => {
    if (audioOnRef.current) beep(660, 80, volumeRef.current);
    if (vibrateOnRef.current) vibrate(50);
  }, []);
  const startBeep = useCallback(() => {
    if (audioOnRef.current) beep(880, 180, volumeRef.current);
    if (vibrateOnRef.current) vibrate([120, 50, 120]);
  }, []);
  const restBeep = useCallback(() => {
    if (audioOnRef.current) beep(440, 200, volumeRef.current);
    if (vibrateOnRef.current) vibrate(120);
  }, []);
  const finishBeep = useCallback(() => {
    if (audioOnRef.current) {
      beep(1046, 250, volumeRef.current);
      setTimeout(() => beep(1318, 300, volumeRef.current), 260);
    }
    if (vibrateOnRef.current) vibrate([200, 100, 200, 100, 400]);
  }, []);
  const blockAdvanceBeep = useCallback(() => {
    if (audioOnRef.current) {
      beep(659, 150, volumeRef.current);
      setTimeout(() => beep(880, 200, volumeRef.current), 160);
    }
    if (vibrateOnRef.current) vibrate([120, 80, 120]);
  }, []);

  // ─── Helpers de bloques ───
  const enterBlock = useCallback((blocks: TimerBlock[], idx: number, now: number, totalElapsedNow: number): Snapshot => {
    if (idx >= blocks.length) {
      finishBeep();
      queueMicrotask(() => setRunning(false));
      return {
        blockIndex: idx, phase: "done", round: 0, totalRounds: 0,
        phaseRemainingMs: 0, totalElapsedMs: totalElapsedNow, blockElapsedMs: 0,
      };
    }
    const b = blocks[idx];
    phaseStartRef.current = now;
    blockStartRef.current = now;
    prevSecondRef.current = -1;

    switch (b.kind) {
      case "amrap":
        phaseTotalRef.current = b.totalSeconds * 1000;
        return { blockIndex: idx, phase: "work", round: 0, totalRounds: 0, phaseRemainingMs: b.totalSeconds * 1000, totalElapsedMs: totalElapsedNow, blockElapsedMs: 0 };
      case "emom": {
        const totalRounds = Math.max(1, Math.round(b.totalSeconds / b.intervalSeconds));
        phaseTotalRef.current = b.intervalSeconds * 1000;
        return { blockIndex: idx, phase: "work", round: 1, totalRounds, phaseRemainingMs: b.intervalSeconds * 1000, totalElapsedMs: totalElapsedNow, blockElapsedMs: 0 };
      }
      case "tabata":
      case "intervals":
        phaseTotalRef.current = b.workSeconds * 1000;
        return { blockIndex: idx, phase: "work", round: 1, totalRounds: b.rounds, phaseRemainingMs: b.workSeconds * 1000, totalElapsedMs: totalElapsedNow, blockElapsedMs: 0 };
      case "fortime":
        phaseTotalRef.current = b.capSeconds ? b.capSeconds * 1000 : Infinity;
        return { blockIndex: idx, phase: "work", round: 0, totalRounds: 0, phaseRemainingMs: b.capSeconds ? b.capSeconds * 1000 : 0, totalElapsedMs: totalElapsedNow, blockElapsedMs: 0 };
      case "rest":
        phaseTotalRef.current = b.totalSeconds * 1000;
        restBeep();
        return { blockIndex: idx, phase: "block-rest", round: 0, totalRounds: 0, phaseRemainingMs: b.totalSeconds * 1000, totalElapsedMs: totalElapsedNow, blockElapsedMs: 0 };
    }
  }, [finishBeep, restBeep]);

  // ─── Avance dentro del bloque ───
  const advanceWithinBlock = useCallback((cfg: TimerConfig, curr: Snapshot, now: number, totalElapsedNow: number): Snapshot => {
    const b = cfg.blocks[curr.blockIndex];
    if (!b) return enterBlock(cfg.blocks, curr.blockIndex + 1, now, totalElapsedNow);

    // PREP → primera fase del bloque actual
    if (curr.phase === "prep") {
      startBeep();
      totalStartRef.current = now;
      return enterBlock(cfg.blocks, curr.blockIndex, now, 0);
    }

    // BLOCK-REST terminado → siguiente bloque
    if (curr.phase === "block-rest") {
      blockAdvanceBeep();
      return enterBlock(cfg.blocks, curr.blockIndex + 1, now, totalElapsedNow);
    }

    switch (b.kind) {
      case "amrap":
      case "fortime": {
        // Fin del bloque → siguiente
        return enterBlock(cfg.blocks, curr.blockIndex + 1, now, totalElapsedNow);
      }
      case "emom": {
        // Nueva ronda o fin del bloque
        if (curr.round >= curr.totalRounds) {
          return enterBlock(cfg.blocks, curr.blockIndex + 1, now, totalElapsedNow);
        }
        tickBeep();
        phaseStartRef.current = now;
        phaseTotalRef.current = b.intervalSeconds * 1000;
        prevSecondRef.current = -1;
        return { ...curr, phase: "work", round: curr.round + 1, phaseRemainingMs: b.intervalSeconds * 1000 };
      }
      case "tabata":
      case "intervals": {
        if (curr.phase === "work") {
          if (b.restSeconds > 0 && curr.round < curr.totalRounds) {
            restBeep();
            phaseStartRef.current = now;
            phaseTotalRef.current = b.restSeconds * 1000;
            prevSecondRef.current = -1;
            return { ...curr, phase: "rest", phaseRemainingMs: b.restSeconds * 1000 };
          }
          // Sin rest o última ronda → siguiente work o fin
          if (curr.round >= curr.totalRounds) {
            return enterBlock(cfg.blocks, curr.blockIndex + 1, now, totalElapsedNow);
          }
          tickBeep();
          phaseStartRef.current = now;
          phaseTotalRef.current = b.workSeconds * 1000;
          prevSecondRef.current = -1;
          return { ...curr, phase: "work", round: curr.round + 1, phaseRemainingMs: b.workSeconds * 1000 };
        }
        // Termina REST
        if (curr.round >= curr.totalRounds) {
          return enterBlock(cfg.blocks, curr.blockIndex + 1, now, totalElapsedNow);
        }
        tickBeep();
        phaseStartRef.current = now;
        phaseTotalRef.current = b.workSeconds * 1000;
        prevSecondRef.current = -1;
        return { ...curr, phase: "work", round: curr.round + 1, phaseRemainingMs: b.workSeconds * 1000 };
      }
      case "rest":
        return enterBlock(cfg.blocks, curr.blockIndex + 1, now, totalElapsedNow);
    }
  }, [enterBlock, startBeep, tickBeep, restBeep, blockAdvanceBeep]);

  // ─── Bucle rAF ───
  useEffect(() => {
    if (!running || !config) return;
    let raf = 0;
    const loop = () => {
      setSnap((prev) => {
        if (!config.blocks[prev.blockIndex] && prev.phase !== "prep") {
          // Sin bloque válido (raro)
          return prev;
        }
        const now = performance.now();
        const totalElapsed = now - totalStartRef.current;
        const b = config.blocks[prev.blockIndex];

        // For time: cuenta arriba, con posible cap
        if (prev.phase === "work" && b?.kind === "fortime") {
          const blockElapsed = now - blockStartRef.current;
          if (b.capSeconds && blockElapsed >= b.capSeconds * 1000) {
            return advanceWithinBlock(config, prev, now, totalElapsed);
          }
          const currentSec = Math.floor(blockElapsed / 1000);
          if (currentSec !== prevSecondRef.current && currentSec > 0 && currentSec % 60 === 0) {
            tickBeep();
          }
          prevSecondRef.current = currentSec;
          return { ...prev, totalElapsedMs: totalElapsed, blockElapsedMs: blockElapsed };
        }

        // Cuenta atrás
        const phaseElapsed = now - phaseStartRef.current;
        const remainingMs = phaseTotalRef.current - phaseElapsed;

        const remainingSec = Math.ceil(remainingMs / 1000);
        if (remainingSec !== prevSecondRef.current && remainingSec > 0 && remainingSec <= 3) {
          countdownBeep();
        }
        prevSecondRef.current = remainingSec;

        if (remainingMs <= 0) {
          return advanceWithinBlock(config, prev, now, totalElapsed);
        }
        return { ...prev, phaseRemainingMs: remainingMs, totalElapsedMs: totalElapsed };
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, config, advanceWithinBlock, countdownBeep, tickBeep]);

  // ─── Control ───
  const start = () => {
    if (!config || config.blocks.length === 0) return;
    const ctx = getAudioCtx();
    if (ctx?.state === "suspended") ctx.resume().catch(() => {});

    const now = performance.now();
    const prepMs = Math.max(1, prepSecondsRef.current) * 1000;
    phaseStartRef.current = now;
    phaseTotalRef.current = prepMs;
    totalStartRef.current = now;
    prevSecondRef.current = -1;
    setSnap({
      blockIndex: 0, phase: "prep", round: 0, totalRounds: 0,
      phaseRemainingMs: prepMs, totalElapsedMs: 0, blockElapsedMs: 0,
    });
    setRunning(true);
    setShowConfig(false);
  };

  const pause = () => setRunning(false);
  const resume = () => {
    if (!snap || !config) return;
    const now = performance.now();
    if (snap.phase === "work" && config.blocks[snap.blockIndex]?.kind === "fortime") {
      blockStartRef.current = now - snap.blockElapsedMs;
    } else {
      phaseStartRef.current = now - (phaseTotalRef.current - snap.phaseRemainingMs);
    }
    totalStartRef.current = now - snap.totalElapsedMs;
    prevSecondRef.current = -1;
    setRunning(true);
  };
  const reset = () => {
    setRunning(false);
    setSnap(initialSnapshot());
    prevSecondRef.current = -1;
    setSplits([]);
    setShowRecap(false);
  };

  /** Registra una vuelta: guarda el tiempo total actual como split. */
  const markLap = useCallback(() => {
    if (snap.phase === "ready" || snap.phase === "done" || snap.phase === "prep") return;
    tickBeep();
    setSplits((prev) => [...prev, snap.totalElapsedMs]);
  }, [snap.phase, snap.totalElapsedMs, tickBeep]);

  /** Cierra el WOD manualmente (antes del "done" natural del timer) y abre
   *  el mini-informe con los splits acumulados. */
  const finishWod = useCallback(() => {
    setRunning(false);
    finishBeep();
    setShowRecap(true);
  }, [finishBeep]);

  // ─── UI derivada ───
  const currentBlock: TimerBlock | undefined = config?.blocks[snap.blockIndex];

  const displaySeconds = useMemo(() => {
    if (!config) return 0;
    if (snap.phase === "done") return 0;
    if (snap.phase === "prep") return Math.ceil(snap.phaseRemainingMs / 1000);
    if (snap.phase === "work" && currentBlock?.kind === "fortime") {
      return Math.floor(snap.blockElapsedMs / 1000);
    }
    return Math.ceil(snap.phaseRemainingMs / 1000);
  }, [snap, config, currentBlock]);

  const phaseLabel: string = (() => {
    if (snap.phase === "prep") return "PREPARADO";
    if (snap.phase === "done") return "COMPLETADO";
    if (snap.phase === "block-rest") return "DESCANSO";
    if (snap.phase === "rest") return "DESCANSO";
    if (!currentBlock) return "";
    if (currentBlock.kind === "amrap")   return "AMRAP";
    if (currentBlock.kind === "fortime") return "FOR TIME";
    if (currentBlock.kind === "rest")    return "DESCANSO";
    return "GO";
  })();

  const bgColor: string = (() => {
    if (snap.phase === "prep") return COLOR.bgPrep;
    if (snap.phase === "done") return COLOR.bgDone;
    if (snap.phase === "rest") return COLOR.bgRest;
    if (snap.phase === "block-rest") return COLOR.bgBlockRest;
    return COLOR.bgBase;
  })();

  const accentColor: string = (() => {
    if (snap.phase === "prep") return COLOR.brandYellow;
    if (snap.phase === "done") return COLOR.brandYellow;
    if (snap.phase === "rest" || snap.phase === "block-rest") return COLOR.white;
    return COLOR.brandYellow;
  })();

  const totalBlocks = config?.blocks.length ?? 0;
  const totalConfigSec = config ? configDurationSeconds(config) : 0;

  // Renderizamos en un portal directo a <body> para escapar de cualquier
  // ancestro que tenga `transform`, `filter` o `will-change` (esas
  // propiedades rompen `position: fixed` y hacen que el modal se ancle a un
  // container en vez del viewport → parece que hay un hueco arriba).
  const [mountEl, setMountEl] = useState<HTMLElement | null>(null);
  useEffect(() => { setMountEl(document.body); }, []);
  if (!mountEl) return null;

  const modal = (
    <div
      className="fixed z-[100] flex items-center justify-center transition-colors duration-500"
      style={{
        background: bgColor,
        // Cubrimos toda la pantalla, incluso bajo la barra de estado del
        // sistema (iOS/Android). Usamos 100dvh (viewport dinámico) para que
        // no quede hueco cuando aparece la url bar en móvil.
        top: 0, left: 0, right: 0, bottom: 0,
        width: "100vw", height: "100dvh",
        // Sin esto, en iOS un swipe vertical en los bordes rebota el
        // contenido de fondo (rubber-banding) y se ve la app por detrás.
        overscrollBehavior: "contain",
        touchAction: "none",
      }}
    >
      {/* Cabecera — respeta el notch/safe-area para no comerse los botones */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3"
        style={{
          color: COLOR.white,
          paddingTop: "max(0.75rem, env(safe-area-inset-top))",
        }}
      >
        <button onClick={onClose} aria-label="Cerrar" className="p-2 -ml-2">
          <X size={22} />
        </button>
        <div className="text-center min-w-0 flex-1 mx-2">
          {/* Brand + título de la tarea solo antes de arrancar. Cuando el
              timer corre son ruido visual: se solapan con el phase label
              y no aportan info nueva. */}
          {snap.phase === "ready" && (
            <>
              <div className="text-[10px] uppercase tracking-[0.3em] font-semibold" style={{ color: COLOR.brandYellow, letterSpacing: "0.3em" }}>
                FisioFit Timer
              </div>
              <div className="text-xs font-medium truncate mt-0.5" style={{ color: COLOR.grayDim }}>{taskTitle}</div>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowPrefs((v) => !v)}
            className={`p-2 ${showPrefs ? "opacity-100" : "opacity-90"}`}
            aria-label="Preferencias de sonido"
            title="Preferencias (volumen, cuenta atrás, vibración)"
          >
            <Sliders size={18} />
          </button>
          {config && (
            <button onClick={() => setShowConfig((v) => !v)} className="p-2" aria-label="Configuración de bloques">
              <Settings2 size={18} />
            </button>
          )}
        </div>
      </div>

      {showPrefs && (
        <PreferencesPanel
          audioOn={audioOn}
          onToggleAudio={() => setAudioOn((v) => !v)}
          vibrateOn={vibrateOn}
          onToggleVibrate={() => setVibrateOn((v) => !v)}
          volume={volume}
          onChangeVolume={setVolume}
          prepSeconds={prepSeconds}
          onChangePrep={setPrepSeconds}
          advancedMode={advancedMode}
          onToggleAdvanced={() => setAdvancedMode((v) => !v)}
          isAdvancePatient={isAdvancePatient}
          onClose={() => setShowPrefs(false)}
        />
      )}

      {/* Barra de progreso de bloques */}
      {config && totalBlocks > 1 && !showConfig && (
        <div className="absolute top-16 left-0 right-0 px-4">
          <div className="flex gap-1 max-w-md mx-auto">
            {config.blocks.map((b, i) => (
              <div
                key={i}
                className="flex-1 h-1 rounded-full transition-colors"
                style={{
                  background: i < snap.blockIndex
                    ? COLOR.brandYellow
                    : i === snap.blockIndex
                      ? snap.phase === "done" ? COLOR.brandYellow : COLOR.white
                      : "rgba(255,255,255,0.15)",
                  opacity: i === snap.blockIndex && snap.phase !== "done" ? 1 : 0.7,
                }}
                title={blockLabel(b)}
              />
            ))}
          </div>
          <div className="text-center text-[11px] mt-1.5 font-medium" style={{ color: COLOR.grayDim }}>
            Bloque {Math.min(snap.blockIndex + 1, totalBlocks)}/{totalBlocks}
            {currentBlock && (
              <> · <span style={{ color: currentBlock.kind === "rest" ? COLOR.brandOrange : COLOR.brandYellow }}>{describeBlockShort(currentBlock)}</span></>
            )}
          </div>
        </div>
      )}

      {showConfig ? (
        <ConfigEditor
          initial={config}
          onCancel={() => (config && config.blocks.length > 0 ? setShowConfig(false) : onClose())}
          onSave={(c) => {
            setConfig(c);
            setSnap(initialSnapshot());
            setShowConfig(false);
            setRunning(false);
          }}
        />
      ) : snap.phase === "ready" && config ? (
        /* Vista READY: resumen claro de los bloques antes de arrancar */
        <ReadyPreview config={config} taskBody={taskBody} onStart={start} />
      ) : (
        <div className="flex flex-col items-center justify-center select-none" style={{ color: COLOR.white }}>
          {/* Mostramos el label solo cuando aporta: cuenta atrás inicial,
              descanso o completado. Cuando dice el nombre del bloque
              (AMRAP / FOR TIME / GO) es ruido — el color del número ya
              informa del estado y encima se superponía con el header. */}
          {(snap.phase === "prep" || snap.phase === "done" || snap.phase === "rest" || snap.phase === "block-rest") && (
            <div className="text-[11px] uppercase tracking-[0.35em] font-bold mb-3" style={{ color: accentColor }}>
              {phaseLabel}
            </div>
          )}

          {/* Contenedor del número + ring SVG. El SVG se dibuja alrededor
              usando position absoluta; el número queda centrado. */}
          <ProgressRing
            phase={snap.phase}
            progress={(() => {
              // For time: hacia arriba (con cap opcional)
              if (snap.phase === "work" && currentBlock?.kind === "fortime") {
                if (currentBlock.capSeconds) {
                  return Math.min(1, snap.blockElapsedMs / (currentBlock.capSeconds * 1000));
                }
                return 0;
              }
              // Fases con countdown: prep, work (no fortime), rest, block-rest
              const total = phaseTotalRef.current;
              if (total <= 0) return 0;
              const done = 1 - snap.phaseRemainingMs / total;
              return Math.max(0, Math.min(1, done));
            })()}
            color={accentColor}
          >
            <div
              className="font-mono font-black tabular-nums leading-none"
              style={{
                fontSize: "min(28vw, 18rem)",
                color: accentColor,
                textShadow: snap.phase === "work" && currentBlock?.kind !== "rest"
                  ? `0 0 30px ${accentColor}44`
                  : undefined,
              }}
            >
              {snap.phase === "prep" ? displaySeconds : fmtDuration(displaySeconds)}
            </div>
          </ProgressRing>

          {snap.totalRounds > 0 && snap.phase !== "prep" && snap.phase !== "done" && (
            <div className="mt-4 text-lg font-bold" style={{ color: COLOR.white }}>
              Ronda {Math.max(1, snap.round)} <span style={{ color: COLOR.grayFaint }}>/ {snap.totalRounds}</span>
            </div>
          )}

          {snap.phase === "done" && (
            <div className="mt-4 text-sm" style={{ color: COLOR.white }}>
              Tiempo total: <strong>{fmtDuration(snap.totalElapsedMs / 1000)}</strong>
            </div>
          )}

          {/* Recuadro con el trabajo a realizar — el atleta lo tiene a
              la vista durante el timer. Sutil, scroll interno si es largo. */}
          {taskBody && snap.phase !== "done" && (
            <div
              className="mt-6 mx-4 rounded-xl border p-3 max-w-md w-full"
              style={{
                background: "rgba(255,255,255,0.06)",
                borderColor: "rgba(255,255,255,0.12)",
                maxHeight: "22vh",
                overflowY: "auto",
              }}
            >
              <div
                className="text-[11px] leading-relaxed whitespace-pre-wrap font-mono"
                style={{ color: COLOR.white, opacity: 0.85 }}
              >
                {taskBody}
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center gap-4">
            <button
              onClick={reset}
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.10)", color: COLOR.white }}
              aria-label="Reset"
            >
              <RotateCcw size={22} />
            </button>
            {snap.phase === "done" ? (
              <button
                onClick={reset}
                className="px-10 py-4 rounded-full font-bold text-lg"
                style={{ background: COLOR.brandYellow, color: "#0A0A0A" }}
              >
                Repetir
              </button>
            ) : running ? (
              <button
                onClick={pause}
                className="w-24 h-24 rounded-full flex items-center justify-center"
                style={{ background: COLOR.brandYellow, color: "#0A0A0A" }}
                aria-label="Pausar"
              >
                <Pause size={36} />
              </button>
            ) : (
              <button
                onClick={resume}
                className="w-24 h-24 rounded-full flex items-center justify-center"
                style={{
                  background: COLOR.brandYellow,
                  color: "#0A0A0A",
                  boxShadow: `0 0 40px ${COLOR.brandYellow}66`,
                }}
                aria-label="Iniciar"
              >
                <Play size={36} className="ml-1" />
              </button>
            )}
            <div className="w-14 h-14" />
          </div>

          {/* Modo ADVANCE: registrar rondas + terminar WOD.
              Solo visible cuando el timer ya arrancó (no en prep/ready). */}
          {advancedMode && snap.phase !== "ready" && snap.phase !== "prep" && snap.phase !== "done" && (
            <div className="mt-6 w-full max-w-md px-4 space-y-3">
              {/* Botón RONDA a lo grande, con el contador prominente */}
              <button
                onClick={markLap}
                className="w-full rounded-2xl py-5 px-5 flex items-center justify-between active:scale-[0.98] transition-transform"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  color: COLOR.white,
                  border: "2px solid rgba(255,255,255,0.20)",
                  boxShadow: `inset 0 0 40px rgba(252,211,77,0.05)`,
                }}
                aria-label="Marcar ronda"
              >
                <div className="flex flex-col items-start leading-none">
                  <span className="text-[10px] font-bold tracking-[0.3em] uppercase" style={{ color: COLOR.grayDim }}>
                    Toca para
                  </span>
                  <span className="text-2xl font-bold mt-1" style={{ letterSpacing: "-0.02em" }}>
                    🏁 Nueva ronda
                  </span>
                </div>
                <div className="flex flex-col items-end leading-none">
                  <span className="text-[9px] font-bold tracking-[0.3em] uppercase" style={{ color: COLOR.grayFaint }}>
                    Ronda
                  </span>
                  <span
                    className="text-5xl font-black tabular-nums mt-0.5"
                    style={{ color: COLOR.brandYellow, letterSpacing: "-0.05em" }}
                  >
                    {String(splits.length + 1).padStart(2, "0")}
                  </span>
                </div>
              </button>

              {/* Botón TERMINAR WOD tambien ancho, pero mas discreto */}
              <button
                onClick={finishWod}
                className="w-full rounded-2xl py-3.5 font-bold text-base active:scale-[0.98] transition-transform"
                style={{ background: COLOR.brandOrange, color: "#0A0A0A" }}
              >
                ✅ Terminar WOD
              </button>
            </div>
          )}

          {/* Splits acumulados — grid de tarjetas coloreadas por posicion */}
          {advancedMode && splits.length > 0 && !showRecap && (
            <div className="mt-4 w-full max-w-md px-4">
              <div className="text-[10px] uppercase tracking-[0.3em] font-bold mb-2 text-center" style={{ color: COLOR.grayFaint }}>
                Rondas completadas
              </div>
              <div className="grid grid-cols-4 gap-2">
                {splits.slice(-4).map((totalMs, i) => {
                  const idx = splits.length - Math.min(4, splits.length) + i;
                  const prev = idx === 0 ? 0 : splits[idx - 1];
                  const lapMs = totalMs - prev;
                  return (
                    <div
                      key={idx}
                      className="rounded-xl p-2 text-center"
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.12)",
                      }}
                    >
                      <div className="text-[9px] font-bold tracking-widest uppercase" style={{ color: COLOR.brandYellow }}>
                        #{idx + 1}
                      </div>
                      <div className="text-base font-bold font-mono mt-0.5" style={{ color: COLOR.white }}>
                        {formatMs(lapMs)}
                      </div>
                    </div>
                  );
                })}
              </div>
              {splits.length > 4 && (
                <div className="text-[10px] text-center mt-1.5" style={{ color: COLOR.grayFaint }}>
                  +{splits.length - 4} anteriores en el informe final
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showRecap && (
        <WodRecapPanel
          splits={splits}
          totalMs={snap.totalElapsedMs}
          onClose={() => setShowRecap(false)}
          onReset={() => { setShowRecap(false); reset(); }}
        />
      )}
    </div>
  );

  return createPortal(modal, mountEl);
}

/**
 * Mini-informe al pulsar "Terminar WOD". Lista todos los splits con su
 * tiempo de vuelta, mejor/peor, media y total. Estilo laps de Garmin.
 */
function WodRecapPanel({
  splits,
  totalMs,
  onClose,
  onReset,
}: {
  splits: number[];
  totalMs: number;
  onClose: () => void;
  onReset: () => void;
}) {
  // Convertimos splits (acumulados) a duraciones de cada ronda.
  const lapDurations: number[] = splits.map((t, i) => t - (i === 0 ? 0 : splits[i - 1]));
  // Si el atleta pulsó "Terminar" DESPUÉS de la última ronda registrada,
  // añadimos una ronda extra con el tiempo restante hasta totalMs.
  if (splits.length === 0 || splits[splits.length - 1] < totalMs - 1000) {
    lapDurations.push(totalMs - (splits[splits.length - 1] ?? 0));
  }
  const best = lapDurations.length > 0 ? Math.min(...lapDurations) : 0;
  const worst = lapDurations.length > 0 ? Math.max(...lapDurations) : 0;
  const avg = lapDurations.length > 0 ? lapDurations.reduce((a, b) => a + b, 0) / lapDurations.length : 0;

  return (
    <div
      className="absolute z-[120] flex items-center justify-center p-4"
      style={{ top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl max-w-sm w-full p-5"
        style={{
          background: "#141414",
          border: "1px solid rgba(255,255,255,0.12)",
          color: COLOR.white,
          maxHeight: "80vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-4">
          <div className="text-[10px] uppercase tracking-[0.3em] font-bold" style={{ color: COLOR.brandYellow }}>
            WOD completado
          </div>
          <div className="text-4xl font-bold mt-1 tabular-nums">{formatMs(totalMs)}</div>
          <div className="text-xs mt-0.5" style={{ color: COLOR.grayDim }}>
            {lapDurations.length} {lapDurations.length === 1 ? "ronda" : "rondas"}
          </div>
        </div>

        {lapDurations.length > 1 && (
          <div className="grid grid-cols-3 gap-2 mb-4 text-center">
            <div className="p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div className="text-[9px] uppercase tracking-wider" style={{ color: COLOR.grayFaint }}>Mejor</div>
              <div className="text-sm font-bold tabular-nums" style={{ color: COLOR.brandYellow }}>{formatMs(best)}</div>
            </div>
            <div className="p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div className="text-[9px] uppercase tracking-wider" style={{ color: COLOR.grayFaint }}>Media</div>
              <div className="text-sm font-bold tabular-nums">{formatMs(avg)}</div>
            </div>
            <div className="p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div className="text-[9px] uppercase tracking-wider" style={{ color: COLOR.grayFaint }}>Peor</div>
              <div className="text-sm font-bold tabular-nums" style={{ color: COLOR.brandOrange }}>{formatMs(worst)}</div>
            </div>
          </div>
        )}

        <div className="space-y-1 mb-4">
          {lapDurations.map((lapMs, i) => {
            const isBest = lapMs === best && lapDurations.length > 1;
            const isWorst = lapMs === worst && lapDurations.length > 1 && best !== worst;
            return (
              <div
                key={i}
                className="flex justify-between items-baseline text-sm py-1.5 px-3 rounded"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                <span className="font-semibold" style={{ color: COLOR.grayDim }}>Ronda {i + 1}</span>
                <span
                  className="font-mono tabular-nums font-semibold"
                  style={{ color: isBest ? COLOR.brandYellow : isWorst ? COLOR.brandOrange : COLOR.white }}
                >
                  {formatMs(lapMs)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: "rgba(255,255,255,0.10)", color: COLOR.white }}
          >
            Cerrar
          </button>
          <button
            onClick={onReset}
            className="flex-1 py-2.5 rounded-lg text-sm font-bold"
            style={{ background: COLOR.brandYellow, color: "#0A0A0A" }}
          >
            Nuevo WOD
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────── vista READY (preview de bloques) ──────────────────────────

function ReadyPreview({
  config,
  taskBody,
  onStart,
}: {
  config: TimerConfig;
  taskBody?: string | null;
  onStart: () => void;
}) {
  const total = configDurationSeconds(config);
  const n = config.blocks.length;
  const workBlocks = config.blocks.filter((b) => b.kind !== "rest").length;

  return (
    <div className="w-full max-w-md px-5 pt-24 pb-8 overflow-y-auto max-h-screen" style={{ color: COLOR.white }}>
      <div className="text-center mb-5">
        <div className="text-[10px] uppercase tracking-[0.35em] font-bold mb-1" style={{ color: COLOR.brandYellow }}>
          Listo para empezar
        </div>
        <div className="text-3xl font-black" style={{ color: COLOR.white }}>
          {fmtDuration(total)}
        </div>
        <div className="text-[11px] mt-1" style={{ color: COLOR.grayFaint }}>
          {workBlocks} {workBlocks === 1 ? "bloque de trabajo" : "bloques de trabajo"}
          {n !== workBlocks && ` · ${n - workBlocks} ${n - workBlocks === 1 ? "descanso" : "descansos"}`}
        </div>
      </div>

      {/* Descripción de la tarea (bodyText) — recuadro sutil para que el
          atleta tenga siempre a la vista el trabajo que va a hacer */}
      {taskBody && (
        <div
          className="rounded-xl border p-3 mb-4"
          style={{
            background: "rgba(252,211,77,0.06)",
            borderColor: "rgba(252,211,77,0.20)",
          }}
        >
          <div className="text-[9px] uppercase tracking-[0.3em] font-bold mb-1.5" style={{ color: COLOR.brandYellow }}>
            Trabajo
          </div>
          <div className="text-[13px] leading-relaxed whitespace-pre-wrap font-mono" style={{ color: COLOR.white }}>
            {taskBody}
          </div>
        </div>
      )}

      {/* Lista de bloques */}
      <div className="space-y-1.5 mb-6">
        {config.blocks.map((b, i) => (
          <BlockPreviewRow key={i} block={b} index={i} />
        ))}
      </div>

      {/* Botón play prominente */}
      <div className="flex flex-col items-center">
        <button
          onClick={onStart}
          className="w-24 h-24 rounded-full flex items-center justify-center"
          style={{
            background: COLOR.brandYellow,
            color: "#0A0A0A",
            boxShadow: `0 0 40px ${COLOR.brandYellow}66`,
          }}
          aria-label="Iniciar"
        >
          <Play size={36} className="ml-1" />
        </button>
        <div className="mt-3 text-[10px] uppercase tracking-widest" style={{ color: COLOR.grayFaint }}>
          Toca para arrancar · 3-2-1 y a por ello
        </div>
      </div>
    </div>
  );
}

function BlockPreviewRow({ block, index }: { block: TimerBlock; index: number }) {
  const isRest = block.kind === "rest";
  const bg = isRest ? "rgba(245,158,11,0.10)" : "rgba(252,211,77,0.08)";
  const border = isRest ? "rgba(245,158,11,0.30)" : "rgba(252,211,77,0.25)";
  const chipBg = isRest ? COLOR.brandOrange : COLOR.brandYellow;
  const chipTxt = "#0A0A0A";

  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 border" style={{ background: bg, borderColor: border }}>
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-black tabular-nums"
        style={{ background: chipBg, color: chipTxt }}
      >
        {String(index + 1).padStart(2, "0")}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold" style={{ color: COLOR.white }}>
          {describeBlockShort(block)}
        </div>
        <div className="text-[10px] mt-0.5" style={{ color: COLOR.grayDim }}>
          {describeBlockDetail(block)}
        </div>
      </div>
      <div className="text-[11px] font-mono tabular-nums font-bold" style={{ color: isRest ? COLOR.brandOrange : COLOR.brandYellow }}>
        {fmtDuration(blockDur(block))}
      </div>
    </div>
  );
}

/** Etiqueta corta que dice de un vistazo qué es el bloque. */
function describeBlockShort(b: TimerBlock): string {
  switch (b.kind) {
    case "amrap":     return `AMRAP ${Math.round(b.totalSeconds / 60)}′`;
    case "emom":      return `EMOM ${Math.round(b.totalSeconds / 60)}′ · cada ${b.intervalSeconds}s`;
    case "tabata":    return `Tabata ${b.workSeconds}/${b.restSeconds} × ${b.rounds}`;
    case "intervals": return `Intervalos ${b.workSeconds}″/${b.restSeconds}″ × ${b.rounds}`;
    case "fortime":   return b.capSeconds ? `For time (cap ${Math.round(b.capSeconds / 60)}′)` : "For time";
    case "rest":      return `Descanso ${b.totalSeconds < 60 ? `${b.totalSeconds}″` : `${Math.round(b.totalSeconds / 60)}′`}`;
  }
}

/** Segunda línea con más detalle o número de rondas totales. */
function describeBlockDetail(b: TimerBlock): string {
  switch (b.kind) {
    case "amrap":     return "Cuenta atrás · máximas rondas";
    case "emom": {
      const rounds = Math.max(1, Math.round(b.totalSeconds / b.intervalSeconds));
      return `${rounds} intervalos`;
    }
    case "tabata":    return `${b.rounds} rondas · Work + Rest`;
    case "intervals": return `${b.rounds} rondas · Work + Rest`;
    case "fortime":   return "Cronómetro hacia arriba";
    case "rest":      return "Recupera antes del siguiente bloque";
  }
}

// ────────────────────────── editor de bloques ──────────────────────────

function ConfigEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: TimerConfig | null;
  onSave: (cfg: TimerConfig) => void;
  onCancel: () => void;
}) {
  const [blocks, setBlocks] = useState<TimerBlock[]>(initial?.blocks?.length ? initial.blocks : [defaultBlock("amrap")]);

  function updateBlock(i: number, b: TimerBlock) {
    setBlocks((prev) => prev.map((x, j) => (i === j ? b : x)));
  }
  function removeBlock(i: number) {
    setBlocks((prev) => prev.length > 1 ? prev.filter((_, j) => j !== i) : prev);
  }
  function addBlock(kind: TimerBlockKind) {
    setBlocks((prev) => [...prev, defaultBlock(kind)]);
  }
  function move(i: number, dir: -1 | 1) {
    setBlocks((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  const total = blocks.reduce((sum, b) => sum + blockDur(b), 0);

  return (
    <div className="w-full max-w-lg text-white px-5 py-8 overflow-y-auto max-h-screen">
      <h2 className="text-xl font-bold mb-1" style={{ color: COLOR.brandYellow }}>Configura tu timer</h2>
      <p className="text-xs mb-5" style={{ color: COLOR.grayDim }}>
        Encadena bloques (AMRAP → descanso → EMOM → descanso → …). Cada uno con su config.
      </p>

      <div className="space-y-3">
        {blocks.map((b, i) => (
          <BlockCard
            key={i}
            index={i}
            block={b}
            total={blocks.length}
            onChange={(nb) => updateBlock(i, nb)}
            onRemove={() => removeBlock(i)}
            onMoveUp={() => move(i, -1)}
            onMoveDown={() => move(i, 1)}
          />
        ))}
      </div>

      {/* Botones añadir bloque */}
      <div className="mt-4">
        <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: COLOR.grayFaint }}>Añadir bloque</div>
        <div className="grid grid-cols-3 gap-1.5">
          {(["amrap", "emom", "tabata"] as const).map((k) => (
            <button key={k} onClick={() => addBlock(k)}
              className="text-xs font-semibold py-2 rounded-md border border-white/20 hover:bg-white/10 flex items-center justify-center gap-1"
              style={{ color: COLOR.brandYellow }}
            >
              <Plus size={12} /> {kindLabel(k)}
            </button>
          ))}
          {(["intervals", "fortime", "rest"] as const).map((k) => (
            <button key={k} onClick={() => addBlock(k)}
              className="text-xs font-semibold py-2 rounded-md border border-white/20 hover:bg-white/10 flex items-center justify-center gap-1"
              style={{ color: k === "rest" ? COLOR.brandOrange : COLOR.brandYellow }}
            >
              <Plus size={12} /> {kindLabel(k)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 text-[11px]" style={{ color: COLOR.grayFaint }}>
        Duración estimada: <strong style={{ color: COLOR.white }}>{fmtDuration(total)}</strong> · Se añaden 3s de cuenta atrás inicial.
      </div>

      <div className="flex gap-2 mt-6 pb-6">
        <button onClick={onCancel} className="flex-1 py-3 rounded-lg text-sm font-medium" style={{ background: "rgba(255,255,255,0.10)" }}>
          Cancelar
        </button>
        <button
          onClick={() => onSave({ blocks })}
          disabled={blocks.length === 0}
          className="flex-1 py-3 rounded-lg text-sm font-bold disabled:opacity-40"
          style={{ background: COLOR.brandYellow, color: "#0A0A0A" }}
        >
          Usar este timer
        </button>
      </div>
    </div>
  );
}

function BlockCard({
  index, block, total, onChange, onRemove, onMoveUp, onMoveDown,
}: {
  index: number;
  block: TimerBlock;
  total: number;
  onChange: (b: TimerBlock) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const isRest = block.kind === "rest";
  const chipColor = isRest ? COLOR.brandOrange : COLOR.brandYellow;

  function changeKind(kind: TimerBlockKind) {
    onChange(defaultBlock(kind));
  }

  return (
    <div
      className="rounded-xl p-3 border"
      style={{
        background: isRest ? "rgba(245,158,11,0.08)" : "rgba(252,211,77,0.05)",
        borderColor: isRest ? "rgba(245,158,11,0.25)" : "rgba(252,211,77,0.20)",
      }}
    >
      {/* Cabecera del bloque */}
      <div className="flex items-center gap-2 mb-3">
        <div className="text-[10px] font-bold px-2 py-1 rounded" style={{ background: chipColor + "22", color: chipColor }}>
          {String(index + 1).padStart(2, "0")}
        </div>
        <select
          value={block.kind}
          onChange={(e) => changeKind(e.target.value as TimerBlockKind)}
          className="flex-1 bg-white/10 border border-white/15 rounded px-2 py-1.5 text-sm outline-none"
        >
          <option value="amrap">AMRAP</option>
          <option value="emom">EMOM</option>
          <option value="tabata">Tabata</option>
          <option value="intervals">Intervalos</option>
          <option value="fortime">For time</option>
          <option value="rest">Descanso</option>
        </select>
        <button onClick={onMoveUp} disabled={index === 0} className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30" title="Subir">
          <ChevronUp size={14} />
        </button>
        <button onClick={onMoveDown} disabled={index === total - 1} className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30" title="Bajar">
          <ChevronDown size={14} />
        </button>
        <button onClick={onRemove} disabled={total <= 1} className="p-1.5 rounded hover:bg-red-500/20 disabled:opacity-30" title="Borrar" style={{ color: total > 1 ? "#EF4444" : undefined }}>
          <Trash2 size={14} />
        </button>
      </div>

      {/* Config específica por tipo */}
      <BlockFields block={block} onChange={onChange} />
    </div>
  );
}

function BlockFields({ block, onChange }: { block: TimerBlock; onChange: (b: TimerBlock) => void }) {
  switch (block.kind) {
    case "amrap":
      return (
        <div className="grid grid-cols-1 gap-2">
          <NumInput label="Duración (min)" value={block.totalSeconds / 60} onChange={(v) => onChange({ ...block, totalSeconds: v * 60 })} min={1} max={90} />
        </div>
      );
    case "emom":
      return (
        <div className="grid grid-cols-2 gap-2">
          <NumInput label="Duración (min)" value={block.totalSeconds / 60} onChange={(v) => onChange({ ...block, totalSeconds: v * 60 })} min={1} max={60} />
          <NumInput label="Cada (seg)" value={block.intervalSeconds} onChange={(v) => onChange({ ...block, intervalSeconds: v })} min={10} max={300} step={5} />
        </div>
      );
    case "tabata":
    case "intervals":
      return (
        <div className="grid grid-cols-3 gap-2">
          <NumInput label="Work (s)" value={block.workSeconds} onChange={(v) => onChange({ ...block, workSeconds: v })} min={5} max={900} step={5} />
          <NumInput label="Rest (s)" value={block.restSeconds} onChange={(v) => onChange({ ...block, restSeconds: v })} min={0} max={600} step={5} />
          <NumInput label="Rondas" value={block.rounds} onChange={(v) => onChange({ ...block, rounds: v })} min={1} max={30} />
        </div>
      );
    case "fortime":
      return (
        <div className="grid grid-cols-1 gap-2">
          <label className="flex items-center gap-2 text-xs" style={{ color: COLOR.grayDim }}>
            <input
              type="checkbox"
              checked={block.capSeconds !== null}
              onChange={(e) => onChange({ ...block, capSeconds: e.target.checked ? 20 * 60 : null })}
            />
            Con time cap
          </label>
          {block.capSeconds !== null && (
            <NumInput label="Cap (min)" value={block.capSeconds / 60} onChange={(v) => onChange({ ...block, capSeconds: v * 60 })} min={1} max={90} />
          )}
        </div>
      );
    case "rest":
      return (
        <div className="grid grid-cols-1 gap-2">
          <NumInput label="Duración descanso (seg)" value={block.totalSeconds} onChange={(v) => onChange({ ...block, totalSeconds: v })} min={5} max={600} step={5} />
        </div>
      );
  }
}

function NumInput({
  label, value, onChange, min, max, step = 1,
}: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number;
}) {
  const [text, setText] = useState<string>(String(value));
  const lastPropRef = useRef(value);
  useEffect(() => {
    if (lastPropRef.current !== value) {
      lastPropRef.current = value;
      setText(String(value));
    }
  }, [value]);

  function commit() {
    const trimmed = text.trim();
    if (trimmed === "") { setText(String(value)); return; }
    const n = Number(trimmed);
    if (!isFinite(n)) { setText(String(value)); return; }
    const clamped = Math.max(min, Math.min(max, n));
    lastPropRef.current = clamped;
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  }

  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider mb-1 block" style={{ color: COLOR.grayDim }}>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
        min={min} max={max} step={step}
        className="w-full bg-white/10 border border-white/15 rounded-md px-2.5 py-2 text-base font-mono font-bold tabular-nums outline-none focus:border-white/40"
        style={{ color: COLOR.white }}
      />
    </label>
  );
}

function defaultBlock(kind: TimerBlockKind): TimerBlock {
  switch (kind) {
    case "amrap":     return { kind: "amrap", totalSeconds: 12 * 60 };
    case "emom":      return { kind: "emom", totalSeconds: 12 * 60, intervalSeconds: 60 };
    case "tabata":    return { kind: "tabata", workSeconds: 20, restSeconds: 10, rounds: 8 };
    case "intervals": return { kind: "intervals", workSeconds: 180, restSeconds: 90, rounds: 5 };
    case "fortime":   return { kind: "fortime", capSeconds: 20 * 60 };
    case "rest":      return { kind: "rest", totalSeconds: 60 };
  }
}

function kindLabel(k: TimerBlockKind): string {
  return blockLabel({ kind: k } as TimerBlock);
}

function blockDur(b: TimerBlock): number {
  switch (b.kind) {
    case "amrap":     return b.totalSeconds;
    case "emom":      return b.totalSeconds;
    case "tabata":    return (b.workSeconds + b.restSeconds) * b.rounds;
    case "intervals": return (b.workSeconds + b.restSeconds) * b.rounds;
    case "fortime":   return b.capSeconds ?? 0;
    case "rest":      return b.totalSeconds;
  }
}

/**
 * Panel deslizable de preferencias del timer. Se abre desde el icono
 * "sliders" de la cabecera. Guarda: volumen, duración de la cuenta atrás
 * inicial y toggles de sonido/vibración. Los valores se persisten en
 * localStorage en el componente padre.
 */
function PreferencesPanel({
  audioOn, onToggleAudio,
  vibrateOn, onToggleVibrate,
  volume, onChangeVolume,
  prepSeconds, onChangePrep,
  advancedMode, onToggleAdvanced,
  isAdvancePatient,
  onClose,
}: {
  audioOn: boolean;
  onToggleAudio: () => void;
  vibrateOn: boolean;
  onToggleVibrate: () => void;
  volume: number;
  onChangeVolume: (v: number) => void;
  prepSeconds: number;
  onChangePrep: (v: number) => void;
  advancedMode: boolean;
  onToggleAdvanced: () => void;
  isAdvancePatient: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute z-[110]"
      style={{
        top: 0, left: 0, right: 0, bottom: 0,
        background: "#0A0A0A",
        color: COLOR.white,
        overflowY: "auto",
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      {/* Cabecera propia con back para que se sienta como pantalla real */}
      <div className="max-w-md mx-auto px-5">
        <div className="flex items-center gap-3 pb-4 mb-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <button
            onClick={onClose}
            className="text-sm font-medium py-2 pr-2 -ml-1"
            style={{ color: COLOR.white }}
            aria-label="Volver al timer"
          >
            ← Volver
          </button>
          <div className="flex-1 text-center">
            <div className="text-[10px] uppercase tracking-[0.3em] font-bold" style={{ color: COLOR.brandYellow }}>
              Preferencias
            </div>
            <div className="text-sm font-medium mt-0.5" style={{ color: COLOR.grayDim }}>
              Timer
            </div>
          </div>
          <div className="w-14" />
        </div>

        <div className="space-y-5 py-3">

        {/* Volumen */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium">Volumen</label>
            <span className="text-xs tabular-nums" style={{ color: COLOR.grayDim }}>
              {Math.round(volume * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onToggleAudio} className="p-1" aria-label="Sonido on/off">
              {audioOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(volume * 100)}
              onChange={(e) => onChangeVolume(Number(e.target.value) / 100)}
              className="flex-1 accent-yellow-400"
              disabled={!audioOn}
            />
          </div>
          <p className="text-[10px] mt-1" style={{ color: COLOR.grayFaint }}>
            El máximo real depende del volumen del móvil. Sube ambos para el ruido gordo del gym.
          </p>
        </div>

        {/* Cuenta atrás inicial */}
        <div>
          <label className="text-sm font-medium block mb-1.5">Cuenta atrás inicial</label>
          <div className="grid grid-cols-3 gap-2">
            {PREP_OPTIONS.map((opt) => {
              const selected = prepSeconds === opt;
              return (
                <button
                  key={opt}
                  onClick={() => onChangePrep(opt)}
                  className="py-2 text-sm rounded-lg font-semibold"
                  style={{
                    background: selected ? COLOR.brandYellow : "rgba(255,255,255,0.08)",
                    color: selected ? "#0A0A0A" : COLOR.white,
                    border: selected ? "1px solid transparent" : "1px solid rgba(255,255,255,0.15)",
                  }}
                >
                  {opt}s
                </button>
              );
            })}
          </div>
        </div>

        {/* Vibración */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium block">Vibración</label>
            <p className="text-[10px]" style={{ color: COLOR.grayFaint }}>Feedback háptico en los avisos.</p>
          </div>
          <button
            onClick={onToggleVibrate}
            className="p-2 rounded-lg"
            style={{
              background: vibrateOn ? COLOR.brandYellow : "rgba(255,255,255,0.08)",
              color: vibrateOn ? "#0A0A0A" : COLOR.white,
            }}
            aria-label="Vibración on/off"
          >
            <Vibrate size={16} />
          </button>
        </div>

        {/* Modo ADVANCE — solo visible para pacientes ADVANCE, con look
            especial para reforzar la sensación de exclusividad. */}
        {isAdvancePatient && (
          <div
            className="pt-3 mt-2 rounded-xl p-3"
            style={{
              background: "linear-gradient(135deg, rgba(252,211,77,0.10), rgba(245,158,11,0.05))",
              border: "1px solid rgba(252,211,77,0.35)",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[9px] font-bold tracking-[0.25em] uppercase mb-1" style={{ color: COLOR.brandYellow }}>
                  ⚡ Exclusivo ADVANCE
                </div>
                <div className="text-sm font-semibold" style={{ color: COLOR.white }}>
                  Rondas + splits
                </div>
                <p className="text-[10px] mt-1 leading-snug" style={{ color: COLOR.grayDim }}>
                  Botón "Ronda" durante el timer y mini-informe al terminar el WOD,
                  estilo laps de Garmin. Solo para atletas ADVANCE.
                </p>
              </div>
              <button
                onClick={onToggleAdvanced}
                aria-pressed={advancedMode}
                className="relative w-12 h-7 rounded-full shrink-0 transition-colors"
                style={{
                  background: advancedMode ? COLOR.brandYellow : "rgba(255,255,255,0.10)",
                  border: `1px solid ${advancedMode ? COLOR.brandYellow : "rgba(255,255,255,0.20)"}`,
                }}
              >
                <span
                  className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                  style={{
                    left: advancedMode ? "calc(100% - 1.375rem)" : "0.125rem",
                    background: advancedMode ? "#0A0A0A" : COLOR.white,
                  }}
                />
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
