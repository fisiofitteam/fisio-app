"use client";

/**
 * Programador IA del calendario del paciente. Un solo modal con 3 modos:
 *   - Sesión suelta: 1 fecha + IA → 1 sesión al calendario.
 *   - Semana: 1 lunes + IA + día descanso → 4 sesiones L-V (menos descanso).
 *   - Mesociclo: 1 lunes + IA + día descanso → 16 sesiones IA + 4 descanso activo fijo.
 *
 * En todos los casos usamos /api/ai/generate-session para generar cada sesión
 * (con contexto acumulado en el mesociclo para variedad) y luego POST /api/sessions
 * para agendarla en el calendario del paciente.
 */
import { useState } from "react";
import { durationForKind } from "@/components/AiGenerateSessionModal";

type Mode = "session" | "week" | "mesocycle";
type WorkDay = 1 | 2 | 3 | 4 | 5;
type Block = { heading: string; body: string; exercises: string[] };
type Session = { title: string; description: string | null; blocks: Block[] };

const DAY_LABELS: Record<WorkDay, string> = {
  1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes",
};
const ALL_WEEKDAYS: WorkDay[] = [1, 2, 3, 4, 5];
const WEEK_ROLE: Record<1|2|3|4, string> = {
  1: "Introducción", 2: "Progresión", 3: "Pico", 4: "Descarga",
};
const REST_ACTIVE_TEMPLATE: Session = {
  title: "Descanso activo",
  description: "Recuperación entre sesiones — mantén el cuerpo despierto sin fatigar.",
  blocks: [
    { heading: "Aeróbico suave · 25-35 min", body: "Trote muy suave, bici easy o remo continuo a RPE 5-6. Deberías poder hablar con frases completas.", exercises: [] },
    { heading: "Movilidad global · 10-15 min", body: "Cat-camel x8 · 90/90 hip cada lado 5 respiraciones · Pigeon stretch cada lado 60s · Wall slide banded x10 · Puente glúteo x15.", exercises: [] },
  ],
};

