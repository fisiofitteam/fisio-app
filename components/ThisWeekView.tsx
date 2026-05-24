"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DAY_LABELS,
  WEEK_TYPES,
  BODY_ZONES,
  WEEK_STATUS,
  PIECE_STATUS,
} from "@/lib/content-templates";
import {
  formatIcon,
  formatLabelOnly,
  parseGoals,
  goalColor,
  goalLabel,
  GOAL_COLOR_CLASSES,
} from "@/lib/content-formats";

type Piece = {
  id: string;
  dayOfWeek: number;
  format: string;
  title: string | null;
  goals: string;
  status: string;
  hook: string | null;
  metricsFilledAt: string | null;
};

type Week = {
  id: string;
  year: number;
  weekNumber: number;
  startDate: string;
  endDate: string;
  centralTheme: string;
  bodyZone: string;
  weekType: string;
  leadMagnetName: string | null;
  leadMagnetKeyword: string | null;
  kpiName: string | null;
  kpiTarget: number | null;
  status: string;
  closingNotes?: string | null;
  winningHooks?: string | null;
  ideasEmerged?: string | null;
  weekStories?: string | null;
  pieces: Piece[];
};

type WeekStats = {
  totals: { reach: number; saves: number; shares: number; comments: number; dmKeyword: number; conversions: number };
  piecesPublished: number;
  piecesWithoutMetrics: number;
  kpiActual: number | null;
};

type PendingMetric = {
  id: string;
  dayOfWeek: number;
  format: string;
  weekTheme: string;
  weekNumber: number;
  weekYear: number;
};

