"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BODY_ZONES,
  WEEK_TYPES,
  WEEK_STATUS,
  isoWeekFromDate,
} from "@/lib/content-templates";
import {
  FORMATS,
  formatIcon,
  formatLabelOnly,
  parseGoals,
  goalColor,
  goalLabel,
  GOAL_COLOR_CLASSES,
  goalTileClasses,
} from "@/lib/content-formats";
import { AddPieceModal } from "@/components/AddPieceModal";

type Piece = {
  id: string;
  dayOfWeek: number;
  format: string;
  title: string | null;
  goals: string;
  status: string;
  hook: string | null;
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
  status: string;
  pieces: Piece[];
};

type CalEvent = {
  id: string;
  date: string;
  title: string;
  notes: string | null;
  color: string;
};

const MONTH_NAMES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DAY_HEADERS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const STATUS_COLORS: Record<string, string> = {
  neutral: "bg-neutral-100 text-neutral-700",
  amber: "bg-amber-100 text-amber-800",
  blue: "bg-blue-100 text-blue-800",
  emerald: "bg-emerald-100 text-emerald-800",
};

// Color para eventos custom
const EVENT_COLORS: Record<string, string> = {
  neutral: "bg-neutral-200 text-neutral-800 border-neutral-300",
  amber: "bg-amber-200 text-amber-900 border-amber-300",
  blue: "bg-blue-200 text-blue-900 border-blue-300",
  emerald: "bg-emerald-200 text-emerald-900 border-emerald-300",
  purple: "bg-purple-200 text-purple-900 border-purple-300",
  rose: "bg-rose-200 text-rose-900 border-rose-300",
};

const EVENT_COLOR_OPTIONS = [
  { value: "neutral", label: "Gris" },
  { value: "amber", label: "Ámbar" },
  { value: "blue", label: "Azul" },
  { value: "emerald", label: "Verde" },
  { value: "purple", label: "Morado" },
  { value: "rose", label: "Rosa" },
];