function sessionToTasksSnapshot(s: Session): any[] {
  return s.blocks.map((b, i) => {
    const header: string[] = [];
    if (i === 0 && s.title) header.push(`_${s.title}_`);
    if (i === 0 && s.description) header.push(`> ${s.description}`);
    const body = [
      header.join("\n\n"),
      b.body || "",
      b.exercises && b.exercises.length ? b.exercises.map((e) => `• ${e}`).join("\n") : "",
    ].filter(Boolean).join("\n\n");
    return {
      id: `ai-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      type: "WORKOUT",
      order: i,
      title: b.heading || `Bloque ${i + 1}`,
      bodyText: body,
    };
  });
}

function todayLocalDate(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
function nextMondayLocal(): string {
  const d = new Date();
  const dow = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() + (dow === 1 ? 7 : (8 - dow)));
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function AiCalendarPlannerModal({
  patientId,
  onClose,
  onSaved,
}: {
  patientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<Mode>("session");
  const [kind, setKind] = useState<"entrenamiento" | "accesorios">("entrenamiento");
  const [prompt, setPrompt] = useState("");
  const [dateStr, setDateStr] = useState(todayLocalDate());
  const [mondayStr, setMondayStr] = useState(nextMondayLocal());
  const [restDay, setRestDay] = useState<WorkDay>(4);
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const workDays = ALL_WEEKDAYS.filter((d) => d !== restDay) as WorkDay[];

  async function generateOne(dayOfWeek: WorkDay, extraContext?: string): Promise<Session> {
    const r = await fetch("/api/ai/generate-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        prompt: prompt.trim(),
        dayOfWeek,
        durationMin: durationForKind(kind),
        patientId,
        extraContext: extraContext ?? "",
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error ?? "Error al generar sesión");
    return d.session as Session;
  }

  async function saveSessionAtDate(scheduledDate: Date, session: Session): Promise<void> {
    const r = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId,
        scheduledDate: scheduledDate.toISOString(),
        title: session.title,
        tasksSnapshot: sessionToTasksSnapshot(session),
      }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d?.error ?? "No se pudo guardar la sesión en el calendario");
    }
  }

  function mondayOf(dateStr: string): Date {
    const d = new Date(dateStr + "T09:00:00");
    const dow = d.getDay() === 0 ? 7 : d.getDay();
    d.setDate(d.getDate() - (dow - 1));
    return d;
  }

  async function run() {
    if (!prompt.trim()) { setError("Escribe el foco/prompt del programa"); return; }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      if (mode === "session") {
        setProgress("Generando sesión con IA…");
        const d = new Date(dateStr + "T09:00:00");
        const dow = (d.getDay() === 0 ? 7 : d.getDay()) as WorkDay;
        const s = await generateOne(dow > 5 ? 5 : dow);
        setProgress("Agendando…");
        await saveSessionAtDate(d, s);
        setOk("✓ Sesión agendada en el calendario.");
      } else if (mode === "week") {
        const monday = mondayOf(mondayStr);
        const generated: Array<{ dow: WorkDay; session: Session }> = [];
        for (const dow of workDays) {
          setProgress(`Generando ${DAY_LABELS[dow]}…`);
          const s = await generateOne(dow);
          generated.push({ dow, session: s });
        }
        setProgress("Agendando en el calendario…");
        for (const { dow, session } of generated) {
          const day = new Date(monday);
          day.setDate(monday.getDate() + (dow - 1));
          await saveSessionAtDate(day, session);
        }
        // Día de descanso activo (fijo, no IA)
        const restDate = new Date(monday);
        restDate.setDate(monday.getDate() + (restDay - 1));
        await saveSessionAtDate(restDate, REST_ACTIVE_TEMPLATE);
        setOk(`✓ Semana agendada: ${workDays.length} sesiones IA + descanso activo el ${DAY_LABELS[restDay].toLowerCase()}.`);
      } else {
        // Mesociclo 4 semanas
        const baseMonday = mondayOf(mondayStr);
        const generatedAll: Array<{ w: 1|2|3|4; dow: WorkDay; session: Session }> = [];
        const previousSummary: string[] = [];
        for (const w of [1, 2, 3, 4] as const) {
          const phaseHint: Record<1|2|3|4, string> = {
            1: "SEMANA 1 (introducción). Volumen medio, técnica prioritaria, sin cargas máximas.",
            2: "SEMANA 2 (progresión). +10% volumen o intensidad vs semana 1.",
            3: "SEMANA 3 (pico). Máxima carga del bloque.",
            4: "SEMANA 4 (descarga). -30-40% volumen vs semana 3.",
          };
          for (const dow of workDays) {
            setProgress(`Semana ${w} · ${DAY_LABELS[dow]}…`);
            const context = [
              `MESOCICLO DE 4 SEMANAS. ${phaseHint[w]}`,
              `El ${DAY_LABELS[restDay].toLowerCase()} es descanso activo (rodaje Z2 + movilidad) — no incluyas otro día de rodaje continuo en las sesiones de trabajo.`,
              previousSummary.length > 0 ? `Sesiones previas: ${previousSummary.slice(-8).join(" · ")}` : "",
            ].filter(Boolean).join("\n\n");
            const s = await generateOne(dow, context);
            generatedAll.push({ w, dow, session: s });
            previousSummary.push(`S${w}${DAY_LABELS[dow].slice(0,1)}: ${s.title}`);
          }
        }
        setProgress("Agendando 20 sesiones…");
        for (const { w, dow, session } of generatedAll) {
          const day = new Date(baseMonday);
          day.setDate(baseMonday.getDate() + (w - 1) * 7 + (dow - 1));
          await saveSessionAtDate(day, session);
        }
        // Descanso activo × 4 semanas
        for (const w of [1, 2, 3, 4] as const) {
          const day = new Date(baseMonday);
          day.setDate(baseMonday.getDate() + (w - 1) * 7 + (restDay - 1));
          await saveSessionAtDate(day, REST_ACTIVE_TEMPLATE);
        }
        setOk(`✓ Mesociclo de 4 semanas agendado: ${generatedAll.length} sesiones IA + ${4} descansos activos.`);
      }
      // Refresca el calendario tras un pequeño delay para que el usuario vea el "OK"
      setTimeout(onSaved, 800);
    } catch (e: any) {
      setError(e?.message ?? "Error inesperado");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-3 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-4 my-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-semibold text-base">🧠 Programador IA</h3>
            <p className="text-xs text-neutral-500 mt-0.5">Genera y agenda sesiones directamente en el calendario del paciente.</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>

        {/* Selector de granularidad */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {(["session", "week", "mesocycle"] as Mode[]).map((m) => {
            const label = m === "session" ? "Sesión suelta" : m === "week" ? "Semana" : "Mesociclo (4sem)";
            const emoji = m === "session" ? "📅" : m === "week" ? "🗓" : "📆";
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                disabled={busy}
                className="text-xs px-2 py-2 rounded-lg border transition disabled:opacity-40"
                style={{
                  background: mode === m ? "#0A0A0A" : "#FFFFFF",
                  color: mode === m ? "#FAFAFA" : "#0A0A0A",
                  borderColor: mode === m ? "#0A0A0A" : "#E5E5E5",
                }}
              >
                <div className="text-base">{emoji}</div>
                <div className="text-[11px] font-medium mt-0.5">{label}</div>
              </button>
            );
          })}
        </div>

        {/* Kind (accesorios / entrenamiento) */}
        <div className="mb-3">
          <label className="text-[11px] text-neutral-500 block mb-1">Tipo de sesión</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKind("entrenamiento")}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-lg border disabled:opacity-40"
              style={{
                background: kind === "entrenamiento" ? "#0A0A0A" : "#FFFFFF",
                color: kind === "entrenamiento" ? "#FAFAFA" : "#0A0A0A",
                borderColor: kind === "entrenamiento" ? "#0A0A0A" : "#E5E5E5",
              }}
            >
              🏋 Entrenamiento (60min)
            </button>
            <button
              type="button"
              onClick={() => setKind("accesorios")}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-lg border disabled:opacity-40"
              style={{
                background: kind === "accesorios" ? "#0A0A0A" : "#FFFFFF",
                color: kind === "accesorios" ? "#FAFAFA" : "#0A0A0A",
                borderColor: kind === "accesorios" ? "#0A0A0A" : "#E5E5E5",
              }}
            >
              🎯 Accesorios (15min)
            </button>
          </div>
        </div>

        {/* Fecha o lunes según el modo */}
        <div className="mb-3">
          {mode === "session" ? (
            <>
              <label className="text-[11px] text-neutral-500 block mb-1">Día de la sesión</label>
              <input type="date" className="input text-sm w-full" value={dateStr} onChange={(e) => setDateStr(e.target.value)} disabled={busy} />
            </>
          ) : (
            <>
              <label className="text-[11px] text-neutral-500 block mb-1">Lunes de inicio ({mode === "week" ? "1 semana" : "4 semanas"})</label>
              <input type="date" className="input text-sm w-full" value={mondayStr} onChange={(e) => setMondayStr(e.target.value)} disabled={busy} />
            </>
          )}
        </div>

        {/* Selector día de descanso — solo en semana/mesociclo */}
        {(mode === "week" || mode === "mesocycle") && (
          <div className="mb-3 rounded-lg p-2.5" style={{ background: "#F0FDFA", border: "1px solid #99F6E4" }}>
            <span className="text-xs font-semibold" style={{ color: "#0F766E" }}>🧘 Día de descanso activo:</span>
            <div className="flex gap-1 flex-wrap mt-1.5">
              {ALL_WEEKDAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setRestDay(d)}
                  disabled={busy}
                  className="text-xs px-2.5 py-1 rounded-full border transition disabled:opacity-40"
                  style={{
                    background: restDay === d ? "#0F766E" : "#FFFFFF",
                    color: restDay === d ? "#FFFFFF" : "#134E4A",
                    borderColor: restDay === d ? "#0F766E" : "#99F6E4",
                  }}
                >
                  {DAY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Prompt */}
        <div className="mb-3">
          <label className="text-[11px] text-neutral-500 block mb-1">
            {mode === "session" ? "Foco de la sesión" : mode === "week" ? "Foco de la semana" : "Foco del mesociclo (aplica a las 16 sesiones)"}
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder='Ej: "Foco en fuerza en tren inferior, cuidando hombro derecho (rehabilitación). Preferir bloques HIIT sobre rodaje continuo."'
            className="w-full text-sm bg-white border border-neutral-200 focus:border-neutral-400 rounded-md px-2 py-1.5 outline-none"
            disabled={busy}
          />
          <p className="text-[10px] text-neutral-500 mt-1 italic">
            La IA usa este texto + la ficha del paciente (adaptaciones, diagnóstico, PRs, últimas métricas) para personalizar.
          </p>
        </div>

        {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5 mb-3">⚠ {error}</div>}
        {ok && <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1.5 mb-3">{ok}</div>}
        {busy && progress && (
          <div className="text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5 mb-3 italic">
            ⏳ {progress}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="btn btn-ghost text-xs">Cancelar</button>
          <button
            onClick={run}
            disabled={busy || !prompt.trim()}
            className="text-xs font-medium px-3 py-2 rounded-lg disabled:opacity-40"
            style={{ background: "#0A0A0A", color: "#FAFAFA" }}
          >
            {busy ? "Generando…" : mode === "session" ? "✨ Generar y agendar" : mode === "week" ? "✨ Generar semana" : "✨ Generar mesociclo (~2-3 min)"}
          </button>
        </div>
      </div>
    </div>
  );
}
