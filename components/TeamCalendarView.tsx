"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type CalendarEventItem = {
  id: string;
  kind: "call" | "meeting" | "leave" | "slot";
  title: string;
  subtitle?: string;
  startISO: string;
  endISO: string;
  ownerId: string | null;       // profesional al que "pertenece" (closer en calls, pro en leaves)
  href?: string;
  allDay?: boolean;
};

export type ProUI = { id: string; fullName: string; role: string };

// ── Paleta determinista por profesional ──────────────────────────────────────
const PALETTE = [
  { bg: "#DBEAFE", border: "#60A5FA", text: "#1E3A8A", dot: "#2563EB" }, // azul
  { bg: "#F3E8FF", border: "#C084FC", text: "#5B21B6", dot: "#8B5CF6" }, // morado
  { bg: "#DCFCE7", border: "#4ADE80", text: "#065F46", dot: "#10B981" }, // verde
  { bg: "#FEE2E2", border: "#F87171", text: "#991B1B", dot: "#EF4444" }, // rojo
  { bg: "#FEF3C7", border: "#FACC15", text: "#854D0E", dot: "#F59E0B" }, // ámbar
  { bg: "#CFFAFE", border: "#22D3EE", text: "#155E75", dot: "#06B6D4" }, // cian
  { bg: "#FCE7F3", border: "#F472B6", text: "#9D174D", dot: "#EC4899" }, // rosa
  { bg: "#E0E7FF", border: "#818CF8", text: "#3730A3", dot: "#6366F1" }, // índigo
];
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function colorForOwner(ownerId: string | null): typeof PALETTE[number] {
  if (!ownerId) return { bg: "#F5F5F5", border: "#D4D4D4", text: "#404040", dot: "#737373" };
  return PALETTE[hashCode(ownerId) % PALETTE.length];
}
function colorForKind(kind: CalendarEventItem["kind"]): typeof PALETTE[number] {
  if (kind === "meeting") return { bg: "#E0E7FF", border: "#A5B4FC", text: "#3730A3", dot: "#6366F1" };
  if (kind === "slot")    return { bg: "#CCFBF1", border: "#5EEAD4", text: "#115E59", dot: "#14B8A6" };
  if (kind === "leave")   return { bg: "#FEF3C7", border: "#FCD34D", text: "#92400E", dot: "#F59E0B" };
  return { bg: "#F5F5F5", border: "#D4D4D4", text: "#404040", dot: "#737373" };
}

// ── Helpers de tiempo en Madrid ──────────────────────────────────────────────
const TZ = "Europe/Madrid";
function madridYMD(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ });
}
function madridMinutes(iso: string): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date(iso));
  let h = 0, m = 0;
  for (const p of parts) {
    if (p.type === "hour") h = parseInt(p.value);
    if (p.type === "minute") m = parseInt(p.value);
  }
  return h * 60 + m;
}
function madridHHMM(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-ES", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

// ── Grid config ──────────────────────────────────────────────────────────────
const START_HOUR = 7;
const END_HOUR = 22;
const HOUR_HEIGHT = 28;         // px por hora
const TOTAL_HOURS = END_HOUR - START_HOUR; // 15
const TOTAL_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;
const START_MIN = START_HOUR * 60;
const END_MIN = END_HOUR * 60;

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie"];
const VISIBLE_DAYS = 5; // L-V (sin sábado ni domingo)

// ── Asignación de carriles para eventos solapados en el mismo día ────────────
function assignLanes(events: { startMin: number; endMin: number; id: string }[]) {
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const lanes: { endMin: number }[] = [];
  const eventLane = new Map<string, number>();
  for (const ev of sorted) {
    let assigned = -1;
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i].endMin <= ev.startMin) { assigned = i; break; }
    }
    if (assigned === -1) {
      lanes.push({ endMin: ev.endMin });
      assigned = lanes.length - 1;
    } else {
      lanes[assigned].endMin = ev.endMin;
    }
    eventLane.set(ev.id, assigned);
  }
  return { eventLane, laneCount: Math.max(1, lanes.length) };
}

