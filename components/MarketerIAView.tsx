"use client";

import { useState } from "react";
import Link from "next/link";
// (import intencionalmente en su sitio; el Link se usa en la lista de piezas
// cuando ya han sido añadidas al calendario, para abrir su ficha de edición)
import {
  FORMATS,
  GOALS,
  GOAL_COLOR_CLASSES,
  goalColor,
  formatIcon,
  formatLabelOnly,
  type GoalKey,
} from "@/lib/content-formats";
import { DAY_LABELS, isoWeekFromDate } from "@/lib/content-templates";

/**
 * Marketer IA: panel izq (brief) → panel dcha (estrategia propuesta) con
 * botones para añadir piezas concretas al calendario. Sin persistencia
 * de sesión (el CEO no guarda el brief, cada tirada es de usar y tirar).
 */

type Piece = {
  dayOfWeek: number;
  format: string;
  title: string;
  hook: string;
  goals: GoalKey[];
  rationale: string;
};

type Week = {
  weekOffset: number;
  centralTheme: string;
  bodyZone: string;
  weekType: "educativa" | "objeciones" | "lanzamiento" | "recuperacion";
  limitingBeliefs?: string[];
  pieces: Piece[];
};

type Result = {
  strategy: string;
  weeks: Week[];
};

const WEEK_TYPE_LABEL: Record<string, string> = {
  educativa: "Educativa",
  objeciones: "Objeciones",
  lanzamiento: "Lanzamiento",
  recuperacion: "Recuperación",
};

/**
 * Devuelve el próximo lunes desde hoy en UTC. Base por defecto cuando el
 * CEO no elige "empezar semana del...".
 */
function nextMondayUtc(): Date {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dow = d.getUTCDay(); // 0=Dom .. 6=Sab
  const daysUntilMonday = dow === 1 ? 7 : (8 - dow) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + daysUntilMonday);
  return d;
}

/**
 * Formatea un Date como "YYYY-MM-DD" para input type="date".
 */
function toDateInputValue(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Dado un YYYY-MM-DD, devuelve el LUNES de esa semana ISO en UTC.
 * El CEO puede elegir cualquier fecha; snappeamos al lunes para que la
 * base sea siempre un inicio de semana.
 */
function snapToMondayUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  const dow = day.getUTCDay(); // 0=Dom
  const backToMonday = dow === 0 ? 6 : dow - 1;
  day.setUTCDate(day.getUTCDate() - backToMonday);
  return day;
}

/**
 * Suma `offset` semanas al lunes base y devuelve el Date resultante.
 */
function mondayForOffset(baseMonday: Date, offset: number): Date {
  const d = new Date(baseMonday);
  d.setUTCDate(d.getUTCDate() + offset * 7);
  return d;
}