export function CalendarView({
  view,
  month,
  year,
  zoneFilter,
  typeFilter,
  weeks,
  events,
}: {
  view: "month" | "table";
  month: number;
  year: number;
  zoneFilter: string;
  typeFilter: string;
  weeks: Week[];
  events: CalEvent[];
}) {
  const router = useRouter();

  function navigate(params: Record<string, string>) {
    const url = new URL(window.location.href);
    for (const k in params) {
      if (params[k] === "" || params[k] === "all") url.searchParams.delete(k);
      else url.searchParams.set(k, params[k]);
    }
    router.push(url.pathname + url.search);
    router.refresh();
  }

  function switchMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    navigate({ month: String(m), year: String(y) });
  }

  return (
    <>
      <header className="mb-4 flex justify-between items-end flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">Calendario</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Vista global de la estrategia</p>
        </div>

        <div className="flex gap-1 flex-wrap items-center">
          <a
            href={`/fisio/contenido/export-reels?month=${String(year)}-${String(month).padStart(2, "0")}`}
            className="px-3 py-1.5 text-xs rounded font-medium whitespace-nowrap"
            style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}
            title="Exportar los guiones de los reels del mes a PDF"
          >
            🎬 Exportar reels del mes
          </a>
          <button
            onClick={() => navigate({ view: "month" })}
            className={`px-3 py-1.5 text-xs rounded ${view === "month" ? "bg-neutral-900 text-white" : "bg-white border border-neutral-200"}`}
          >
            📅 Mensual
          </button>
          <button
            onClick={() => navigate({ view: "table" })}
            className={`px-3 py-1.5 text-xs rounded ${view === "table" ? "bg-neutral-900 text-white" : "bg-white border border-neutral-200"}`}
          >
            📋 Tabla
          </button>
        </div>
      </header>

      <section className="card mb-4">
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="text-[10px] uppercase text-neutral-500 block mb-1">Zona corporal</label>
            <select className="input text-xs w-auto" value={zoneFilter} onChange={(e) => navigate({ zone: e.target.value })}>
              <option value="all">Todas</option>
              {BODY_ZONES.map((z) => <option key={z.value} value={z.value}>{z.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase text-neutral-500 block mb-1">Tipo de semana</label>
            <select className="input text-xs w-auto" value={typeFilter} onChange={(e) => navigate({ type: e.target.value })}>
              <option value="all">Todas</option>
              {WEEK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {(zoneFilter !== "all" || typeFilter !== "all") && (
            <button onClick={() => navigate({ zone: "all", type: "all" })} className="text-xs text-neutral-500 underline">
              Limpiar filtros
            </button>
          )}
          <div className="ml-auto text-xs text-neutral-500">
            {weeks.length} {weeks.length === 1 ? "semana" : "semanas"}
          </div>
        </div>
      </section>

      {view === "month" ? (
        <MonthGrid month={month} year={year} weeks={weeks} events={events} onSwitchMonth={switchMonth} />
      ) : (
        <TableView weeks={weeks} />
      )}

      <section className="mt-4 text-xs text-neutral-500">
        <span className="mr-3 font-medium">Leyenda objetivos:</span>
        <span className={`inline-block mr-2 mb-1 px-2 py-0.5 rounded text-[10px] ${GOAL_COLOR_CLASSES.green}`}>🟢 Atraer / Conectar</span>
        <span className={`inline-block mr-2 mb-1 px-2 py-0.5 rounded text-[10px] ${GOAL_COLOR_CLASSES.yellow}`}>🟡 Educar</span>
        <span className={`inline-block mr-2 mb-1 px-2 py-0.5 rounded text-[10px] ${GOAL_COLOR_CLASSES.red}`}>🔴 Convertir / Lanzamiento</span>
      </section>
    </>
  );
}

// ============================================================================
// Vista mensual
// ============================================================================

// Encuentra la semana que cubre un día concreto (entre startDate y endDate inclusivos)
// y devuelve { weekId, dayOfWeek } o null si ese día no está cubierto por ninguna semana.
function findWeekForDate(weeks: Week[], dateKey: string): { weekId: string; dayOfWeek: number } | null {
  const target = new Date(dateKey + "T00:00:00.000Z").getTime();
  for (const w of weeks) {
    const ws = new Date(w.startDate).getTime();
    const we = new Date(w.endDate).getTime();
    // endDate suele ser el sábado/domingo a las 00:00, ampliamos para que incluya todo el día.
    const weEnd = we + 24 * 60 * 60 * 1000 - 1;
    if (target >= ws && target <= weEnd) {
      const diffDays = Math.round((target - ws) / (1000 * 60 * 60 * 24));
      const dayOfWeek = diffDays + 1; // 1=Lunes
      return { weekId: w.id, dayOfWeek };
    }
  }
  return null;
}

async function movePiece(pieceId: string, weekId: string, dayOfWeek: number) {
  const res = await fetch("/api/content/pieces", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: pieceId, weekId, dayOfWeek }),
  });
  return res.ok;
}