export function TeamCalendarView({
  events, weekStartISO, pros, currentUserId, showFilterSidebar, canSeeSlots,
}: {
  events: CalendarEventItem[];
  weekStartISO: string;
  pros: ProUI[];
  currentUserId: string;
  showFilterSidebar: boolean;
  canSeeSlots: boolean;
}) {
  const router = useRouter();

  // ── Filtros (sidebar) ───────────────────────────────────────────────────
  const proIds = pros.map((p) => p.id);
  const [visiblePros, setVisiblePros] = useState<Set<string>>(new Set(proIds));
  const [showMeetings, setShowMeetings] = useState(true);
  const [showLeaves, setShowLeaves] = useState(true);
  const [showSlots, setShowSlots] = useState(true);

  function toggleProf(id: string) {
    setVisiblePros((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  // ── Generar columnas (días) en clave Madrid ─────────────────────────────
  const days = useMemo(() => {
    const out: { key: string; date: Date; weekdayIdx: number; dayNum: number; isToday: boolean }[] = [];
    const todayKey = madridYMD(new Date().toISOString());
    const ws = new Date(weekStartISO);
    for (let i = 0; i < VISIBLE_DAYS; i++) {
      const d = new Date(ws);
      d.setUTCDate(d.getUTCDate() + i);
      // Para sacar el "día Madrid" tomamos las 12:00 UTC de ese día (cae siempre en el día Madrid esperado)
      const ref = new Date(d);
      ref.setUTCHours(12, 0, 0, 0);
      const key = madridYMD(ref.toISOString());
      const dayNum = Number(key.split("-")[2]);
      out.push({ key, date: ref, weekdayIdx: i, dayNum, isToday: key === todayKey });
    }
    return out;
  }, [weekStartISO]);

  // ── Filtrar y separar eventos ───────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (ev.kind === "meeting" && !showMeetings) return false;
      if (ev.kind === "leave" && !showLeaves) return false;
      if (ev.kind === "slot" && (!canSeeSlots || !showSlots)) return false;
      // Si el evento tiene owner, respetar visiblePros
      if (ev.ownerId && !visiblePros.has(ev.ownerId)) return false;
      return true;
    });
  }, [events, showMeetings, showLeaves, showSlots, canSeeSlots, visiblePros]);

  // Eventos timed (no allDay) por día
  const timedByDay = useMemo(() => {
    const map = new Map<string, CalendarEventItem[]>();
    for (const ev of filteredEvents) {
      if (ev.allDay) continue;
      const key = madridYMD(ev.startISO);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return map;
  }, [filteredEvents]);

  // Eventos allDay (vacaciones) por día — los pintamos en una fila arriba
  const allDayByDay = useMemo(() => {
    const map = new Map<string, CalendarEventItem[]>();
    for (const ev of filteredEvents) {
      if (!ev.allDay) continue;
      const start = new Date(ev.startISO);
      const end = new Date(ev.endISO);
      for (const d of days) {
        const dayStart = new Date(d.date); dayStart.setUTCHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart); dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
        if (start < dayEnd && end > dayStart) {
          if (!map.has(d.key)) map.set(d.key, []);
          map.get(d.key)!.push(ev);
        }
      }
    }
    return map;
  }, [filteredEvents, days]);

  // ── Navegación entre semanas ────────────────────────────────────────────
  function navigate(deltaDays: number) {
    const d = new Date(weekStartISO);
    d.setUTCDate(d.getUTCDate() + deltaDays);
    const ymd = d.toISOString().slice(0, 10);
    router.push(`/fisio/calendario?w=${ymd}`);
  }
  function goToday() {
    const today = new Date();
    const dow = today.getDay() === 0 ? 7 : today.getDay();
    today.setDate(today.getDate() - (dow - 1));
    router.push(`/fisio/calendario?w=${today.toISOString().slice(0, 10)}`);
  }

  // Etiqueta del rango
  const ws = new Date(weekStartISO);
  const we = new Date(ws); we.setUTCDate(we.getUTCDate() + (VISIBLE_DAYS - 1));
  const rangeLabel = `${ws.toLocaleDateString("es-ES", { timeZone: TZ, day: "numeric", month: "short" })} — ${we.toLocaleDateString("es-ES", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" })}`;

  const hours = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => START_HOUR + i);

  return (
    <main className="flex flex-col">
      <header className="mb-3 flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Calendario</h1>
          <p className="text-xs text-neutral-500 mt-0.5 capitalize">{rangeLabel} · horas en Madrid</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => navigate(-7)} title="Semana anterior" className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-600">
            <ChevronLeft size={16} />
          </button>
          <button onClick={goToday} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50">
            Hoy
          </button>
          <button onClick={() => navigate(7)} title="Semana siguiente" className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-600">
            <ChevronRight size={16} />
          </button>
        </div>
      </header>

      <div className="flex gap-3 items-start">
        {/* Sidebar de filtros (solo managers/setter) */}
        {showFilterSidebar && (
          <aside className="hidden lg:block w-40 flex-shrink-0">
            <div className="card sticky top-2 p-3">
              <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium mb-2">Mis calendarios</div>
              <div className="space-y-1.5 mb-3">
                {pros.map((p) => {
                  const c = colorForOwner(p.id);
                  const checked = visiblePros.has(p.id);
                  return (
                    <label key={p.id} className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProf(p.id)}
                        className="w-3.5 h-3.5"
                        style={{ accentColor: c.dot }}
                      />
                      <span className="truncate">{p.fullName.split(" ")[0]}{p.id === currentUserId && <span className="text-neutral-400"> (tú)</span>}</span>
                    </label>
                  );
                })}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium mb-2 pt-2 border-t border-neutral-100">Categorías</div>
              <div className="space-y-1.5">
                <CategoryChk label="Reuniones internas" color={colorForKind("meeting").dot} checked={showMeetings} onToggle={() => setShowMeetings((v) => !v)} />
                <CategoryChk label="Vacaciones" color={colorForKind("leave").dot} checked={showLeaves} onToggle={() => setShowLeaves((v) => !v)} />
                {canSeeSlots && (
                  <CategoryChk label="Huecos libres" color={colorForKind("slot").dot} checked={showSlots} onToggle={() => setShowSlots((v) => !v)} />
                )}
              </div>
            </div>
          </aside>
        )}

        {/* Grid del calendario */}
        <section className="flex-1 min-w-0 overflow-x-auto">
          <div className="rounded-xl border border-neutral-200 bg-white">
            {/* Cabecera de días */}
            <div className="grid sticky top-0 bg-white z-10 border-b border-neutral-200" style={{ gridTemplateColumns: `56px repeat(${VISIBLE_DAYS}, minmax(110px, 1fr))` }}>
              <div className="px-2 py-2 text-[10px] text-neutral-400 uppercase">GMT+1/2</div>
              {days.map((d) => (
                <div key={d.key} className={`px-2 py-2 text-center ${d.isToday ? "bg-neutral-50" : ""}`}>
                  <div className="text-[10px] uppercase tracking-wide text-neutral-500">{WEEKDAYS[d.weekdayIdx]}</div>
                  <div className={`text-xl font-semibold tabular-nums ${d.isToday ? "text-neutral-900" : "text-neutral-700"}`}>{d.dayNum}</div>
                </div>
              ))}
            </div>

            {/* Fila "todo el día" para vacaciones */}
            {[...allDayByDay.entries()].some(([, list]) => list.length > 0) && (
              <div className="grid border-b border-neutral-200" style={{ gridTemplateColumns: `56px repeat(${VISIBLE_DAYS}, minmax(110px, 1fr))` }}>
                <div className="px-2 py-1.5 text-[10px] text-neutral-400">Todo el día</div>
                {days.map((d) => {
                  const list = allDayByDay.get(d.key) ?? [];
                  return (
                    <div key={d.key} className={`px-1 py-1 space-y-0.5 ${d.isToday ? "bg-neutral-50" : ""}`} style={{ minHeight: 24 }}>
                      {list.map((ev) => {
                        const c = ev.ownerId ? colorForOwner(ev.ownerId) : colorForKind(ev.kind);
                        return (
                          <div key={ev.id + d.key} className="rounded px-1.5 py-0.5 text-[10px] leading-tight truncate" style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
                            {ev.title}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Grid de horas */}
            <div className="grid relative" style={{ gridTemplateColumns: `56px repeat(${VISIBLE_DAYS}, minmax(110px, 1fr))` }}>
              {/* Columna de horas */}
              <div className="relative" style={{ height: TOTAL_HEIGHT }}>
                {hours.map((h) => (
                  <div key={h} className="absolute right-1 text-[10px] text-neutral-400 tabular-nums" style={{ top: (h - START_HOUR) * HOUR_HEIGHT - 6 }}>
                    {String(h).padStart(2, "0")}:00
                  </div>
                ))}
              </div>
              {/* Columnas de días */}
              {days.map((d) => {
                const evs = (timedByDay.get(d.key) ?? []).filter((ev) => {
                  const start = madridMinutes(ev.startISO);
                  const end = madridMinutes(ev.endISO);
                  return end > START_MIN && start < END_MIN;
                });
                const mapped = evs.map((ev) => ({
                  id: ev.id,
                  startMin: Math.max(madridMinutes(ev.startISO), START_MIN),
                  endMin: Math.min(madridMinutes(ev.endISO), END_MIN),
                }));
                const { eventLane, laneCount } = assignLanes(mapped);
                return (
                  <div key={d.key} className={`relative border-l border-neutral-100 ${d.isToday ? "bg-neutral-50/60" : ""}`} style={{ height: TOTAL_HEIGHT }}>
                    {/* Líneas horarias */}
                    {hours.map((h) => (
                      <div key={h} className="absolute left-0 right-0 border-t border-neutral-100" style={{ top: (h - START_HOUR) * HOUR_HEIGHT }} />
                    ))}
                    {/* Eventos */}
                    {evs.map((ev) => {
                      const startMin = Math.max(madridMinutes(ev.startISO), START_MIN);
                      const endMin = Math.min(madridMinutes(ev.endISO), END_MIN);
                      const top = ((startMin - START_MIN) / 60) * HOUR_HEIGHT;
                      const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 22);
                      const lane = eventLane.get(ev.id) ?? 0;
                      const widthPct = 100 / laneCount;
                      const leftPct = lane * widthPct;
                      const c = ev.ownerId ? colorForOwner(ev.ownerId) : colorForKind(ev.kind);
                      const inner = (
                        <div
                          className="absolute rounded-md px-1.5 py-1 text-[10px] leading-tight overflow-hidden shadow-sm"
                          style={{
                            top, height: height - 2, left: `calc(${leftPct}% + 2px)`, width: `calc(${widthPct}% - 4px)`,
                            background: c.bg, border: `1px solid ${c.border}`, color: c.text,
                          }}
                        >
                          <div className="font-semibold truncate">{ev.title}</div>
                          <div className="opacity-80 tabular-nums">{madridHHMM(ev.startISO)} – {madridHHMM(ev.endISO)}</div>
                          {ev.subtitle && height > 50 && <div className="opacity-70 truncate">{ev.subtitle}</div>}
                        </div>
                      );
                      return ev.href ? (
                        <Link key={ev.id} href={ev.href} className="hover:opacity-90 transition-opacity">{inner}</Link>
                      ) : (
                        <div key={ev.id}>{inner}</div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <p className="text-[11px] text-neutral-400 italic mt-3 text-center">
        Vista de solo lectura. Para mover una llamada o editar un evento, abre su ficha.
      </p>
    </main>
  );
}

function CategoryChk({ label, color, checked, onToggle }: { label: string; color: string; checked: boolean; onToggle: () => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-xs">
      <input type="checkbox" checked={checked} onChange={onToggle} className="w-3.5 h-3.5" style={{ accentColor: color }} />
      <span>{label}</span>
    </label>
  );
}
