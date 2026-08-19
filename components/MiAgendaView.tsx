"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Settings2, Calendar, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";

// ============================================================================
// Tipos + helpers
// ============================================================================
type Slot = { id: string; dayOfWeek: number; startTime: string; endTime: string };
type OneOff = { id: string; date: string; startTime: string; endTime: string };
type Settings = { optimizationDurationMin: number; renewalDurationMin: number };
type SubTab = "template" | "week";

const DAYS = [1, 2, 3, 4, 5, 6, 7];                             // Lun-Dom
const DAY_SHORT = ["", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
const DAY_LONG = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weekStartMondayLocal(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (dow - 1));
  return d;
}

function addDaysLocal(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function formatWeekRange(weekStart: Date): string {
  const end = addDaysLocal(weekStart, 6);
  const s = weekStart.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  const e = end.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  return `${s} – ${e}`;
}

/** dayOfWeek 1-7 (Lun-Dom) para un Date en la timezone del navegador. */
function dowLocal(d: Date): number {
  return d.getDay() === 0 ? 7 : d.getDay();
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
export function MiAgendaView({
  googleConnected,
  initialSettings,
  initialAvailability,
  initialOneOffs,
}: {
  googleConnected: boolean;
  initialSettings: Settings;
  initialAvailability: Slot[];
  initialOneOffs?: OneOff[];
}) {
  const [slots, setSlots] = useState<Slot[]>(initialAvailability);
  const [oneOffs, setOneOffs] = useState<OneOff[]>(initialOneOffs ?? []);
  const [subTab, setSubTab] = useState<SubTab>("template");

  return (
    <div className="space-y-4">
      {/* Aviso Google no conectado */}
      {!googleConnected && (
        <div className="rounded-lg p-3 text-sm" style={{ background: "#FEF3C7", border: "1px solid #FCD34D", color: "#78350F" }}>
          <div className="font-medium mb-1">⚠️ Conecta tu Google primero</div>
          <p className="text-xs">
            La app necesita leer tu calendario personal para ofrecer solo huecos realmente libres.{" "}
            <Link href="/fisio/ajustes/integraciones" className="underline font-medium">Ir a Integraciones</Link>.
          </p>
        </div>
      )}

      {/* Duraciones (arriba, comunes a los dos modos) */}
      <DurationsSection initialSettings={initialSettings} />

      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-neutral-100 w-fit">
        <SubTabButton active={subTab === "template"} onClick={() => setSubTab("template")} icon={<Settings2 size={14} />}>
          Plantilla por defecto
        </SubTabButton>
        <SubTabButton active={subTab === "week"} onClick={() => setSubTab("week")} icon={<Calendar size={14} />}>
          Por semana
        </SubTabButton>
      </div>

      {subTab === "template" ? (
        <TemplateView slots={slots} setSlots={setSlots} />
      ) : (
        <WeekView slots={slots} oneOffs={oneOffs} setOneOffs={setOneOffs} />
      )}
    </div>
  );
}

function SubTabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
      style={{
        background: active ? "#FFFFFF" : "transparent",
        color: active ? "#0A0A0A" : "#525252",
        boxShadow: active ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
      }}
    >
      {icon}
      {children}
    </button>
  );
}

// ============================================================================
// Duración de llamadas (bloque superior)
// ============================================================================
function DurationsSection({ initialSettings }: { initialSettings: Settings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [opt, setOpt] = useState(String(initialSettings.optimizationDurationMin));
  const [ren, setRen] = useState(String(initialSettings.renewalDurationMin));
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);

  const dirty = Number(opt) !== settings.optimizationDurationMin || Number(ren) !== settings.renewalDurationMin;

  async function save() {
    setSaving(true);
    const r = await fetch("/api/my-call-agenda", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optimizationDurationMin: Number(opt), renewalDurationMin: Number(ren) }),
    });
    if (r.ok) {
      const d = await r.json();
      setSettings(d.settings);
      setFlash(true);
      setTimeout(() => setFlash(false), 2000);
    }
    setSaving(false);
  }

  return (
    <section className="card">
      <h2 className="font-medium text-sm mb-2">⏱ Duración de las llamadas</h2>
      <p className="text-xs text-neutral-500 mb-3">Cuánto dura cada tipo de llamada por defecto.</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-neutral-500 block mb-1">Optimización (min)</label>
          <input type="number" min={5} max={240} step={5} className="input text-sm w-full" value={opt} onChange={(e) => setOpt(e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] text-neutral-500 block mb-1">Renovación (min)</label>
          <input type="number" min={5} max={240} step={5} className="input text-sm w-full" value={ren} onChange={(e) => setRen(e.target.value)} />
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px]" style={{ color: flash ? "#065F46" : "#737373" }}>
          {flash ? "✓ Guardado" : dirty ? "Sin guardar" : ""}
        </span>
        <button onClick={save} disabled={saving || !dirty} className="text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-40" style={{ background: "#0A0A0A", color: "#FAFAFA" }}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </section>
  );
}

