"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Slot = { id: string; dayOfWeek: number; startTime: string; endTime: string };
type OneOff = { id: string; date: string; startTime: string; endTime: string };
type Settings = { optimizationDurationMin: number; renewalDurationMin: number };

const DAY_LABELS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function formatOneOffDate(dateStr: string): string {
  // dateStr = "YYYY-MM-DD"
  const [y, m, d] = dateStr.split("-").map(Number);
  // Interpretar como fecha civil (evitar deriva por timezone)
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
}

function todayInputValue(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [slots, setSlots] = useState<Slot[]>(initialAvailability);
  const [oneOffs, setOneOffs] = useState<OneOff[]>(initialOneOffs ?? []);

  const [optDuration, setOptDuration] = useState(String(initialSettings.optimizationDurationMin));
  const [renDuration, setRenDuration] = useState(String(initialSettings.renewalDurationMin));
  const [savingDur, setSavingDur] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Form para añadir slot
  const [newDay, setNewDay] = useState(1);
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("13:00");
  const [addingSlot, setAddingSlot] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);

  // Form para añadir one-off puntual
  const [ooDate, setOoDate] = useState(todayInputValue());
  const [ooStart, setOoStart] = useState("16:00");
  const [ooEnd, setOoEnd] = useState("19:00");
  const [addingOo, setAddingOo] = useState(false);
  const [ooError, setOoError] = useState<string | null>(null);

  async function saveDurations() {
    setSavingDur(true);
    const opt = Number(optDuration);
    const ren = Number(renDuration);
    const r = await fetch("/api/my-call-agenda", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        optimizationDurationMin: opt,
        renewalDurationMin: ren,
      }),
    });
    if (r.ok) {
      const d = await r.json();
      setSettings({
        optimizationDurationMin: d.settings.optimizationDurationMin,
        renewalDurationMin: d.settings.renewalDurationMin,
      });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    }
    setSavingDur(false);
  }

  async function addSlot() {
    setSlotError(null);
    setAddingSlot(true);
    const r = await fetch("/api/my-call-agenda/slot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dayOfWeek: newDay, startTime: newStart, endTime: newEnd }),
    });
    const d = await r.json();
    if (!r.ok) {
      setSlotError(d?.error ?? "Error al añadir");
      setAddingSlot(false);
      return;
    }
    setSlots((prev) => [...prev, d.slot].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime)));
    setAddingSlot(false);
  }

  async function removeSlot(id: string) {
    if (!confirm("¿Eliminar esta franja horaria?")) return;
    const r = await fetch(`/api/my-call-agenda/slot?id=${id}`, { method: "DELETE" });
    if (r.ok) setSlots((prev) => prev.filter((s) => s.id !== id));
  }

  async function addOneOff() {
    setOoError(null);
    setAddingOo(true);
    const r = await fetch("/api/my-call-agenda/one-off", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: ooDate, startTime: ooStart, endTime: ooEnd }),
    });
    const d = await r.json();
    if (!r.ok) {
      setOoError(d?.error ?? "Error al añadir");
      setAddingOo(false);
      return;
    }
    setOneOffs((prev) => [
      ...prev,
      { id: d.oneOff.id, date: ooDate, startTime: ooStart, endTime: ooEnd },
    ].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)));
    setAddingOo(false);
  }

  async function removeOneOff(id: string) {
    if (!confirm("¿Eliminar esta franja puntual?")) return;
    const r = await fetch(`/api/my-call-agenda/one-off?id=${id}`, { method: "DELETE" });
    if (r.ok) setOneOffs((prev) => prev.filter((o) => o.id !== id));
  }

  const durationsDirty = Number(optDuration) !== settings.optimizationDurationMin || Number(renDuration) !== settings.renewalDurationMin;

  const slotsByDay = new Map<number, Slot[]>();
  for (const s of slots) {
    const arr = slotsByDay.get(s.dayOfWeek) ?? [];
    arr.push(s);
    slotsByDay.set(s.dayOfWeek, arr);
  }

  return (
    <div className="space-y-3">
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

      {/* Duraciones */}
      <section className="card">
        <h2 className="font-medium text-sm mb-2">⏱ Duración de las llamadas</h2>
        <p className="text-xs text-neutral-500 mb-3">Cuánto dura cada tipo de llamada por defecto. Puedes ajustar por llamada al agendarla.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-neutral-500 block mb-1">Optimización (min)</label>
            <input type="number" min={5} max={240} step={5} className="input text-sm w-full" value={optDuration} onChange={(e) => setOptDuration(e.target.value)} />
          </div>
          <div>
            <label className="text-[11px] text-neutral-500 block mb-1">Renovación (min)</label>
            <input type="number" min={5} max={240} step={5} className="input text-sm w-full" value={renDuration} onChange={(e) => setRenDuration(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px]" style={{ color: savedFlash ? "#065F46" : "#737373" }}>
            {savedFlash ? "✓ Guardado" : durationsDirty ? "Sin guardar" : ""}
          </span>
          <button
            onClick={saveDurations}
            disabled={savingDur || !durationsDirty}
            className="text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-40"
            style={{ background: "#0A0A0A", color: "#FAFAFA" }}
          >
            {savingDur ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </section>

      {/* Franjas horarias */}
      <section className="card">
        <h2 className="font-medium text-sm mb-1">🗓 Tus franjas disponibles</h2>
        <p className="text-xs text-neutral-500 mb-3">
          Ventanas donde estás abierto a llamadas. La app resta lo que tengas ocupado en Google Calendar
          antes de ofrecer los slots al paciente.
        </p>

        {/* Lista */}
        {slots.length === 0 ? (
          <div className="rounded-lg p-3 text-xs text-neutral-500 italic mb-3" style={{ background: "#FAFAFA", border: "1px dashed #D4D4D4" }}>
            Aún no has definido franjas. Añade abajo tus horas de trabajo (ej. L-V 09:00-13:00 y 15:30-18:00).
          </div>
        ) : (
          <div className="space-y-2 mb-3">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => {
              const daySlots = slotsByDay.get(d) ?? [];
              if (daySlots.length === 0) return null;
              return (
                <div key={d} className="flex items-start gap-3">
                  <span className="text-xs font-medium w-24 shrink-0 pt-1">{DAY_LABELS[d]}</span>
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {daySlots.map((s) => (
                      <div key={s.id} className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs" style={{ background: "#EEF2FF", border: "1px solid #C7D2FE", color: "#3730A3" }}>
                        <span className="tabular-nums font-medium">{s.startTime}–{s.endTime}</span>
                        <button onClick={() => removeSlot(s.id)} className="text-neutral-400 hover:text-red-600" title="Eliminar">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Añadir slot */}
        <div className="rounded-lg p-3" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
          <div className="text-xs font-medium mb-2">Añadir franja</div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Día</label>
              <select className="input text-sm w-full" value={newDay} onChange={(e) => setNewDay(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>{DAY_LABELS[d]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Desde</label>
              <input type="time" className="input text-sm" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Hasta</label>
              <input type="time" className="input text-sm" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
            </div>
          </div>
          {slotError && <div className="text-[11px] text-red-600 mt-1.5">{slotError}</div>}
          <div className="flex justify-end mt-2">
            <button
              onClick={addSlot}
              disabled={addingSlot}
              className="text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-40"
              style={{ background: "#0A0A0A", color: "#FAFAFA" }}
            >
              {addingSlot ? "Añadiendo…" : "+ Añadir"}
            </button>
          </div>
        </div>
      </section>

      {/* Franjas puntuales (one-off) — para "esta semana también abro X" */}
      <section className="card">
        <h2 className="font-medium text-sm mb-1">🗓 Franjas puntuales</h2>
        <p className="text-xs text-neutral-500 mb-3">
          Amplía tu disponibilidad para un día concreto sin tocar la plantilla.
          Para <b>bloquear</b> una franja habitual, mete un evento en tu Google Calendar
          y la app la esconderá sola.
        </p>

        {oneOffs.length === 0 ? (
          <div className="rounded-lg p-3 text-xs text-neutral-500 italic mb-3" style={{ background: "#FAFAFA", border: "1px dashed #D4D4D4" }}>
            No tienes franjas puntuales próximas.
          </div>
        ) : (
          <div className="space-y-1.5 mb-3">
            {oneOffs.map((o) => (
              <div key={o.id} className="flex items-center gap-3 text-xs">
                <span className="capitalize font-medium w-40 shrink-0">{formatOneOffDate(o.date)}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1" style={{ background: "#DCFCE7", border: "1px solid #86EFAC", color: "#065F46" }}>
                  <span className="tabular-nums font-medium">{o.startTime}–{o.endTime}</span>
                  <button onClick={() => removeOneOff(o.id)} className="text-neutral-400 hover:text-red-600" title="Eliminar">✕</button>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg p-3" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
          <div className="text-xs font-medium mb-2">Añadir franja puntual</div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Fecha</label>
              <input type="date" className="input text-sm w-full" value={ooDate} onChange={(e) => setOoDate(e.target.value)} min={todayInputValue()} />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Desde</label>
              <input type="time" className="input text-sm" value={ooStart} onChange={(e) => setOoStart(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-neutral-500 block mb-0.5">Hasta</label>
              <input type="time" className="input text-sm" value={ooEnd} onChange={(e) => setOoEnd(e.target.value)} />
            </div>
          </div>
          {ooError && <div className="text-[11px] text-red-600 mt-1.5">{ooError}</div>}
          <div className="flex justify-end mt-2">
            <button
              onClick={addOneOff}
              disabled={addingOo}
              className="text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-40"
              style={{ background: "#0A0A0A", color: "#FAFAFA" }}
            >
              {addingOo ? "Añadiendo…" : "+ Añadir"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
