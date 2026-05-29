"use client";

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
  color: "purple" | "blue" | "amber" | "emerald" | "rose" | "neutral" | "teal";
  href?: string;
  allDay?: boolean;
};

const COLOR_STYLES: Record<CalendarEventItem["color"], { bg: string; border: string; text: string; dot: string }> = {
  purple:  { bg: "#F3E8FF", border: "#C4B5FD", text: "#5B21B6", dot: "#8B5CF6" },
  blue:    { bg: "#DBEAFE", border: "#93C5FD", text: "#1E40AF", dot: "#2563EB" },
  amber:   { bg: "#FEF3C7", border: "#FCD34D", text: "#92400E", dot: "#F59E0B" },
  emerald: { bg: "#D1FAE5", border: "#6EE7B7", text: "#065F46", dot: "#10B981" },
  rose:    { bg: "#FFE4E6", border: "#FDA4AF", text: "#9F1239", dot: "#F43F5E" },
  neutral: { bg: "#F5F5F5", border: "#D4D4D4", text: "#404040", dot: "#737373" },
  teal:    { bg: "#CCFBF1", border: "#5EEAD4", text: "#115E59", dot: "#14B8A6" },
};

function ymd(d: Date): string {
  // YYYY-MM-DD en local
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function TeamCalendarView({
  events, weekStartISO, currentUserRole,
}: {
  events: CalendarEventItem[];
  weekStartISO: string;
  currentUserRole: string;
}) {
  const router = useRouter();
  const weekStart = new Date(weekStartISO);

  // Construir 7 columnas (Lun-Dom)
  const days: { date: Date; key: string; label: string; dayNum: number; isToday: boolean }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    days.push({
      date: d,
      key: ymd(d),
      label: WEEKDAYS[i],
      dayNum: d.getDate(),
      isToday: d.getTime() === today.getTime(),
    });
  }

  // Agrupar eventos por día (clave: YYYY-MM-DD del inicio del evento)
  const byDay = new Map<string, CalendarEventItem[]>();
  for (const ev of events) {
    if (ev.allDay) {
      // Asignar a cada día del rango [startISO, endISO)
      const start = new Date(ev.startISO);
      const end = new Date(ev.endISO);
      for (const d of days) {
        const dayStart = new Date(d.date);
        const dayEnd = new Date(d.date);
        dayEnd.setDate(dayEnd.getDate() + 1);
        if (start < dayEnd && end > dayStart) {
          const k = d.key;
          if (!byDay.has(k)) byDay.set(k, []);
          byDay.get(k)!.push(ev);
        }
      }
    } else {
      const k = ymd(new Date(ev.startISO));
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k)!.push(ev);
    }
  }
  // Ordenar dentro de cada día por hora
  for (const list of byDay.values()) {
    list.sort((a, b) => a.startISO.localeCompare(b.startISO));
  }

  function navigate(deltaDays: number) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + deltaDays);
    router.push(`/fisio/calendario?w=${ymd(d)}`);
  }
  function goToday() {
    const t = new Date();
    const dow = t.getDay() === 0 ? 7 : t.getDay();
    t.setDate(t.getDate() - (dow - 1));
    router.push(`/fisio/calendario?w=${ymd(t)}`);
  }

  // Etiqueta del rango "Lun 3 — Dom 9 jun 2026"
  const weekEndDate = new Date(weekStart);
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  const rangeLabel = `${weekStart.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} — ${weekEndDate.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}`;

  const totalEvents = events.length;
  const counts = {
    call: events.filter((e) => e.kind === "call").length,
    meeting: events.filter((e) => e.kind === "meeting").length,
    leave: events.filter((e) => e.kind === "leave").length,
    slot: events.filter((e) => e.kind === "slot").length,
  };

  return (
    <main>
      <header className="mb-4 flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Calendario</h1>
          <p className="text-xs text-neutral-500 mt-0.5">{rangeLabel}</p>
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

      {/* Leyenda + contadores */}
      <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
        {counts.call > 0 && <Legend color="purple" label={`Llamadas (${counts.call})`} />}
        {counts.meeting > 0 && <Legend color="blue" label={`Reuniones (${counts.meeting})`} />}
        {counts.leave > 0 && <Legend color="amber" label={`Vacaciones (${counts.leave})`} />}
        {counts.slot > 0 && <Legend color="teal" label={`Huecos libres (${counts.slot})`} />}
        {totalEvents === 0 && <span className="text-neutral-400 italic">Sin eventos esta semana.</span>}
      </div>

      {/* Grid semanal */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
        {days.map((d) => {
          const dayEvents = byDay.get(d.key) ?? [];
          return (
            <section
              key={d.key}
              className={`rounded-xl border ${d.isToday ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 bg-white"} p-2 min-h-[140px]`}
            >
              <header className="mb-2 pb-2 border-b border-neutral-100">
                <div className="flex items-baseline justify-between">
                  <span className={`text-[10px] uppercase tracking-wide font-medium ${d.isToday ? "text-neutral-900" : "text-neutral-500"}`}>
                    {d.label}
                  </span>
                  <span className={`text-lg font-semibold tabular-nums ${d.isToday ? "text-neutral-900" : "text-neutral-700"}`}>
                    {d.dayNum}
                  </span>
                </div>
              </header>
              {dayEvents.length === 0 ? (
                <p className="text-[11px] text-neutral-300 italic text-center mt-3">—</p>
              ) : (
                <div className="space-y-1.5">
                  {dayEvents.map((ev) => (
                    <EventCard key={ev.id + d.key} event={ev} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <p className="text-[11px] text-neutral-400 italic mt-4 text-center">
        Vista de solo lectura. Para mover una llamada o editar un evento, ve a su ficha desde el botón.
      </p>
    </main>
  );
}

function Legend({ color, label }: { color: CalendarEventItem["color"]; label: string }) {
  const c = COLOR_STYLES[color];
  return (
    <span className="inline-flex items-center gap-1.5 text-neutral-700">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.dot }} />
      {label}
    </span>
  );
}

function EventCard({ event }: { event: CalendarEventItem }) {
  const c = COLOR_STYLES[event.color];
  const inner = (
    <div
      className="rounded-md px-2 py-1.5 text-[11px] leading-tight"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      {!event.allDay && (
        <div className="font-semibold tabular-nums opacity-80">{hhmm(event.startISO)}</div>
      )}
      <div className="font-medium truncate">{event.title}</div>
      {event.subtitle && <div className="opacity-70 truncate">{event.subtitle}</div>}
    </div>
  );
  if (event.href) {
    return <Link href={event.href} className="block hover:opacity-90 transition-opacity">{inner}</Link>;
  }
  return inner;
}