const STATUS_COLORS: Record<string, string> = {
  neutral: "bg-neutral-100 text-neutral-700 border-neutral-200",
  amber: "bg-amber-100 text-amber-800 border-amber-200",
  blue: "bg-blue-100 text-blue-800 border-blue-200",
  purple: "bg-purple-100 text-purple-800 border-purple-200",
  indigo: "bg-indigo-100 text-indigo-800 border-indigo-200",
  emerald: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

function formatRange(startISO: string, endISO: string): string {
  const s = new Date(startISO);
  const e = new Date(endISO);
  const sStr = s.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  const eStr = e.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  return `${sStr} → ${eStr}`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

type WeekListItem = {
  id: string;
  year: number;
  weekNumber: number;
  centralTheme: string;
  status: string;
  startDate: string;
  endDate: string;
};

export function ThisWeekView({
  week,
  weekList,
  weekStats,
  pendingMetrics,
  isFallback,
  suggestion,
}: {
  week: Week | null;
  weekList: WeekListItem[];
  weekStats: WeekStats | null;
  pendingMetrics: PendingMetric[];
  isFallback: boolean;
  suggestion: { year: number; weekNumber: number };
}) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showClose, setShowClose] = useState(false);

  function gotoWeek(id: string) {
    setShowPicker(false);
    router.push(`/fisio/contenido?week=${id}`);
    router.refresh();
  }

  if (!week) {
    return (
      <>
        <section className="card text-center py-12">
          <div className="text-5xl mb-3">✨</div>
          <h2 className="font-semibold text-lg mb-1">Empieza tu primera semana de contenido</h2>
          <p className="text-sm text-neutral-500 max-w-md mx-auto mb-5">
            Define el tema central, el lead magnet y la estrategia. El sistema generará automáticamente las 7 piezas con su estructura por defecto.
          </p>
          <button onClick={() => setShowNew(true)} className="btn btn-primary text-sm">
            + Crear semana {suggestion.weekNumber} de {suggestion.year}
          </button>
        </section>

        {showNew && (
          <NewWeekModal
            defaultYear={suggestion.year}
            defaultWeekNumber={suggestion.weekNumber}
            onClose={() => setShowNew(false)}
            onCreated={(weekId) => {
              setShowNew(false);
              router.push(`/fisio/contenido?week=${weekId}`);
              router.refresh();
            }}
          />
        )}
      </>
    );
  }

  const weekTypeLabel = WEEK_TYPES.find((w) => w.value === week.weekType)?.label ?? week.weekType;
  const zoneLabel = BODY_ZONES.find((z) => z.value === week.bodyZone)?.label ?? week.bodyZone;
  const statusMeta = WEEK_STATUS.find((s) => s.value === week.status);

  // weekList está ordenada de más reciente a más antigua (índice 0 = más reciente)
  const currentIdx = weekList.findIndex((w) => w.id === week.id);
  const olderWeek = currentIdx >= 0 && currentIdx < weekList.length - 1 ? weekList[currentIdx + 1] : null;
  const newerWeek = currentIdx > 0 ? weekList[currentIdx - 1] : null;

  return (
    <>
      {/* Banner global de métricas pendientes */}
      {pendingMetrics.length > 0 && (
        <PendingMetricsBanner pendingMetrics={pendingMetrics} />
      )}

      {/* Aprendizajes si la semana ya está cerrada */}
      {week.status === "closed" && (week.closingNotes || week.winningHooks || week.ideasEmerged) && (
        <ClosingNotesBlock week={week} />
      )}

      {/* Cabecera de la semana */}
      <section className="card mb-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full" style={{ background: "linear-gradient(180deg, #FCD34D 0%, #F59E0B 100%)" }} />

        <div className="pl-2">
          <div className="flex justify-between items-start gap-3 flex-wrap mb-2">
            <div className="flex-1 min-w-0">
              {/* Navegador entre semanas */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <button
                  onClick={() => olderWeek && gotoWeek(olderWeek.id)}
                  disabled={!olderWeek}
                  className="text-xs px-2 py-1 border border-neutral-200 rounded hover:bg-neutral-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={olderWeek ? `Ir a W${olderWeek.weekNumber}/${olderWeek.year}` : "No hay semana anterior"}
                >
                  ← Semana anterior
                </button>
                <button
                  onClick={() => setShowPicker((v) => !v)}
                  className="text-xs px-3 py-1 border border-neutral-300 rounded font-medium hover:bg-neutral-50 flex items-center gap-1"
                >
                  W{week.weekNumber}/{week.year} ▾
                </button>
                <button
                  onClick={() => newerWeek && gotoWeek(newerWeek.id)}
                  disabled={!newerWeek}
                  className="text-xs px-2 py-1 border border-neutral-200 rounded hover:bg-neutral-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={newerWeek ? `Ir a W${newerWeek.weekNumber}/${newerWeek.year}` : "No hay semana siguiente"}
                >
                  Semana siguiente →
                </button>
              </div>

              {/* Dropdown selector de semana */}
              {showPicker && (
                <div className="relative mb-3">
                  <div className="absolute z-20 bg-white border border-neutral-200 rounded-lg shadow-lg max-h-72 overflow-y-auto min-w-[320px]">
                    {weekList.map((w) => {
                      const wStatus = WEEK_STATUS.find((s) => s.value === w.status);
                      const isActive = w.id === week.id;
                      return (
                        <button
                          key={w.id}
                          onClick={() => gotoWeek(w.id)}
                          className={`w-full text-left px-3 py-2 hover:bg-neutral-50 border-b border-neutral-100 last:border-0 ${isActive ? "bg-amber-50" : ""}`}
                        >
                          <div className="flex justify-between items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium">W{w.weekNumber}/{w.year}</div>
                              <div className="text-xs text-neutral-500 truncate">{w.centralTheme || "Sin tema"}</div>
                            </div>
                            {wStatus && (
                              <span className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[wStatus.color]} whitespace-nowrap`}>
                                {wStatus.label}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-semibold text-lg">{week.centralTheme || "Sin tema central"}</h2>
                {statusMeta && (
                  <span className={`text-[10px] uppercase font-semibold tracking-wide px-2 py-0.5 rounded-full border ${STATUS_COLORS[statusMeta.color]}`}>
                    {statusMeta.label}
                  </span>
                )}
                {isFallback && (
                  <span className="text-[10px] uppercase text-neutral-500 italic">última cerrada</span>
                )}
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                {formatRange(week.startDate, week.endDate)} · {zoneLabel} · {weekTypeLabel}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {week.status !== "closed" && (
                <button onClick={() => setShowClose(true)} className="btn btn-accent text-xs">
                  🏁 Cerrar semana
                </button>
              )}
              <button onClick={() => setShowEdit(true)} className="btn text-xs">
                ✏️ Editar
              </button>
              <button onClick={() => setShowNew(true)} className="btn btn-primary text-xs">
                + Nueva semana
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 text-sm">
            <div className="bg-neutral-50 rounded-lg p-3">
              <div className="text-[10px] uppercase text-neutral-500 font-medium mb-1">Lead magnet</div>
              {week.leadMagnetName ? (
                <>
                  <div className="font-medium">{week.leadMagnetName}</div>
                  {week.leadMagnetKeyword && (
                    <div className="text-xs text-neutral-500 mt-0.5">Palabra clave: <span className="font-mono">{week.leadMagnetKeyword}</span></div>
                  )}
                </>
              ) : (
                <div className="text-neutral-400 italic text-xs">No definido</div>
              )}
            </div>
            <div className="bg-neutral-50 rounded-lg p-3">
              <div className="text-[10px] uppercase text-neutral-500 font-medium mb-1">KPI</div>
              {week.kpiName ? (
                <>
                  <div className="font-medium">{week.kpiName}</div>
                  {week.kpiTarget != null && (
                    <div className="text-xs text-neutral-500 mt-0.5">Objetivo: {week.kpiTarget}</div>
                  )}
                </>
              ) : (
                <div className="text-neutral-400 italic text-xs">No definido</div>
              )}
            </div>
            <div className="bg-neutral-50 rounded-lg p-3">
              <div className="text-[10px] uppercase text-neutral-500 font-medium mb-1">Progreso piezas</div>
              <PiecesProgress pieces={week.pieces} />
            </div>
          </div>
        </div>
      </section>

      {/* 7 piezas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {week.pieces.map((p) => (
          <PieceCard key={p.id} piece={p} weekId={week.id} />
        ))}
      </div>

      {/* Historias de la semana */}
      <WeekStoriesSection week={week} />

      {showNew && (
        <NewWeekModal
          defaultYear={suggestion.year}
          defaultWeekNumber={suggestion.weekNumber}
          onClose={() => setShowNew(false)}
          onCreated={(weekId) => {
            setShowNew(false);
            router.push(`/fisio/contenido?week=${weekId}`);
            router.refresh();
          }}
        />
      )}

      {showEdit && (
        <EditWeekModal
          week={week}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            router.refresh();
          }}
        />
      )}

      {showClose && weekStats && (
        <CloseWeekModal
          week={week}
          stats={weekStats}
          onClose={() => setShowClose(false)}
          onClosed={() => {
            setShowClose(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function PiecesProgress({ pieces }: { pieces: Piece[] }) {
  const published = pieces.filter((p) => p.status === "published").length;
  const scheduled = pieces.filter((p) => p.status === "scheduled").length;
  const inProgress = pieces.filter((p) => ["script", "recorded", "edited"].includes(p.status)).length;
  const ideas = pieces.filter((p) => p.status === "idea").length;

  return (
    <div className="space-y-1 text-xs">
      <div className="flex gap-3">
        {published > 0 && <span className="text-emerald-700">✓ {published}</span>}
        {scheduled > 0 && <span className="text-indigo-700">📅 {scheduled}</span>}
        {inProgress > 0 && <span className="text-amber-700">⚙ {inProgress}</span>}
        {ideas > 0 && <span className="text-neutral-500">💡 {ideas}</span>}
      </div>
      <div className="text-[10px] text-neutral-400">{published}/{pieces.length} publicadas</div>
    </div>
  );
}

function PieceCard({ piece, weekId }: { piece: Piece; weekId: string }) {
  const fmtLabel = formatLabelOnly(piece.format);
  const fmtIcon = formatIcon(piece.format);
  const statusMeta = PIECE_STATUS.find((s) => s.value === piece.status);
  const dayLabel = DAY_LABELS[piece.dayOfWeek] ?? "—";
  const goals = parseGoals(piece.goals);

  // Estos links irán a Entrega B (todavía no existe la página de pieza individual)
  return (
    <Link
      href={`/fisio/contenido/pieza/${piece.id}`}
      className="card hover:border-neutral-400 hover:shadow-sm transition-all block group"
    >
      <div className="flex justify-between items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase text-neutral-500 font-medium tracking-wide">
            {dayLabel}
          </div>
          <div className="font-semibold text-sm mt-0.5 break-words">
            <span className="mr-1.5">{fmtIcon}</span>
            <span>{piece.title || fmtLabel || piece.format}</span>
          </div>
          {goals.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {goals.map((g) => (
                <span key={g} className={`text-[10px] px-1.5 py-0.5 rounded ${GOAL_COLOR_CLASSES[goalColor(g)]}`}>
                  {goalLabel(g)}
                </span>
              ))}
            </div>
          )}
        </div>
        {statusMeta && (
          <span className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[statusMeta.color]} whitespace-nowrap flex-shrink-0`}>
            {statusMeta.label}
          </span>
        )}
      </div>

      {piece.hook && (
        <p className="text-xs text-neutral-700 italic line-clamp-2 mt-2 mb-2">
          "{piece.hook}"
        </p>
      )}

      {piece.status === "published" && !piece.metricsFilledAt && (
        <div className="text-[10px] text-amber-700 mt-2 bg-amber-50 rounded px-2 py-1 flex items-center gap-1">
          ⚠ Pendiente rellenar métricas
        </div>
      )}
    </Link>
  );
}

// ============================================================================
// Historias de la semana: 7 bloques de texto libre (1 por día), a nivel semana
// ============================================================================

function parseWeekStories(raw: string | null | undefined): string[] {
  let arr: string[] = [];
  try {
    const parsed = JSON.parse(raw || "[]");
    if (Array.isArray(parsed)) arr = parsed.map((x) => (typeof x === "string" ? x : ""));
  } catch {}
  while (arr.length < 7) arr.push("");
  return arr.slice(0, 7);
}

function WeekStoriesSection({ week }: { week: Week }) {
  const [values, setValues] = useState<string[]>(() => parseWeekStories(week.weekStories));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Si cambiamos de semana (mismo componente, distinto week.id), resetear
  useEffect(() => {
    setValues(parseWeekStories(week.weekStories));
    setSaveState("idle");
  }, [week.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function scheduleSave(next: string[]) {
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await fetch("/api/content/weeks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: week.id, weekStories: next }),
      });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    }, 1000);
  }

  function setDay(idx: number, val: string) {
    const next = values.map((v, i) => (i === idx ? val : v));
    setValues(next);
    scheduleSave(next);
  }

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-xl font-bold flex items-center gap-2">📲 Historias de la semana</h2>
        <span className="text-xs text-neutral-400 min-w-[70px] text-right">
          {saveState === "saving" ? "Guardando…" : saveState === "saved" ? "Guardado ✓" : ""}
        </span>
      </div>
      <p className="text-sm text-neutral-500 mb-3">
        Una idea de stories por día para acompañar la semana. Texto libre; se guarda solo.
      </p>
      <div className="border-t border-neutral-200 mb-4" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {values.map((val, idx) => {
          const dow = idx + 1;
          return (
            <div key={dow} className="card">
              <div className="flex justify-between items-center mb-1.5">
                <div className="text-[10px] uppercase text-neutral-500 font-medium tracking-wide">
                  {DAY_LABELS[dow]}
                </div>
                {val && (
                  <button
                    onClick={() => setDay(idx, "")}
                    className="text-[11px] text-neutral-300 hover:text-red-600"
                    title="Borrar contenido de este día"
                  >
                    Borrar
                  </button>
                )}
              </div>
              <textarea
                className="w-full bg-transparent border-0 outline-none text-sm resize-none min-h-[64px]"
                rows={3}
                value={val}
                onChange={(e) => setDay(idx, e.target.value)}
                placeholder="Ej: Caja de preguntas sobre el tema, encuesta, BTS de la grabación…"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ============================================================================
// Modal: crear nueva semana
// ============================================================================

function NewWeekModal({
  defaultYear,
  defaultWeekNumber,
  onClose,
  onCreated,
}: {
  defaultYear: number;
  defaultWeekNumber: number;
  onClose: () => void;
  onCreated: (weekId: string) => void;
}) {
  const [year, setYear] = useState(defaultYear);
  const [weekNumber, setWeekNumber] = useState(defaultWeekNumber);
  const [centralTheme, setCentralTheme] = useState("");
  const [bodyZone, setBodyZone] = useState("mixta");
  const [weekType, setWeekType] = useState("educativa");
  const [kpiName, setKpiName] = useState("DMs con palabra clave");
  const [kpiTarget, setKpiTarget] = useState("");
  const [weeklyTemplateId, setWeeklyTemplateId] = useState<string | null>(null);
  const [weeklyTemplates, setWeeklyTemplates] = useState<Array<{ id: string; name: string; description: string | null }>>([]);
  const [loadingTpls, setLoadingTpls] = useState(true);

  useEffect(() => {
    fetch("/api/weekly-templates")
      .then((r) => r.json())
      .then((data) => setWeeklyTemplates(data.templates || []))
      .catch(() => setWeeklyTemplates([]))
      .finally(() => setLoadingTpls(false));
  }, []);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch("/api/content/weeks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year, weekNumber, centralTheme, bodyZone, weekType,
        kpiName, kpiTarget: kpiTarget ? Number(kpiTarget) : null,
        weeklyTemplateId,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      onCreated(data.id);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Error al crear la semana");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-medium text-lg">Nueva semana de contenido</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Define lo mínimo. El resto lo puedes editar luego desde la ficha de la semana.
        </p>

        <div className="space-y-4">
          {/* Año + semana */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Año</label>
              <input type="number" className="input text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Número de semana (ISO)</label>
              <input type="number" min="1" max="53" className="input text-sm" value={weekNumber} onChange={(e) => setWeekNumber(Number(e.target.value))} />
            </div>
          </div>

          {/* Tema central */}
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Tema central</label>
            <input className="input text-sm" value={centralTheme} onChange={(e) => setCentralTheme(e.target.value)} placeholder="Ej: Impingement subacromial en CrossFitters" autoFocus />
          </div>

          {/* Zona + tipo */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Zona corporal</label>
              <select className="input text-sm" value={bodyZone} onChange={(e) => setBodyZone(e.target.value)}>
                {BODY_ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Tipo de semana</label>
              <select className="input text-sm" value={weekType} onChange={(e) => setWeekType(e.target.value)}>
                {WEEK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {/* KPI */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">KPI · Nombre</label>
              <input className="input text-sm" value={kpiName} onChange={(e) => setKpiName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">KPI · Objetivo</label>
              <input type="number" step="any" className="input text-sm" value={kpiTarget} onChange={(e) => setKpiTarget(e.target.value)} placeholder="Ej: 25" />
            </div>
          </div>

          {/* Selector plantilla semanal */}
          <div className="border-t border-neutral-100 pt-3">
            <label className="text-xs text-neutral-500 block mb-2">Plantilla semanal (opcional)</label>
            {loadingTpls ? (
              <p className="text-xs text-neutral-400 italic">Cargando plantillas...</p>
            ) : weeklyTemplates.length === 0 ? (
              <p className="text-xs text-neutral-400 italic">
                No hay plantillas semanales. Créalas en la pestaña Plantillas. Se crearán 7 piezas vacías.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => setWeeklyTemplateId(null)}
                  className={`text-left px-3 py-2 rounded-lg border transition ${
                    weeklyTemplateId === null ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200 hover:border-neutral-400"
                  }`}
                >
                  <div className="font-medium text-sm">📝 Sin plantilla</div>
                  <div className={`text-xs mt-0.5 ${weeklyTemplateId === null ? "text-neutral-300" : "text-neutral-500"}`}>
                    Crear las 7 piezas vacías.
                  </div>
                </button>
                {weeklyTemplates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setWeeklyTemplateId(t.id)}
                    className={`text-left px-3 py-2 rounded-lg border transition ${
                      weeklyTemplateId === t.id ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200 hover:border-neutral-400"
                    }`}
                  >
                    <div className="font-medium text-sm">🧩 {t.name}</div>
                    {t.description && (
                      <div className={`text-xs mt-0.5 ${weeklyTemplateId === t.id ? "text-neutral-300" : "text-neutral-500"}`}>
                        {t.description}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
            <button onClick={onClose} className="text-sm text-neutral-500">Cancelar</button>
            <button onClick={save} disabled={!centralTheme || saving} className="btn btn-primary text-sm">
              {saving ? "Creando..." : "Crear semana"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Banner global de métricas pendientes
// ============================================================================

function PendingMetricsBanner({ pendingMetrics }: { pendingMetrics: PendingMetric[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <span className="text-lg">🔔</span>
          <div>
            <p className="text-sm font-medium text-amber-900">
              Tienes {pendingMetrics.length} {pendingMetrics.length === 1 ? "pieza" : "piezas"} publicadas hace 5+ días sin métricas
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Rellenarlas te permite saber qué funciona y replicarlo. Tarda menos de un minuto por pieza.
            </p>
          </div>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-xs px-2 py-1 border border-amber-300 rounded hover:bg-amber-100 whitespace-nowrap">
          {expanded ? "Ocultar" : `Ver lista (${pendingMetrics.length})`}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-amber-200 space-y-1.5">
          {pendingMetrics.map((p) => {
            const tpl = { label: formatLabelOnly(p.format) };
            return (
              <Link
                key={p.id}
                href={`/fisio/contenido/pieza/${p.id}`}
                className="flex justify-between items-center gap-2 text-xs py-1 px-2 -mx-2 rounded hover:bg-amber-100"
              >
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{tpl?.label ?? p.format}</span>
                  <span className="text-amber-700 ml-2">· W{p.weekNumber}/{p.weekYear} · {p.weekTheme}</span>
                </div>
                <span className="text-amber-700 whitespace-nowrap">→</span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// Bloque de notas de cierre (cuando la semana está cerrada)
// ============================================================================

function ClosingNotesBlock({ week }: { week: Week }) {
  return (
    <section className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">🏁</span>
        <h3 className="text-sm font-semibold text-emerald-900">Aprendizajes de cierre</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        {week.closingNotes && (
          <div>
            <div className="text-[10px] uppercase text-emerald-700 font-semibold mb-1">Qué funcionó / qué no</div>
            <p className="text-neutral-800 whitespace-pre-wrap">{week.closingNotes}</p>
          </div>
        )}
        {week.winningHooks && (
          <div>
            <div className="text-[10px] uppercase text-emerald-700 font-semibold mb-1">Hooks ganadores</div>
            <p className="text-neutral-800 whitespace-pre-wrap">{week.winningHooks}</p>
          </div>
        )}
        {week.ideasEmerged && (
          <div>
            <div className="text-[10px] uppercase text-emerald-700 font-semibold mb-1">Ideas surgidas</div>
            <p className="text-neutral-800 whitespace-pre-wrap">{week.ideasEmerged}</p>
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================================
// Modal de cierre de semana
// ============================================================================

function CloseWeekModal({
  week,
  stats,
  onClose,
  onClosed,
}: {
  week: Week;
  stats: WeekStats;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [closingNotes, setClosingNotes] = useState(week.closingNotes ?? "");
  const [winningHooks, setWinningHooks] = useState(week.winningHooks ?? "");
  const [ideasEmerged, setIdeasEmerged] = useState(week.ideasEmerged ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmedDespiteMissing, setConfirmedDespiteMissing] = useState(false);

  const hasMissingMetrics = stats.piecesWithoutMetrics > 0;
  const canClose = !hasMissingMetrics || confirmedDespiteMissing;

  // Evaluación del KPI
  let kpiStatus: "above" | "met" | "below" | "unknown" = "unknown";
  if (week.kpiTarget != null && stats.kpiActual != null) {
    if (stats.kpiActual >= week.kpiTarget * 1.1) kpiStatus = "above";
    else if (stats.kpiActual >= week.kpiTarget) kpiStatus = "met";
    else kpiStatus = "below";
  }

  async function save() {
    setSaving(true);
    await fetch("/api/content/weeks/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekId: week.id, closingNotes, winningHooks, ideasEmerged }),
    });
    onClosed();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-medium text-lg">🏁 Cerrar semana W{week.weekNumber}/{week.year}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Revisa el resultado, deja tus aprendizajes y archiva la semana.
        </p>

        {/* Aviso métricas pendientes */}
        {hasMissingMetrics && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900 mb-2">
              ⚠ {stats.piecesWithoutMetrics} {stats.piecesWithoutMetrics === 1 ? "pieza publicada sin métricas" : "piezas publicadas sin métricas"}
            </p>
            <p className="text-xs text-amber-700 mb-2">
              Si cierras ahora, los aprendizajes serán incompletos. Mejor rellena las métricas primero.
            </p>
            <label className="flex items-center gap-2 text-xs text-amber-900">
              <input
                type="checkbox"
                checked={confirmedDespiteMissing}
                onChange={(e) => setConfirmedDespiteMissing(e.target.checked)}
              />
              Cerrar de todas formas
            </label>
          </div>
        )}

        {/* Resumen métricas */}
        <div className="mb-4 bg-neutral-50 rounded-lg p-3">
          <h4 className="text-xs uppercase text-neutral-500 font-medium mb-2">Resumen del período</h4>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center text-xs">
            <Stat label="Alcance" value={stats.totals.reach} />
            <Stat label="Guardados" value={stats.totals.saves} />
            <Stat label="Compartidos" value={stats.totals.shares} />
            <Stat label="Comentarios" value={stats.totals.comments} />
            <Stat label="DMs clave" value={stats.totals.dmKeyword} />
            <Stat label="Ventas" value={stats.totals.conversions} />
          </div>
        </div>

        {/* KPI vs objetivo */}
        {week.kpiName && week.kpiTarget != null && (
          <div className={`mb-4 rounded-lg p-3 border ${
            kpiStatus === "above" ? "bg-emerald-50 border-emerald-200" :
            kpiStatus === "met" ? "bg-emerald-50 border-emerald-200" :
            kpiStatus === "below" ? "bg-red-50 border-red-200" :
            "bg-neutral-50 border-neutral-200"
          }`}>
            <div className="text-xs uppercase font-semibold mb-1" style={{ color: kpiStatus === "below" ? "#B91C1C" : kpiStatus === "unknown" ? "#737373" : "#047857" }}>
              KPI: {week.kpiName}
            </div>
            <div className="flex items-baseline gap-3">
              <div className="text-2xl font-bold">
                {stats.kpiActual ?? "—"}
              </div>
              <div className="text-sm text-neutral-500">
                / objetivo {week.kpiTarget}
              </div>
              {kpiStatus === "above" && <span className="text-xs text-emerald-700 font-medium">🚀 superado</span>}
              {kpiStatus === "met" && <span className="text-xs text-emerald-700 font-medium">✓ conseguido</span>}
              {kpiStatus === "below" && <span className="text-xs text-red-700 font-medium">↓ por debajo</span>}
              {kpiStatus === "unknown" && <span className="text-xs text-neutral-500 italic">no se pudo calcular automáticamente</span>}
            </div>
          </div>
        )}

        {/* Aprendizajes */}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">📝 ¿Qué funcionó y qué no?</label>
            <textarea
              className="input text-sm"
              rows={3}
              value={closingNotes}
              onChange={(e) => setClosingNotes(e.target.value)}
              placeholder="Qué piezas/formatos rindieron, dónde fallaste, qué cambiarías..."
            />
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">⚡ Hooks ganadores (texto libre)</label>
            <textarea
              className="input text-sm"
              rows={3}
              value={winningHooks}
              onChange={(e) => setWinningHooks(e.target.value)}
              placeholder="Pega aquí los hooks que mejor funcionaron para tener un banco propio."
            />
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">💡 Ideas surgidas para semanas siguientes</label>
            <textarea
              className="input text-sm"
              rows={3}
              value={ideasEmerged}
              onChange={(e) => setIdeasEmerged(e.target.value)}
              placeholder="Apuntes, nuevos ángulos, audiencias a las que llegar..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-neutral-100 mt-4">
          <button onClick={onClose} className="text-sm text-neutral-500">Cancelar</button>
          <button
            onClick={save}
            disabled={!canClose || saving}
            className="btn btn-accent text-sm disabled:opacity-50"
          >
            {saving ? "Cerrando..." : "🏁 Cerrar semana"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-neutral-500">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value.toLocaleString("es-ES")}</div>
    </div>
  );
}

function EditWeekModal({
  week,
  onClose,
  onSaved,
}: {
  week: Week;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [centralTheme, setCentralTheme] = useState(week.centralTheme ?? "");
  const [bodyZone, setBodyZone] = useState(week.bodyZone ?? "mixta");
  const [weekType, setWeekType] = useState(week.weekType ?? "educativa");
  const [leadMagnetName, setLeadMagnetName] = useState(week.leadMagnetName ?? "");
  const [leadMagnetKeyword, setLeadMagnetKeyword] = useState(week.leadMagnetKeyword ?? "");
  const [kpiName, setKpiName] = useState(week.kpiName ?? "");
  const [kpiTarget, setKpiTarget] = useState(week.kpiTarget != null ? String(week.kpiTarget) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch("/api/content/weeks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: week.id,
        centralTheme, bodyZone, weekType,
        leadMagnetName, leadMagnetKeyword,
        kpiName,
        kpiTarget: kpiTarget ? Number(kpiTarget) : null,
      }),
    });
    if (res.ok) {
      onSaved();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Error al guardar");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-medium text-lg">Editar semana</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Semana {week.weekNumber}/{week.year}. Modifica solo lo que necesites.
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Tema central</label>
            <input className="input text-sm" value={centralTheme} onChange={(e) => setCentralTheme(e.target.value)} autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Zona corporal</label>
              <select className="input text-sm" value={bodyZone} onChange={(e) => setBodyZone(e.target.value)}>
                {BODY_ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Tipo de semana</label>
              <select className="input text-sm" value={weekType} onChange={(e) => setWeekType(e.target.value)}>
                {WEEK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Lead magnet</label>
              <input className="input text-sm" value={leadMagnetName} onChange={(e) => setLeadMagnetName(e.target.value)} placeholder="Ej: Guía hombro CrossFit" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Palabra clave DM</label>
              <input className="input text-sm font-mono uppercase" value={leadMagnetKeyword} onChange={(e) => setLeadMagnetKeyword(e.target.value.toUpperCase())} placeholder="Ej: HOMBRO" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">KPI · Nombre</label>
              <input className="input text-sm" value={kpiName} onChange={(e) => setKpiName(e.target.value)} placeholder="Ej: DMs con palabra clave" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">KPI · Objetivo</label>
              <input type="number" step="any" className="input text-sm" value={kpiTarget} onChange={(e) => setKpiTarget(e.target.value)} placeholder="Ej: 25" />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
            <button onClick={onClose} className="text-sm text-neutral-500">Cancelar</button>
            <button onClick={save} disabled={saving} className="btn btn-primary text-sm">
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