function MonthGrid({
  month: propMonth,
  year: propYear,
  weeks,
  events,
  onSwitchMonth,
}: {
  month: number;
  year: number;
  weeks: Week[];
  events: CalEvent[];
  onSwitchMonth: (delta: number) => void;
}) {
  const router = useRouter();
  const [eventModal, setEventModal] = useState<{ date: string; event: CalEvent | null } | null>(null);
  const [creatingWeek, setCreatingWeek] = useState(false);
  const [movePieceModal, setMovePieceModal] = useState<{ pieceId: string; pieceTitle: string; currentDate: string } | null>(null);
  const [addPieceModal, setAddPieceModal] = useState<{ weekId: string; dayOfWeek: number; weekLabel: string } | null>(null);

  // Estado local del mes mostrado. Inicial = props (URL). Cambiar localmente
  // permite el auto-avance durante el arrastre sin perder el drag nativo
  // (los eventos vienen pre-cargados ±2 meses; las weeks no se filtran por mes).
  const [month, setMonth] = useState(propMonth);
  const [year, setYear] = useState(propYear);
  useEffect(() => { setMonth(propMonth); setYear(propYear); }, [propMonth, propYear]);

  function shiftMonthLocal(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m); setYear(y);
  }

  // Track si hay un drag de pieza en curso (para enseñar las flechas como
  // drop zones).
  const [dragging, setDragging] = useState(false);

  // Timer del auto-avance al mantener encima de prev/next.
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [advancePending, setAdvancePending] = useState<"prev" | "next" | null>(null);

  function startAdvance(dir: "prev" | "next") {
    if (advancePending === dir) return;
    cancelAdvance();
    setAdvancePending(dir);
    advanceTimer.current = setTimeout(() => {
      shiftMonthLocal(dir === "prev" ? -1 : 1);
      setAdvancePending(null);
      advanceTimer.current = null;
    }, 500);
  }
  function cancelAdvance() {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    setAdvancePending(null);
  }

  // Crea (o abre, si ya existe) la semana de contenido para un lunes dado y
  // lleva a su vista para editarla.
  async function createWeekForMonday(monday: Date) {
    if (creatingWeek) return;
    setCreatingWeek(true);
    const local = new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate());
    const { year, weekNumber } = isoWeekFromDate(local);
    try {
      const res = await fetch("/api/content/weeks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, weekNumber }),
      });
      if (res.ok) {
        const w = await res.json();
        router.push(`/fisio/contenido?week=${w.id}`);
        return;
      }
      // Si ya existe (409), la abrimos igualmente.
      if (res.status === 409) {
        const existing = await res.json().catch(() => null);
        if (existing?.weekId) { router.push(`/fisio/contenido?week=${existing.weekId}`); return; }
      }
      alert("No se pudo crear la semana.");
    } catch {
      alert("No se pudo crear la semana.");
    } finally {
      setCreatingWeek(false);
    }
  }

  // Construir cuadrícula del mes
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const lastOfMonth = new Date(Date.UTC(year, month, 0));
  const firstDow = firstOfMonth.getUTCDay() === 0 ? 7 : firstOfMonth.getUTCDay();
  const startGrid = new Date(firstOfMonth);
  startGrid.setUTCDate(firstOfMonth.getUTCDate() - (firstDow - 1));

  const totalDays = lastOfMonth.getUTCDate();
  const totalSlots = firstDow - 1 + totalDays;
  const weeksCount = Math.ceil(totalSlots / 7);

  // Index piezas por fecha YYYY-MM-DD
  const piecesByDate = new Map<string, { weekId: string; piece: Piece; weekTheme: string; bodyZone: string }[]>();
  for (const w of weeks) {
    const wStart = new Date(w.startDate);
    for (const p of w.pieces) {
      const pDate = new Date(wStart);
      pDate.setUTCDate(wStart.getUTCDate() + (p.dayOfWeek - 1));
      const key = pDate.toISOString().split("T")[0];
      const arr = piecesByDate.get(key) ?? [];
      arr.push({ weekId: w.id, piece: p, weekTheme: w.centralTheme, bodyZone: w.bodyZone });
      piecesByDate.set(key, arr);
    }
  }

  // Index eventos por fecha
  const eventsByDate = new Map<string, CalEvent[]>();
  for (const e of events) {
    const key = e.date.split("T")[0];
    const arr = eventsByDate.get(key) ?? [];
    arr.push(e);
    eventsByDate.set(key, arr);
  }

  // Index semanas por su lunes (YYYY-MM-DD) → permite buscar la franja de tema cuando renderizamos la fila
  const weekByMonday = new Map<string, Week>();
  for (const w of weeks) {
    const key = w.startDate.split("T")[0];
    weekByMonday.set(key, w);
  }

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => { shiftMonthLocal(-1); router.push(`?month=${month === 1 ? 12 : month - 1}&year=${month === 1 ? year - 1 : year}`); }}
          onDragEnter={(e) => { e.preventDefault(); startAdvance("prev"); }}
          onDragOver={(e) => { e.preventDefault(); }}
          onDragLeave={() => cancelAdvance()}
          className="text-sm px-3 py-1.5 rounded transition-colors"
          style={{
            background: dragging && advancePending === "prev" ? "#FEF3C7" : "#FFFFFF",
            color: dragging && advancePending === "prev" ? "#92400E" : "#0A0A0A",
            border: dragging ? "1px dashed " + (advancePending === "prev" ? "#F59E0B" : "#E5E5E5") : "1px solid #E5E5E5",
          }}
          title={dragging ? "Mantén el arrastre aquí para cambiar de mes" : ""}
        >
          ← {MONTH_NAMES[month === 1 ? 12 : month - 1]}{advancePending === "prev" && "…"}
        </button>
        <h2 className="text-lg font-semibold">{MONTH_NAMES[month]} {year}</h2>
        <button
          onClick={() => { shiftMonthLocal(1); router.push(`?month=${month === 12 ? 1 : month + 1}&year=${month === 12 ? year + 1 : year}`); }}
          onDragEnter={(e) => { e.preventDefault(); startAdvance("next"); }}
          onDragOver={(e) => { e.preventDefault(); }}
          onDragLeave={() => cancelAdvance()}
          className="text-sm px-3 py-1.5 rounded transition-colors"
          style={{
            background: dragging && advancePending === "next" ? "#FEF3C7" : "#FFFFFF",
            color: dragging && advancePending === "next" ? "#92400E" : "#0A0A0A",
            border: dragging ? "1px dashed " + (advancePending === "next" ? "#F59E0B" : "#E5E5E5") : "1px solid #E5E5E5",
          }}
          title={dragging ? "Mantén el arrastre aquí para cambiar de mes" : ""}
        >
          {MONTH_NAMES[month === 12 ? 1 : month + 1]} →{advancePending === "next" && "…"}
        </button>
      </div>

      <section className="card p-0 overflow-hidden">
        {/* Cabecera de días */}
        <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50">
          {DAY_HEADERS.map((d) => (
            <div key={d} className="text-[11px] uppercase font-medium text-neutral-500 text-center py-2">{d}</div>
          ))}
        </div>

        {/* Filas de semana: cada fila = franja tema + 7 días */}
        {Array.from({ length: weeksCount }).map((_, rowIdx) => {
          // Lunes de esta fila
          const rowMonday = new Date(startGrid);
          rowMonday.setUTCDate(startGrid.getUTCDate() + rowIdx * 7);
          const rowMondayKey = rowMonday.toISOString().split("T")[0];
          const rowWeek = weekByMonday.get(rowMondayKey);

          return (
            <div key={rowIdx} className="grid grid-cols-7 border-b border-neutral-100 last:border-b-0">
              {/* Franja tema (ocupa columnas 1-7 de la fila si hay semana) */}
              {rowWeek && (
                <WeekThemeBanner week={rowWeek} />
              )}
              {!rowWeek && (
                <button
                  onClick={() => createWeekForMonday(rowMonday)}
                  disabled={creatingWeek}
                  className="col-span-7 px-2 py-1 text-[10px] text-neutral-400 italic border-b border-neutral-100 text-left hover:bg-amber-50 hover:text-amber-800 transition-colors disabled:opacity-50"
                  title="Crear la semana de contenido para estos días"
                >
                  + Crear semana
                </button>
              )}
              {/* Días */}
              {Array.from({ length: 7 }).map((_, colIdx) => {
                const day = new Date(rowMonday);
                day.setUTCDate(rowMonday.getUTCDate() + colIdx);
                const dateKey = day.toISOString().split("T")[0];
                const isOtherMonth = day.getUTCMonth() !== month - 1;
                const isToday = dateKey === todayKey;
                const dayPieces = piecesByDate.get(dateKey) ?? [];
                const dayEvents = eventsByDate.get(dateKey) ?? [];

                return (
                  <div
                    key={colIdx}
                    onClick={() => setEventModal({ date: dateKey, event: null })}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={async (e) => {
                      e.preventDefault();
                      const pieceId = e.dataTransfer.getData("text/piece-id");
                      const sourceWeekId = e.dataTransfer.getData("text/source-week-id");
                      const sourceDayOfWeek = Number(e.dataTransfer.getData("text/source-dayofweek"));
                      if (!pieceId) return;
                      const target = findWeekForDate(weeks, dateKey);
                      if (!target) {
                        alert("Ese día no está dentro de ninguna semana planificada. Crea la semana antes de mover la pieza.");
                        return;
                      }
                      // No hacer nada si se suelta en el mismo sitio
                      if (target.weekId === sourceWeekId && target.dayOfWeek === sourceDayOfWeek) return;
                      const ok = await movePiece(pieceId, target.weekId, target.dayOfWeek);
                      if (ok) {
                        router.refresh();
                      } else {
                        alert("Error al mover la pieza");
                      }
                    }}
                    className={`group min-h-[120px] p-1.5 border-r border-neutral-100 last:border-r-0 cursor-pointer hover:bg-amber-50/30 transition-colors ${
                      isOtherMonth ? "bg-neutral-50/50" : "bg-white"
                    } ${isToday ? "bg-amber-50" : ""}`}
                    title="Click para añadir evento · Arrastra piezas aquí"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className={`text-[11px] ${isOtherMonth ? "text-neutral-300" : isToday ? "text-amber-800 font-bold" : "text-neutral-500"}`}>
                        {day.getUTCDate()}
                      </span>
                      {/* Botón "+ Pieza" visible al hover, solo si el día cae en una semana */}
                      {(() => {
                        const target = findWeekForDate(weeks, dateKey);
                        if (!target) return null;
                        const wk = weeks.find((w) => w.id === target.weekId);
                        const weekLabel = wk
                          ? `Semana ${wk.weekNumber} · ${wk.centralTheme || "Sin tema"}`
                          : "";
                        return (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAddPieceModal({
                                weekId: target.weekId,
                                dayOfWeek: target.dayOfWeek,
                                weekLabel,
                              });
                            }}
                            className="text-[10px] leading-none font-medium text-neutral-400 hover:text-neutral-900 hover:bg-white rounded px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Añadir pieza este día"
                          >
                            + pieza
                          </button>
                        );
                      })()}
                    </div>

                    {/* Eventos custom */}
                    <div className="space-y-1 mb-1">
                      {dayEvents.map((ev) => (
                        <button
                          key={ev.id}
                          onClick={(e) => { e.stopPropagation(); setEventModal({ date: dateKey, event: ev }); }}
                          className={`block w-full text-left text-[10px] px-1.5 py-0.5 rounded border ${EVENT_COLORS[ev.color] ?? EVENT_COLORS.neutral} truncate font-medium`}
                          title={ev.notes ? `${ev.title}\n${ev.notes}` : ev.title}
                        >
                          ★ {ev.title}
                        </button>
                      ))}
                    </div>

                    {/* Piezas */}
                    <div className="space-y-1">
                      {dayPieces.map((dp) => {
                        const fmtLabel = formatLabelOnly(dp.piece.format);
                        const fmtIcon = formatIcon(dp.piece.format);
                        const label = dp.piece.title?.trim() || dp.piece.hook?.trim() || fmtLabel || "Pieza";
                        const statusIcon = dp.piece.status === "published" ? "✓" : dp.piece.status === "scheduled" ? "📅" : "";
                        const goals = parseGoals(dp.piece.goals);
                        return (
                          <Link
                            key={dp.piece.id}
                            href={`/fisio/contenido/pieza/${dp.piece.id}`}
                            onClick={(e) => e.stopPropagation()}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/piece-id", dp.piece.id);
                              e.dataTransfer.setData("text/source-week-id", dp.weekId);
                              e.dataTransfer.setData("text/source-dayofweek", String(dp.piece.dayOfWeek));
                              e.dataTransfer.effectAllowed = "move";
                              setDragging(true);
                            }}
                            onDragEnd={() => {
                              setDragging(false);
                              cancelAdvance();
                              // Si auto-avanzamos durante el drag, sincroniza URL
                              if (month !== propMonth || year !== propYear) {
                                router.push(`?month=${month}&year=${year}`);
                              }
                            }}
                            className={`relative flex flex-col gap-0.5 text-[10px] px-1.5 py-1 pr-5 rounded leading-tight cursor-move overflow-hidden ${goalTileClasses(goals)}`}
                            title={`${fmtLabel}${dp.piece.hook ? " · " + dp.piece.hook : ""}${dp.weekTheme ? " · " + dp.weekTheme : ""}`}
                          >
                            {statusIcon && (
                              <span className="absolute top-0.5 right-0.5 text-emerald-700 font-bold text-[11px] leading-none">
                                {statusIcon}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setMovePieceModal({
                                  pieceId: dp.piece.id,
                                  pieceTitle: label,
                                  currentDate: dateKey,
                                });
                              }}
                              draggable={false}
                              className="absolute bottom-0.5 right-0.5 text-[10px] leading-none px-1 rounded hover:bg-black/10"
                              title="Mover a otra fecha (cualquier mes)"
                            >
                              ↗
                            </button>
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!confirm(`¿Borrar la pieza "${label}"?\n\nNo se puede deshacer.`)) return;
                                const res = await fetch(`/api/content/pieces/${dp.piece.id}`, {
                                  method: "DELETE",
                                });
                                if (res.ok) {
                                  router.refresh();
                                } else {
                                  const data = await res.json().catch(() => ({}));
                                  alert(data?.error || "No se pudo borrar la pieza");
                                }
                              }}
                              draggable={false}
                              className="absolute bottom-0.5 right-5 text-[10px] leading-none px-1 rounded hover:bg-red-100 hover:text-red-700"
                              title="Borrar pieza"
                            >
                              🗑
                            </button>
                            <div className="flex items-start gap-1 pr-3">
                              <span className="flex-shrink-0">{fmtIcon}</span>
                              <span className="line-clamp-2 break-words flex-1 min-w-0">
                                {label}
                              </span>
                            </div>
                            {goals.length > 0 && (
                              <div className="flex flex-wrap gap-0.5 mt-0.5">
                                {goals.map((g) => (
                                  <span key={g} className={`text-[8px] px-1 rounded ${GOAL_COLOR_CLASSES[goalColor(g)]}`}>
                                    {goalLabel(g)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </section>

      <p className="text-[11px] text-neutral-500 italic mt-2">
        💡 Click en cualquier día para añadir un evento · Arrastra piezas entre días para mover · Mantén el arrastre sobre ← o → para cambiar de mes · Usa ↗ en cada pieza para saltar a cualquier fecha.
      </p>

      {eventModal && (
        <EventModal
          date={eventModal.date}
          event={eventModal.event}
          onClose={() => setEventModal(null)}
          onSaved={() => { setEventModal(null); router.refresh(); }}
        />
      )}

      {addPieceModal && (
        <AddPieceModal
          weekId={addPieceModal.weekId}
          weekLabel={addPieceModal.weekLabel}
          lockedDayOfWeek={addPieceModal.dayOfWeek}
          onClose={() => setAddPieceModal(null)}
        />
      )}

      {movePieceModal && (
        <MovePieceModal
          pieceTitle={movePieceModal.pieceTitle}
          currentDate={movePieceModal.currentDate}
          weeks={weeks}
          onClose={() => setMovePieceModal(null)}
          onMove={async (newDate) => {
            const target = findWeekForDate(weeks, newDate);
            if (!target) {
              alert("Ese día no está dentro de ninguna semana planificada. Crea la semana antes de mover la pieza.");
              return;
            }
            const ok = await movePiece(movePieceModal.pieceId, target.weekId, target.dayOfWeek);
            if (ok) {
              setMovePieceModal(null);
              router.refresh();
            } else {
              alert("Error al mover la pieza");
            }
          }}
        />
      )}
    </>
  );
}

function MovePieceModal({
  pieceTitle,
  currentDate,
  weeks,
  onClose,
  onMove,
}: {
  pieceTitle: string;
  currentDate: string;
  weeks: Week[];
  onClose: () => void;
  onMove: (newDate: string) => Promise<void>;
}) {
  const [target, setTarget] = useState(currentDate);
  const [busy, setBusy] = useState(false);
  const hasWeek = !!findWeekForDate(weeks, target);
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-medium text-sm">↗ Mover pieza a otra fecha</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none px-2">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-3 line-clamp-2">{pieceTitle}</p>
        <div className="mb-3">
          <label className="text-xs text-neutral-500 block mb-1.5">Nueva fecha</label>
          <input
            type="date"
            className="input text-sm w-full"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          {target !== currentDate && !hasWeek && (
            <p className="text-[11px] text-amber-700 mt-1">
              ⚠ Esa fecha no está dentro de una semana de contenido. Crea la semana antes.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-2" style={{ color: "#737373" }}>Cancelar</button>
          <button
            onClick={async () => { setBusy(true); await onMove(target); setBusy(false); }}
            disabled={busy || target === currentDate || !hasWeek}
            className="text-sm font-semibold px-3 py-2 rounded-lg disabled:opacity-50"
            style={{ background: "#0A0A0A", color: "#FAFAFA" }}
          >
            {busy ? "..." : "Mover aquí"}
          </button>
        </div>
      </div>
    </div>
  );
}

function WeekThemeBanner({ week }: { week: Week }) {
  const statusMeta = WEEK_STATUS.find((s) => s.value === week.status);
  const zone = BODY_ZONES.find((z) => z.value === week.bodyZone)?.label ?? week.bodyZone;
  const type = WEEK_TYPES.find((t) => t.value === week.weekType)?.label ?? week.weekType;

  return (
    <Link
      href={`/fisio/contenido?week=${week.id}`}
      title="Abrir y editar esta semana"
      className="col-span-7 px-2 py-1.5 border-b bg-neutral-100 border-neutral-200 text-neutral-700 hover:bg-neutral-200 transition-colors"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-[10px] uppercase font-bold tracking-wide text-neutral-500 whitespace-nowrap">
            W{week.weekNumber}
          </span>
          <span className="text-xs font-semibold truncate">
            {week.centralTheme || "Sin tema"}
          </span>
          <span className="text-[10px] text-neutral-500 whitespace-nowrap">
            · {zone} · {type}
          </span>
        </div>
        {statusMeta && (
          <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${STATUS_COLORS[statusMeta.color]} whitespace-nowrap`}>
            {statusMeta.label}
          </span>
        )}
      </div>
    </Link>
  );
}

// ============================================================================
// Modal de evento custom
// ============================================================================

function EventModal({
  date,
  event,
  onClose,
  onSaved,
}: {
  date: string;
  event: CalEvent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [color, setColor] = useState(event?.color ?? "amber");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title) return;
    setSaving(true);
    if (event) {
      await fetch("/api/content/calendar-events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: event.id, title, notes, color }),
      });
    } else {
      await fetch("/api/content/calendar-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, title, notes, color }),
      });
    }
    onSaved();
  }

  async function remove() {
    if (!event) return;
    if (!confirm("¿Eliminar este evento?")) return;
    setSaving(true);
    await fetch(`/api/content/calendar-events?id=${event.id}`, { method: "DELETE" });
    onSaved();
  }

  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("es-ES", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-medium">{event ? "Editar evento" : "Nuevo evento"}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-4 capitalize">{dateLabel}</p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Título</label>
            <input
              className="input text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Masterclass hombro, Workshop lumbar, Apertura plazas..."
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Notas (opcional)</label>
            <textarea
              className="input text-sm"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalles, hora, link..."
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Color</label>
            <div className="flex gap-1 flex-wrap">
              {EVENT_COLOR_OPTIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`text-[11px] px-2 py-1 rounded border ${EVENT_COLORS[c.value]} ${color === c.value ? "ring-2 ring-offset-1 ring-neutral-900" : ""}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-neutral-100">
            {event ? (
              <button onClick={remove} disabled={saving} className="text-xs text-red-600 hover:underline">Eliminar</button>
            ) : <span />}
            <div className="flex gap-2">
              <button onClick={onClose} className="text-sm text-neutral-500">Cancelar</button>
              <button onClick={save} disabled={!title || saving} className="btn btn-primary text-sm">
                {saving ? "Guardando..." : (event ? "Guardar" : "Crear evento")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Vista tabla
// ============================================================================

function TableView({ weeks }: { weeks: Week[] }) {
  if (weeks.length === 0) {
    return (
      <section className="card text-center py-12">
        <p className="text-sm text-neutral-400 italic">
          No hay semanas que cumplan los filtros.
        </p>
      </section>
    );
  }

  return (
    <section className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-neutral-500 uppercase border-b border-neutral-200">
            <th className="text-left py-2 px-2 font-medium">Semana</th>
            <th className="text-left py-2 px-2 font-medium">Tema</th>
            <th className="text-left py-2 px-2 font-medium">Zona</th>
            <th className="text-left py-2 px-2 font-medium">Tipo</th>
            <th className="text-left py-2 px-2 font-medium">Lead magnet</th>
            <th className="text-center py-2 px-2 font-medium">Progreso</th>
            <th className="text-left py-2 px-2 font-medium">Estado</th>
            <th className="text-right py-2 px-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => {
            const statusMeta = WEEK_STATUS.find((s) => s.value === w.status);
            const zone = BODY_ZONES.find((z) => z.value === w.bodyZone)?.label ?? w.bodyZone;
            const type = WEEK_TYPES.find((t) => t.value === w.weekType)?.label ?? w.weekType;
            const published = w.pieces.filter((p) => p.status === "published").length;
            return (
              <tr key={w.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                <td className="py-2 px-2 whitespace-nowrap">
                  <Link href={`/fisio/contenido?week=${w.id}`} className="font-medium hover:underline">
                    W{w.weekNumber}/{w.year}
                  </Link>
                  <div className="text-[10px] text-neutral-500">
                    {new Date(w.startDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} →{" "}
                    {new Date(w.endDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                  </div>
                </td>
                <td className="py-2 px-2">{w.centralTheme || <span className="text-neutral-300">—</span>}</td>
                <td className="py-2 px-2">{zone}</td>
                <td className="py-2 px-2">{type}</td>
                <td className="py-2 px-2">
                  {w.leadMagnetName ? (
                    <>
                      <div>{w.leadMagnetName}</div>
                      {w.leadMagnetKeyword && <div className="text-[10px] text-neutral-500 font-mono">{w.leadMagnetKeyword}</div>}
                    </>
                  ) : (
                    <span className="text-neutral-300">—</span>
                  )}
                </td>
                <td className="text-center py-2 px-2 text-xs tabular-nums">{published}/{w.pieces.length}</td>
                <td className="py-2 px-2">
                  {statusMeta && (
                    <span className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[statusMeta.color]}`}>
                      {statusMeta.label}
                    </span>
                  )}
                </td>
                <td className="text-right py-2 px-2">
                  <Link href={`/fisio/contenido?week=${w.id}`} className="text-xs text-neutral-500 hover:text-neutral-900">
                    Ver →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
