"use client";

import { useState } from "react";
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
} from "@/lib/content-formats";

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

        <div className="flex gap-1">
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
  month,
  year,
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
        <button onClick={() => onSwitchMonth(-1)} className="text-sm px-3 py-1.5 border border-neutral-200 rounded hover:bg-neutral-50">
          ← {MONTH_NAMES[month === 1 ? 12 : month - 1]}
        </button>
        <h2 className="text-lg font-semibold">{MONTH_NAMES[month]} {year}</h2>
        <button onClick={() => onSwitchMonth(1)} className="text-sm px-3 py-1.5 border border-neutral-200 rounded hover:bg-neutral-50">
          {MONTH_NAMES[month === 12 ? 1 : month + 1]} →
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
                    className={`min-h-[120px] p-1.5 border-r border-neutral-100 last:border-r-0 cursor-pointer hover:bg-amber-50/30 transition-colors ${
                      isOtherMonth ? "bg-neutral-50/50" : "bg-white"
                    } ${isToday ? "bg-amber-50" : ""}`}
                    title="Click para añadir evento · Arrastra piezas aquí"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className={`text-[11px] ${isOtherMonth ? "text-neutral-300" : isToday ? "text-amber-800 font-bold" : "text-neutral-500"}`}>
                        {day.getUTCDate()}
                      </span>
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
                            }}
                            className="relative flex flex-col gap-0.5 text-[10px] px-1.5 py-1 rounded bg-neutral-100 hover:bg-neutral-200 leading-tight cursor-move overflow-hidden"
                            title={`${fmtLabel}${dp.piece.hook ? " · " + dp.piece.hook : ""}${dp.weekTheme ? " · " + dp.weekTheme : ""}`}
                          >
                            {statusIcon && (
                              <span className="absolute top-0.5 right-0.5 text-emerald-700 font-bold text-[11px] leading-none">
                                {statusIcon}
                              </span>
                            )}
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
        💡 Click en cualquier día para añadir un evento (masterclass, workshop, apertura de plazas…).
      </p>

      {eventModal && (
        <EventModal
          date={eventModal.date}
          event={eventModal.event}
          onClose={() => setEventModal(null)}
          onSaved={() => { setEventModal(null); router.refresh(); }}
        />
      )}
    </>
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