export function MarketerIAView() {
  const [brief, setBrief] = useState("");
  const [targetDate, setTargetDate] = useState("");
  // Semana de inicio de la estrategia. Por defecto, el próximo lunes desde
  // hoy. El input se snappea al lunes automáticamente si el CEO elige otro
  // día. Se envía al backend y se usa para posicionar todas las weekOffset.
  const [startWeek, setStartWeek] = useState<string>(() => toDateInputValue(nextMondayUtc()));
  const [weeksAhead, setWeeksAhead] = useState(2);
  const [mixReel, setMixReel] = useState(3);
  const [mixCarousel, setMixCarousel] = useState(1);
  const [mixInfographic, setMixInfographic] = useState(0);
  const [mixImage, setMixImage] = useState(0);
  const [mixLive, setMixLive] = useState(0);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  // Estado de "añadida al calendario" por índice compuesto weekOffset|dayOfWeek|posicion
  const [added, setAdded] = useState<Record<string, string>>({}); // key → pieceId

  async function generate() {
    if (brief.trim().length < 10) {
      setError("Escribe un brief más detallado (mínimo 10 caracteres)");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    setAdded({});
    try {
      const piecesPerWeek: Record<string, number> = {};
      if (mixReel > 0) piecesPerWeek.reel = mixReel;
      if (mixCarousel > 0) piecesPerWeek.carousel = mixCarousel;
      if (mixInfographic > 0) piecesPerWeek.infographic = mixInfographic;
      if (mixImage > 0) piecesPerWeek.image = mixImage;
      if (mixLive > 0) piecesPerWeek.live = mixLive;
      const r = await fetch("/api/content/marketer/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: brief.trim(),
          targetDate: targetDate || undefined,
          startWeek: toDateInputValue(snapToMondayUtc(startWeek)),
          weeksAhead,
          piecesPerWeek: Object.keys(piecesPerWeek).length > 0 ? piecesPerWeek : undefined,
        }),
      });
      // Parseo defensivo: si el server devuelve texto plano (timeout de
      // Vercel, error de infraestructura) el .json() peta con "Unexpected
      // token 'A'…". Leemos texto y probamos a parsear a mano.
      const raw = await r.text();
      let d: any;
      try {
        d = JSON.parse(raw);
      } catch {
        setError(
          r.status === 504
            ? "La IA tardó demasiado (>5 min). Prueba con menos semanas o brief más corto."
            : `Respuesta no válida del servidor (${r.status}): ${raw.slice(0, 200)}`,
        );
        return;
      }
      if (!r.ok || !d?.ok) {
        setError(d?.error || `Error ${r.status}`);
        return;
      }
      setResult({ strategy: d.strategy, weeks: d.weeks });
    } catch (e: any) {
      setError(e?.message || "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  async function addPiece(week: Week, piece: Piece, key: string) {
    if (added[key]) return;
    // Marcar optimista para bloquear doble click.
    setAdded((p) => ({ ...p, [key]: "loading" }));
    try {
      const baseMonday = snapToMondayUtc(startWeek);
      const monday = mondayForOffset(baseMonday, week.weekOffset);
      const { year, weekNumber } = isoWeekFromDate(monday);
      const r = await fetch("/api/content/marketer/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week: {
            year,
            weekNumber,
            centralTheme: week.centralTheme,
            bodyZone: week.bodyZone,
            weekType: week.weekType,
            limitingBeliefs: week.limitingBeliefs ?? [],
          },
          piece,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setAdded((p) => {
          const n = { ...p };
          delete n[key];
          return n;
        });
        alert(d.error || "No se pudo añadir");
        return;
      }
      setAdded((p) => ({ ...p, [key]: d.pieceId }));
    } catch (e: any) {
      setAdded((p) => {
        const n = { ...p };
        delete n[key];
        return n;
      });
      alert(e?.message || "Error inesperado");
    }
  }

  async function addAll() {
    if (!result) return;
    for (const week of result.weeks) {
      for (let i = 0; i < week.pieces.length; i++) {
        const piece = week.pieces[i];
        const key = `${week.weekOffset}|${piece.dayOfWeek}|${i}`;
        if (added[key]) continue;
        await addPiece(week, piece, key);
      }
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
      {/* Panel izq: brief */}
      <aside className="card space-y-3 self-start lg:sticky lg:top-4">
        <div>
          <label className="text-xs text-neutral-600 block mb-1">Brief / prompt</label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            className="w-full text-sm p-2 rounded-lg"
            style={{ border: "1px solid #E5E5E5", minHeight: 160 }}
            placeholder='Ej. "Lanzamiento del programa CONSOLIDA el 15 de octubre. Quiero 2 semanas educativas atacando el mito de que hay que descansar cuando duele el hombro, y luego una semana de lanzamiento con testimonios."'
            disabled={busy}
          />
        </div>

        <div>
          <label className="text-xs text-neutral-600 block mb-1">Empezar semana del…</label>
          <input
            type="date"
            value={startWeek}
            onChange={(e) => setStartWeek(e.target.value)}
            className="input text-sm w-full"
            disabled={busy}
          />
          <p className="text-[10px] text-neutral-500 mt-1">
            {(() => {
              const monday = snapToMondayUtc(startWeek);
              return `Snap al lunes ${monday.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}`;
            })()}
          </p>
        </div>

        <div>
          <label className="text-xs text-neutral-600 block mb-1">Fecha objetivo (opcional)</label>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="input text-sm w-full"
            disabled={busy}
          />
          <p className="text-[10px] text-neutral-500 mt-1">Si es un lanzamiento, la fecha del "día X".</p>
        </div>

        <div>
          <label className="text-xs text-neutral-600 block mb-1">Semanas a planificar</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => setWeeksAhead(n)}
                disabled={busy}
                className="text-xs px-3 py-1.5 rounded-lg border"
                style={
                  weeksAhead === n
                    ? { background: "#0A0A0A", color: "#FAFAFA", borderColor: "#0A0A0A" }
                    : { background: "#FFFFFF", color: "#0A0A0A", borderColor: "#E5E5E5" }
                }
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-neutral-600 block mb-1">Mezcla por semana</label>
          <div className="grid grid-cols-2 gap-2">
            <MixInput label="🎬 Reels" value={mixReel} onChange={setMixReel} disabled={busy} />
            <MixInput label="🎞️ Carrusel" value={mixCarousel} onChange={setMixCarousel} disabled={busy} />
            <MixInput label="📝 Infografía" value={mixInfographic} onChange={setMixInfographic} disabled={busy} />
            <MixInput label="📸 Foto" value={mixImage} onChange={setMixImage} disabled={busy} />
            <MixInput label="🔴 Directo" value={mixLive} onChange={setMixLive} disabled={busy} />
          </div>
        </div>

        {error && (
          <div className="rounded-lg p-2 text-xs" style={{ background: "#FEE2E2", color: "#7F1D1D", border: "1px solid #FCA5A5" }}>
            {error}
          </div>
        )}

        <button
          onClick={generate}
          disabled={busy || brief.trim().length < 10}
          className="w-full text-sm font-semibold px-3 py-2.5 rounded-lg disabled:opacity-40"
          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
        >
          {busy ? "⏳ Pensando (10-20s)…" : "✨ Generar estrategia"}
        </button>
      </aside>

      {/* Panel dcha: resultado */}
      <section className="min-w-0">
        {!result && !busy && (
          <div className="card text-center py-16 text-neutral-500">
            <p className="text-sm">Escribe un brief y pulsa <b>Generar estrategia</b>.</p>
            <p className="text-xs mt-2">La IA verá tu Brief IA, temas recientes ya publicados y la mezcla que le pidas.</p>
          </div>
        )}

        {busy && (
          <div className="card text-center py-16 text-neutral-500">
            <p className="text-sm">⏳ La IA está trabajando…</p>
            <p className="text-xs mt-2">Suele tardar 10-20 segundos.</p>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* Resumen + acción global */}
            <div className="card space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Estrategia propuesta</div>
                <p className="text-sm text-neutral-800 leading-relaxed">{result.strategy}</p>
              </div>
              <div className="flex justify-between items-center gap-2 flex-wrap">
                <div className="text-xs text-neutral-500">
                  {result.weeks.length} semana{result.weeks.length === 1 ? "" : "s"} · {result.weeks.reduce((n, w) => n + w.pieces.length, 0)} piezas
                </div>
                <button
                  onClick={addAll}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg"
                  style={{ background: "#065F46", color: "#FAFAFA" }}
                >
                  ➕ Añadir todas al calendario
                </button>
              </div>
            </div>

            {/* Semanas */}
            {result.weeks.map((week) => {
              const baseMonday = snapToMondayUtc(startWeek);
              const monday = mondayForOffset(baseMonday, week.weekOffset);
              const startStr = monday.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
              const end = new Date(monday);
              end.setUTCDate(end.getUTCDate() + 6);
              const endStr = end.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
              return (
                <div key={week.weekOffset} className="card">
                  <div className="border-b border-neutral-200 pb-2 mb-3">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <h3 className="text-base font-semibold">
                        Semana {week.weekOffset + 1}
                        <span className="text-neutral-500 font-normal"> · {startStr} → {endStr}</span>
                      </h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700">
                        {WEEK_TYPE_LABEL[week.weekType] ?? week.weekType}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-neutral-800">
                      <b>Tema:</b> {week.centralTheme || <span className="italic text-neutral-400">sin tema</span>}
                      {week.bodyZone && <span className="text-neutral-500"> · {week.bodyZone}</span>}
                    </div>
                    {week.limitingBeliefs && week.limitingBeliefs.length > 0 && (
                      <div className="text-xs text-neutral-600 mt-1">
                        <b>Creencias a atacar:</b> {week.limitingBeliefs.join(" · ")}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    {week.pieces.map((piece, i) => {
                      const key = `${week.weekOffset}|${piece.dayOfWeek}|${i}`;
                      const state = added[key];
                      const isAdded = state && state !== "loading";
                      const isLoading = state === "loading";
                      const dayLabel = DAY_LABELS[piece.dayOfWeek] ?? `Día ${piece.dayOfWeek}`;
                      return (
                        <div
                          key={key}
                          className="rounded-lg p-3 border"
                          style={{
                            background: isAdded ? "#F0FDF4" : "#FAFAFA",
                            borderColor: isAdded ? "#86EFAC" : "#E5E5E5",
                          }}
                        >
                          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span>{formatIcon(piece.format)}</span>
                              <span className="text-sm font-semibold">{piece.title}</span>
                              <span className="text-[10px] text-neutral-500">({formatLabelOnly(piece.format)})</span>
                            </div>
                            <span className="text-xs font-medium text-neutral-700 capitalize">📅 {dayLabel}</span>
                          </div>
                          {piece.goals.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-1.5">
                              {piece.goals.map((g) => (
                                <span key={g} className={`text-[10px] px-1.5 py-0.5 rounded ${GOAL_COLOR_CLASSES[goalColor(g)]}`}>
                                  {GOALS.find((G) => G.value === g)?.label ?? g}
                                </span>
                              ))}
                            </div>
                          )}
                          {piece.hook && (
                            <div className="mb-1">
                              <div className="text-[10px] uppercase tracking-wide text-neutral-500">💡 Idea principal</div>
                              <p className="text-sm italic text-neutral-800">"{piece.hook}"</p>
                            </div>
                          )}
                          {piece.rationale && (
                            <div className="text-[11px] text-neutral-600 italic">{piece.rationale}</div>
                          )}
                          <div className="mt-2 flex justify-end">
                            {isAdded ? (
                              <Link
                                href={`/fisio/contenido/pieza/${state}`}
                                className="text-xs font-medium px-3 py-1 rounded-md"
                                style={{ background: "#065F46", color: "#FAFAFA" }}
                              >
                                ✓ Añadida · abrir ficha
                              </Link>
                            ) : (
                              <button
                                onClick={() => addPiece(week, piece, key)}
                                disabled={isLoading}
                                className="text-xs font-medium px-3 py-1 rounded-md disabled:opacity-40"
                                style={{ background: "#0A0A0A", color: "#FAFAFA" }}
                              >
                                {isLoading ? "⏳" : "➕ Añadir al calendario"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function MixInput({ label, value, onChange, disabled }: { label: string; value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="number"
        min={0}
        max={7}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(7, Math.round(Number(e.target.value) || 0))))}
        className="input text-sm w-12 text-right tabular-nums"
        disabled={disabled}
      />
      <span className="text-[11px] text-neutral-600">{label}</span>
    </label>
  );
}