// ============================================================================
// VISTA: Plantilla por defecto
// ============================================================================
function TemplateView({ slots, setSlots }: { slots: Slot[]; setSlots: React.Dispatch<React.SetStateAction<Slot[]>> }) {
  const byDay = useMemo(() => {
    const m = new Map<number, Slot[]>();
    for (const s of slots) {
      if (!m.has(s.dayOfWeek)) m.set(s.dayOfWeek, []);
      m.get(s.dayOfWeek)!.push(s);
    }
    for (const [, arr] of m) arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return m;
  }, [slots]);

  async function add(dow: number, startTime: string, endTime: string) {
    const r = await fetch("/api/my-call-agenda/slot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dayOfWeek: dow, startTime, endTime }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error ?? "Error");
    setSlots((prev) => [...prev, d.slot].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime)));
  }

  async function remove(id: string) {
    const r = await fetch(`/api/my-call-agenda/slot?id=${id}`, { method: "DELETE" });
    if (r.ok) setSlots((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div>
      <div className="rounded-lg p-3 text-xs mb-3" style={{ background: "#EFF6FF", color: "#1E3A8A", border: "1px solid #BFDBFE" }}>
        <b>Plantilla por defecto.</b> Este horario se aplica a TODAS las semanas que no estén personalizadas.
      </div>

      <DayColumns
        days={DAYS}
        columnLabel={(d) => ({ short: DAY_SHORT[d], long: DAY_LONG[d] })}
        columnItems={(d) => (byDay.get(d) ?? []).map((s) => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
          onDelete: () => remove(s.id),
          chip: { bg: "#DBEAFE", border: "#60A5FA", text: "#1E3A8A", dot: "#3B82F6" },
        }))}
        onAdd={async (d, start, end) => add(d, start, end)}
      />
    </div>
  );
}

