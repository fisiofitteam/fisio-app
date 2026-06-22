"use client";
/**
 * Wizards de revisión guiada del CEO:
 *  - DayCloseWizard: 3 pasos para cerrar el día (repaso dianas + nota).
 *  - WeeklyPlanWizard: 4 pasos para planificar la semana (foco → objetivos → inbox → confirmar).
 *
 * Estado de control desde fuera (CeoPersonalView): open + onClose.
 */
import { useCallback, useEffect, useState } from "react";

type WeeklyGoalLite = { id: string; order: number; title: string; completedAt: string | null };
type InboxItem = { id: string; content: string; createdAt: string };
type Tag = { id: string; name: string; color: string };

// ─── Cierre del día ────────────────────────────────────────────────────────

type Dart = { id: string; content: string; completedAt: string | null; order: number };

export function DayCloseWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [darts, setDarts] = useState<Dart[]>([]);
  const [notes, setNotes] = useState("");
  const [reflection, setReflection] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/ceo/agenda", { cache: "no-store" });
    if (r.ok) {
      const data = await r.json();
      setDarts(((data.importantItems ?? []) as Dart[]).slice().sort((a, b) => a.order - b.order));
    }
    const n = await fetch("/api/ceo/notes", { cache: "no-store" });
    if (n.ok) {
      const data = await n.json();
      setNotes(data.content ?? "");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggleDart(d: Dart) {
    await fetch("/api/ceo/agenda", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: d.id, completedAt: d.completedAt ? null : new Date().toISOString() }),
    });
    load();
  }

  async function pushToTomorrow(d: Dart) {
    // Crea una CeoTask de mañana con el contenido + borra la diana
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await fetch("/api/ceo/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: d.content, priority: "high", dueDate: tomorrow.toISOString() }),
    });
    await fetch(`/api/ceo/agenda?id=${d.id}`, { method: "DELETE" });
    load();
  }

  async function finish() {
    setSaving(true);
    try {
      if (reflection.trim()) {
        const stamp = new Date().toLocaleString("es-ES", { weekday: "short", day: "numeric", month: "short" });
        const newNotes = `${notes}${notes && !notes.endsWith("\n") ? "\n\n" : ""}— ${stamp} —\n${reflection.trim()}\n`;
        await fetch("/api/ceo/notes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: newNotes }),
        });
      }
      await fetch("/api/ceo/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastDayCloseAt: new Date().toISOString() }),
      });
      window.dispatchEvent(new CustomEvent("ceo-review:done"));
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="🌙 Cierre del día" onClose={onClose} step={step + 1} totalSteps={3}>
      {step === 0 && (
        <div>
          <h3 className="font-medium text-sm mb-2">1/3 — Las 3 dianas de hoy</h3>
          <p className="text-xs text-neutral-500 mb-3">¿Las cumpliste? Lo que no, lo mandamos a mañana o lo dejas estar.</p>
          {darts.length === 0 ? (
            <p className="text-xs text-neutral-400 italic">No habías marcado dianas hoy.</p>
          ) : (
            <div className="space-y-2">
              {darts.map((d) => (
                <div key={d.id} className="flex items-center gap-2 p-2 border border-neutral-200 rounded">
                  <button onClick={() => toggleDart(d)} className={`w-5 h-5 rounded border flex items-center justify-center ${d.completedAt ? "bg-emerald-600 border-emerald-600 text-white" : "border-neutral-300"}`}>
                    {d.completedAt && <span className="text-xs">✓</span>}
                  </button>
                  <span className={`text-sm flex-1 ${d.completedAt ? "line-through text-neutral-400" : ""}`}>{d.content || <em className="text-neutral-300">(sin diana)</em>}</span>
                  {d.content && !d.completedAt && (
                    <button onClick={() => pushToTomorrow(d)} className="text-[11px] text-blue-700 hover:underline">→ Mañana</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {step === 1 && (
        <div>
          <h3 className="font-medium text-sm mb-2">2/3 — Nota de reflexión</h3>
          <p className="text-xs text-neutral-500 mb-3">¿Qué te llevas de hoy? 1-3 frases. Se añade a tus notas con la fecha.</p>
          <textarea
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            rows={5}
            className="w-full text-sm border border-neutral-200 rounded p-2 focus:border-neutral-500 outline-none"
            placeholder="Lo que ha funcionado, lo que no, una sensación. Lo que tú quieras."
          />
        </div>
      )}
      {step === 2 && (
        <div>
          <h3 className="font-medium text-sm mb-2">3/3 — Confirmar cierre</h3>
          <p className="text-xs text-neutral-500 mb-3">Vamos a marcar el día como cerrado. Buenas noches, jefe 🌙</p>
          <ul className="text-xs text-neutral-600 space-y-1 mb-3">
            <li>· {darts.filter((d) => d.completedAt).length} de {darts.length} dianas cumplidas.</li>
            <li>· {reflection.trim() ? "Nota de reflexión añadida." : "Sin nota de reflexión (puedes pasarla)."}</li>
          </ul>
        </div>
      )}
      <Footer
        step={step}
        totalSteps={3}
        onPrev={() => setStep((s) => Math.max(0, s - 1))}
        onNext={() => setStep((s) => Math.min(2, s + 1))}
        onFinish={finish}
        finishing={saving}
      />
    </Modal>
  );
}

// ─── Planificación semanal ─────────────────────────────────────────────────

export function WeeklyPlanWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [focus, setFocus] = useState<{ content: string; year: number; month: number } | null>(null);
  const [currentGoals, setCurrentGoals] = useState<WeeklyGoalLite[]>([]);
  const [prevGoals, setPrevGoals] = useState<WeeklyGoalLite[]>([]);
  const [goalDrafts, setGoalDrafts] = useState<string[]>(Array(3).fill(""));
  const [carriedFrom, setCarriedFrom] = useState<(string | null)[]>(Array(3).fill(null));
  const [meta, setMeta] = useState<{ isoYear: number; isoWeek: number } | null>(null);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [inboxIdx, setInboxIdx] = useState(0);
  const [tags, setTags] = useState<Tag[]>([]);
  const [saving, setSaving] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);

  const load = useCallback(async () => {
    const [fRes, gRes, pRes, iRes, tRes] = await Promise.all([
      fetch("/api/ceo/focus", { cache: "no-store" }),
      fetch("/api/ceo/weekly-goals", { cache: "no-store" }),
      fetch("/api/ceo/weekly-goals?previous=1", { cache: "no-store" }),
      fetch("/api/ceo/inbox", { cache: "no-store" }),
      fetch("/api/ceo/tags", { cache: "no-store" }),
    ]);
    if (fRes.ok) {
      const d = await fRes.json();
      setFocus({ content: d.focus?.content ?? "", year: d.year, month: d.month });
    }
    if (gRes.ok) {
      const d = await gRes.json();
      const list = (d.goals ?? []) as WeeklyGoalLite[];
      list.sort((a, b) => a.order - b.order);
      setCurrentGoals(list);
      setMeta({ isoYear: d.isoYear, isoWeek: d.isoWeek });
      setGoalDrafts(list.slice(0, 3).map((g) => g.title || "").concat(Array(3).fill("")).slice(0, 3));
      setCarriedFrom(list.slice(0, 3).map((g) => (g as any).carriedFromGoalId ?? null).concat(Array(3).fill(null)).slice(0, 3));
    }
    if (pRes.ok) {
      const d = await pRes.json();
      const list = ((d.goals ?? []) as WeeklyGoalLite[]).filter((g) => g.title?.trim() && !g.completedAt);
      setPrevGoals(list);
    }
    if (iRes.ok) {
      const d = await iRes.json();
      setInbox((d.items ?? []) as InboxItem[]);
    }
    if (tRes.ok) {
      const d = await tRes.json();
      setTags(d.tags ?? []);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  function carryGoal(idx: number, g: WeeklyGoalLite) {
    setGoalDrafts((prev) => { const n = [...prev]; n[idx] = g.title; return n; });
    setCarriedFrom((prev) => { const n = [...prev]; n[idx] = g.id; return n; });
  }

  async function saveGoals() {
    if (!meta) return;
    await fetch("/api/ceo/weekly-goals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isoYear: meta.isoYear,
        isoWeek: meta.isoWeek,
        goals: goalDrafts.map((title, order) => ({ order, title, carriedFromGoalId: carriedFrom[order] })),
      }),
    });
  }

  async function convertInboxItem(item: InboxItem, opts: { priority: string; dueDate?: string | null; tagIds?: string[]; weeklyGoalId?: string | null } | "discard" | "later") {
    if (opts === "discard") {
      await fetch(`/api/ceo/inbox?id=${item.id}`, { method: "DELETE" });
    } else if (opts === "later") {
      // simplemente lo deja sin procesar y salta
    } else {
      const r = await fetch("/api/ceo/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.content,
          priority: opts.priority,
          dueDate: opts.dueDate ?? null,
          tagIds: opts.tagIds ?? [],
          weeklyGoalId: opts.weeklyGoalId ?? null,
        }),
      });
      const data = await r.json().catch(() => ({}));
      await fetch("/api/ceo/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, processedAt: new Date().toISOString(), convertedTaskId: data?.id ?? null }),
      });
      setProcessedCount((n) => n + 1);
    }
    setInboxIdx((i) => i + 1);
  }

  async function finish() {
    setSaving(true);
    try {
      await fetch("/api/ceo/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastWeeklyPlanAt: new Date().toISOString() }),
      });
      window.dispatchEvent(new CustomEvent("ceo-review:done"));
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="📅 Planificación semanal" onClose={onClose} step={step + 1} totalSteps={4}>
      {step === 0 && (
        <div>
          <h3 className="font-medium text-sm mb-2">1/4 — Foco del mes</h3>
          <p className="text-xs text-neutral-500 mb-3">Recuerda hacia dónde estamos remando este mes.</p>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm whitespace-pre-wrap">
            {focus?.content || <em className="text-neutral-400">Aún no has definido el foco del mes.</em>}
          </div>
        </div>
      )}
      {step === 1 && (
        <div>
          <h3 className="font-medium text-sm mb-2">2/4 — Objetivos de esta semana</h3>
          <p className="text-xs text-neutral-500 mb-3">
            Máximo 3. {meta && <>Semana ISO {meta.isoWeek}/{meta.isoYear}.</>}
          </p>
          {prevGoals.length > 0 && (
            <div className="mb-3 p-2 border border-blue-200 bg-blue-50 rounded">
              <div className="text-[11px] uppercase tracking-wide text-blue-700 mb-1">⟲ Pendientes de la semana pasada</div>
              <div className="space-y-1">
                {prevGoals.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => {
                      const emptyIdx = goalDrafts.findIndex((d) => !d.trim());
                      if (emptyIdx === -1) return alert("Ya tienes 3 objetivos. Vacía uno para arrastrar éste.");
                      carryGoal(emptyIdx, g);
                    }}
                    className="block w-full text-left text-xs hover:underline"
                  >
                    → {g.title}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-neutral-500 w-5">{i + 1}.</span>
                <input
                  type="text"
                  className="flex-1 text-sm border-b border-neutral-200 focus:border-neutral-500 outline-none py-1"
                  value={goalDrafts[i] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setGoalDrafts((prev) => { const n = [...prev]; n[i] = v; return n; });
                  }}
                  placeholder={`Objetivo ${i + 1}…`}
                />
                {carriedFrom[i] && <span className="text-[10px] text-blue-700" title="Arrastrado">↩</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {step === 2 && (
        <div>
          <h3 className="font-medium text-sm mb-2">3/4 — Procesar el inbox</h3>
          <p className="text-xs text-neutral-500 mb-3">
            {inbox.length === 0 ? "Inbox vacío 🎉" : `Quedan ${Math.max(0, inbox.length - inboxIdx)} de ${inbox.length}.`}
          </p>
          {inboxIdx >= inbox.length ? (
            <p className="text-xs text-emerald-700 italic">Todo procesado. {processedCount > 0 && `Has convertido ${processedCount} en tareas.`}</p>
          ) : (
            <InboxItemProcessor
              item={inbox[inboxIdx]}
              tags={tags}
              goals={currentGoals.filter((g) => goalDrafts[g.order]?.trim())}
              onConvert={(opts) => convertInboxItem(inbox[inboxIdx], opts)}
              onDiscard={() => convertInboxItem(inbox[inboxIdx], "discard")}
              onLater={() => convertInboxItem(inbox[inboxIdx], "later")}
            />
          )}
        </div>
      )}
      {step === 3 && (
        <div>
          <h3 className="font-medium text-sm mb-2">4/4 — Confirmar plan</h3>
          <ul className="text-xs text-neutral-600 space-y-1">
            <li>· {goalDrafts.filter((g) => g.trim()).length}/3 objetivos definidos para la semana.</li>
            <li>· {processedCount} elementos del inbox convertidos a tarea.</li>
            <li>· {inbox.length - inboxIdx - processedCount} dejados para más tarde / borrados.</li>
          </ul>
          <p className="text-xs text-neutral-500 mt-3">Al confirmar, se marca la planificación como hecha esta semana.</p>
        </div>
      )}
      <Footer
        step={step}
        totalSteps={4}
        onPrev={() => setStep((s) => Math.max(0, s - 1))}
        onNext={async () => {
          if (step === 1) await saveGoals();
          setStep((s) => Math.min(3, s + 1));
        }}
        onFinish={finish}
        finishing={saving}
      />
    </Modal>
  );
}

function InboxItemProcessor({
  item, tags, goals, onConvert, onDiscard, onLater,
}: {
  item: InboxItem;
  tags: Tag[];
  goals: WeeklyGoalLite[];
  onConvert: (opts: { priority: string; dueDate?: string | null; tagIds?: string[]; weeklyGoalId?: string | null }) => void;
  onDiscard: () => void;
  onLater: () => void;
}) {
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [weeklyGoalId, setWeeklyGoalId] = useState<string | null>(null);

  // Reset al cambiar de item
  useEffect(() => {
    setPriority("medium");
    setDueDate("");
    setTagIds([]);
    setWeeklyGoalId(null);
  }, [item.id]);

  return (
    <div className="border border-neutral-200 rounded p-3 bg-neutral-50">
      <div className="text-sm font-medium whitespace-pre-wrap mb-3">{item.content}</div>
      <div className="grid grid-cols-2 gap-2 text-xs mb-2">
        <label className="block">
          <span className="text-[10px] uppercase text-neutral-500">Prioridad</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full border border-neutral-200 rounded p-1 text-xs">
            <option value="low">Baja</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] uppercase text-neutral-500">Fecha</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full border border-neutral-200 rounded p-1 text-xs" />
        </label>
      </div>
      {tags.length > 0 && (
        <div className="mb-2">
          <span className="text-[10px] uppercase text-neutral-500">Etiquetas</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {tags.map((tg) => {
              const active = tagIds.includes(tg.id);
              return (
                <button
                  key={tg.id}
                  type="button"
                  onClick={() => setTagIds((prev) => active ? prev.filter((x) => x !== tg.id) : [...prev, tg.id])}
                  className="text-[10px] px-1.5 py-0.5 rounded border"
                  style={{ background: active ? tg.color : "white", borderColor: tg.color, color: active ? "white" : tg.color }}
                >
                  {active && "✓ "}{tg.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {goals.length > 0 && (
        <div className="mb-3">
          <span className="text-[10px] uppercase text-neutral-500">Objetivo de la semana</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {goals.map((g) => {
              const active = weeklyGoalId === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setWeeklyGoalId(active ? null : g.id)}
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${active ? "bg-blue-100 border-blue-300 text-blue-800" : "bg-white border-neutral-200 text-neutral-600"}`}
                >
                  {active && "✓ "}{g.title}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex gap-2 justify-end flex-wrap">
        <button onClick={onDiscard} className="text-xs text-red-700 hover:underline">🗑️ Tirar</button>
        <button onClick={onLater} className="text-xs text-neutral-600 hover:underline">Dejar para luego</button>
        <button
          onClick={() => onConvert({ priority, dueDate: dueDate || null, tagIds, weeklyGoalId })}
          className="text-xs btn btn-primary px-3 py-1"
        >
          ✓ Crear tarea
        </button>
      </div>
    </div>
  );
}

// ─── Helpers compartidos ───────────────────────────────────────────────────

function Modal({
  title, onClose, children, step, totalSteps,
}: {
  title: string; onClose: () => void; children: React.ReactNode;
  step?: number; totalSteps?: number;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center pt-12 px-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-sm">Cerrar</button>
        </div>
        {step && totalSteps && (
          <div className="h-1 bg-neutral-100 rounded mb-4 overflow-hidden">
            <div className="h-full bg-emerald-600" style={{ width: `${(step / totalSteps) * 100}%` }} />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function Footer({
  step, totalSteps, onPrev, onNext, onFinish, finishing,
}: {
  step: number; totalSteps: number;
  onPrev: () => void; onNext: () => void;
  onFinish: () => void; finishing: boolean;
}) {
  const last = step === totalSteps - 1;
  return (
    <div className="flex justify-between mt-5 pt-3 border-t border-neutral-100">
      <button onClick={onPrev} disabled={step === 0} className="text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-40">
        ← Atrás
      </button>
      {last ? (
        <button onClick={onFinish} disabled={finishing} className="text-xs btn btn-primary px-4 py-1.5 disabled:opacity-50">
          {finishing ? "Guardando…" : "✓ Confirmar"}
        </button>
      ) : (
        <button onClick={onNext} className="text-xs btn btn-primary px-4 py-1.5">
          Siguiente →
        </button>
      )}
    </div>
  );
}
