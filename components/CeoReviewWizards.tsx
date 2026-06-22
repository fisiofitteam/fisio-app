"use client";
/**
 * Wizards de revisión guiada del CEO:
 *  - DayCloseWizard: 3 pasos para cerrar el día (repaso dianas + nota).
 *
 * Estado de control desde fuera (CeoPersonalView): open + onClose.
 */
import { useCallback, useEffect, useState } from "react";

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