// ============================================================================
// VISTA: Por semana (plantilla + one-offs de la semana visible)
// ============================================================================
function WeekView({ slots, oneOffs, setOneOffs }: { slots: Slot[]; oneOffs: OneOff[]; setOneOffs: React.Dispatch<React.SetStateAction<OneOff[]>> }) {
  const [weekStart, setWeekStart] = useState<Date>(weekStartMondayLocal(new Date()));

  const isCurrentWeek = weekStart.getTime() === weekStartMondayLocal(new Date()).getTime();

  const weekDates = useMemo(() => DAYS.map((_, i) => addDaysLocal(weekStart, i)), [weekStart]);
  const weekOneOffs = useMemo(() => {
    const dateKeys = new Set(weekDates.map(isoDate));
    return oneOffs.filter((o) => dateKeys.has(o.date));
  }, [weekDates, oneOffs]);

  async function addOneOff(date: string, startTime: string, endTime: string) {
    const r = await fetch("/api/my-call-agenda/one-off", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, startTime, endTime }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error ?? "Error");
    setOneOffs((prev) => [...prev, { id: d.oneOff.id, date, startTime, endTime }]);
  }

  async function removeOneOff(id: string) {
    const r = await fetch(`/api/my-call-agenda/one-off?id=${id}`, { method: "DELETE" });
    if (r.ok) setOneOffs((prev) => prev.filter((o) => o.id !== id));
  }

  return (
    <div>
      <div className="rounded-lg p-3 text-xs mb-3" style={{ background: "#FEFCE8", color: "#78350F", border: "1px solid #FDE68A" }}>
        <b>Por semana.</b> Añade franjas puntuales solo para esta semana sin tocar la plantilla. Las de la plantilla se muestran en gris (no editables aquí). Para <b>bloquear</b> una franja, pon un evento en tu Google Calendar y la app la esconderá sola.
      </div>

      {/* Navegador de semana */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setWeekStart(addDaysLocal(weekStart, -7))} className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-600" title="Semana anterior">
          <ChevronLeft size={16} />
        </button>
        <div className="text-sm font-medium px-2 flex-1 text-center capitalize">{formatWeekRange(weekStart)}</div>
        <button onClick={() => setWeekStart(addDaysLocal(weekStart, 7))} className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-600" title="Semana siguiente">
          <ChevronRight size={16} />
        </button>
        {!isCurrentWeek && (
          <button onClick={() => setWeekStart(weekStartMondayLocal(new Date()))} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50">
            Esta semana
          </button>
        )}
      </div>

      <DayColumns
        days={DAYS}
        columnLabel={(idx) => {
          const date = weekDates[idx - 1];
          return {
            short: DAY_SHORT[idx],
            long: DAY_LONG[idx],
            sub: date.toLocaleDateString("es-ES", { day: "numeric", month: "short" }),
          };
        }}
        columnItems={(idx) => {
          const date = weekDates[idx - 1];
          const dateKey = isoDate(date);
          const dow = dowLocal(date);
          const templateItems = slots
            .filter((s) => s.dayOfWeek === dow)
            .map((s) => ({
              id: `tpl-${s.id}`,
              startTime: s.startTime,
              endTime: s.endTime,
              onDelete: null,   // no editable desde aquí
              chip: { bg: "#F5F5F5", border: "#D4D4D4", text: "#525252", dot: "#A3A3A3" },
              label: "plantilla",
            }));
          const oneOffItems = weekOneOffs
            .filter((o) => o.date === dateKey)
            .map((o) => ({
              id: o.id,
              startTime: o.startTime,
              endTime: o.endTime,
              onDelete: () => removeOneOff(o.id),
              chip: { bg: "#DCFCE7", border: "#86EFAC", text: "#065F46", dot: "#22C55E" },
              label: "puntual",
            }));
          return [...templateItems, ...oneOffItems].sort((a, b) => a.startTime.localeCompare(b.startTime));
        }}
        onAdd={async (idx, start, end) => {
          const date = isoDate(weekDates[idx - 1]);
          await addOneOff(date, start, end);
        }}
        addButtonLabel="+ Añadir puntual"
      />
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTE: columnas de días (reusable entre las dos vistas)
// ============================================================================
type ColItem = {
  id: string;
  startTime: string;
  endTime: string;
  onDelete: (() => void) | null;
  chip: { bg: string; border: string; text: string; dot: string };
  label?: string;
};

function DayColumns({
  days,
  columnLabel,
  columnItems,
  onAdd,
  addButtonLabel = "+ Añadir",
}: {
  days: number[];
  columnLabel: (idx: number) => { short: string; long: string; sub?: string };
  columnItems: (idx: number) => ColItem[];
  onAdd: (idx: number, startTime: string, endTime: string) => Promise<void>;
  addButtonLabel?: string;
}) {
  const [addingFor, setAddingFor] = useState<number | null>(null);
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("13:00");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(idx: number) {
    setErr(null);
    if (newStart >= newEnd) {
      setErr("Hora fin > inicio");
      return;
    }
    setBusy(true);
    try {
      await onAdd(idx, newStart, newEnd);
      setAddingFor(null);
    } catch (e: any) {
      setErr(e?.message ?? "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(120px, 1fr))` }}>
      {days.map((d) => {
        const label = columnLabel(d);
        const items = columnItems(d);
        return (
          <div key={d} className="rounded-xl border border-neutral-200 bg-white p-2 flex flex-col min-h-[180px]">
            <div className="text-center mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{label.short}</div>
              <div className="text-sm font-medium text-neutral-800">{label.long}</div>
              {label.sub && <div className="text-[10px] text-neutral-400">{label.sub}</div>}
            </div>

            <div className="flex-1 space-y-1.5">
              {items.map((it) => (
                <div
                  key={it.id}
                  className="rounded-md px-2 py-1.5 text-xs flex items-center justify-between gap-1"
                  style={{ background: it.chip.bg, border: `1px solid ${it.chip.border}`, color: it.chip.text }}
                >
                  <span className="tabular-nums font-medium">{it.startTime} → {it.endTime}</span>
                  {it.onDelete ? (
                    <button onClick={it.onDelete} className="opacity-60 hover:opacity-100" title="Eliminar">
                      <X size={12} />
                    </button>
                  ) : (
                    <span className="text-[9px] uppercase opacity-60">{it.label}</span>
                  )}
                </div>
              ))}
            </div>

            {addingFor === d ? (
              <div className="mt-2 rounded-md p-2 space-y-1" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
                <div className="grid grid-cols-2 gap-1">
                  <input type="time" className="text-xs px-1 py-0.5 rounded border border-neutral-300" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
                  <input type="time" className="text-xs px-1 py-0.5 rounded border border-neutral-300" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
                </div>
                {err && <div className="text-[10px] text-red-600">{err}</div>}
                <div className="flex gap-1 justify-end">
                  <button onClick={() => setAddingFor(null)} className="text-[10px] px-2 py-0.5 rounded bg-neutral-100 hover:bg-neutral-200">Cancelar</button>
                  <button onClick={() => submit(d)} disabled={busy} className="text-[10px] px-2 py-0.5 rounded text-white disabled:opacity-40" style={{ background: "#0A0A0A" }}>
                    {busy ? "…" : "OK"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setAddingFor(d); setErr(null); }}
                className="mt-2 flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50 border border-dashed border-neutral-300"
              >
                <Plus size={12} />
                {addButtonLabel}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
