"use client";
/**
 * Vista principal de la tab "Historias". Grid de 7 columnas responsive
 * con cada día de la semana, su formato asignado (editable) y las ideas
 * asociadas (bloc infinito, con checkbox para tachar publicadas).
 *
 * Todo el guardado es autosave: la lista de la izquierda no navega, no
 * hay botones "guardar", ningún modal. El objetivo es "tenerlo a la vista
 * y poder anotar cosas rápido" — cualquier fricción rompe eso.
 */
import { useEffect, useRef, useState } from "react";

type Idea = {
  id: string;
  text: string;
  done: boolean;
  order: number;
  doneAt: string | null;
};

type Slot = {
  id: string;
  dayOfWeek: number;
  formatName: string;
  emoji: string | null;
  color: string | null;
  ideas: Idea[];
};

const DAY_LABELS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DAY_SHORT = ["", "L", "M", "X", "J", "V", "S", "D"];

export function StoriesTemplateView() {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/content/stories");
        const d = await r.json();
        if (!r.ok || !d?.ok) {
          setError(d?.error || `Error ${r.status}`);
          return;
        }
        setSlots(d.slots);
      } catch (e: any) {
        setError(e?.message || "Error inesperado");
      }
    })();
  }, []);

  function updateSlotLocal(slotId: string, patch: Partial<Slot>) {
    setSlots((prev) =>
      prev ? prev.map((s) => (s.id === slotId ? { ...s, ...patch } : s)) : prev,
    );
  }

  function updateIdeaLocal(slotId: string, ideaId: string, patch: Partial<Idea>) {
    setSlots((prev) =>
      prev
        ? prev.map((s) =>
            s.id === slotId
              ? { ...s, ideas: s.ideas.map((i) => (i.id === ideaId ? { ...i, ...patch } : i)) }
              : s,
          )
        : prev,
    );
  }

  function removeIdeaLocal(slotId: string, ideaId: string) {
    setSlots((prev) =>
      prev
        ? prev.map((s) =>
            s.id === slotId ? { ...s, ideas: s.ideas.filter((i) => i.id !== ideaId) } : s,
          )
        : prev,
    );
  }

  function addIdeaLocal(slotId: string, idea: Idea) {
    setSlots((prev) =>
      prev ? prev.map((s) => (s.id === slotId ? { ...s, ideas: [...s.ideas, idea] } : s)) : prev,
    );
  }

  if (error) {
    return (
      <div className="rounded-lg p-3 text-xs" style={{ background: "#FEE2E2", color: "#7F1D1D", border: "1px solid #FCA5A5" }}>
        {error}
      </div>
    );
  }
  if (!slots) {
    return (
      <div className="text-xs text-neutral-500 italic">Cargando plantilla…</div>
    );
  }

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
      {slots.map((slot) => (
        <DayColumn
          key={slot.id}
          slot={slot}
          onSlotChange={(patch) => updateSlotLocal(slot.id, patch)}
          onIdeaChange={(ideaId, patch) => updateIdeaLocal(slot.id, ideaId, patch)}
          onIdeaRemove={(ideaId) => removeIdeaLocal(slot.id, ideaId)}
          onIdeaAdd={(idea) => addIdeaLocal(slot.id, idea)}
        />
      ))}
    </div>
  );
}

function DayColumn({
  slot,
  onSlotChange,
  onIdeaChange,
  onIdeaRemove,
  onIdeaAdd,
}: {
  slot: Slot;
  onSlotChange: (patch: Partial<Slot>) => void;
  onIdeaChange: (ideaId: string, patch: Partial<Idea>) => void;
  onIdeaRemove: (ideaId: string) => void;
  onIdeaAdd: (idea: Idea) => void;
}) {
  return (
    <section className="card !p-0 overflow-hidden">
      {/* Header del día con formato editable */}
      <header className="p-3 border-b border-neutral-100 bg-neutral-50">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            <span className="hidden md:inline">{DAY_LABELS[slot.dayOfWeek]}</span>
            <span className="md:hidden">{DAY_SHORT[slot.dayOfWeek]} · {DAY_LABELS[slot.dayOfWeek]}</span>
          </span>
        </div>
        <SlotHeader slot={slot} onChange={onSlotChange} />
      </header>

      {/* Ideas */}
      <div className="p-3 space-y-2">
        {slot.ideas.length === 0 ? (
          <p className="text-[11px] italic text-neutral-400 py-1">Sin ideas aún.</p>
        ) : (
          slot.ideas.map((idea) => (
            <IdeaRow
              key={idea.id}
              idea={idea}
              onChange={(patch) => onIdeaChange(idea.id, patch)}
              onRemove={() => onIdeaRemove(idea.id)}
            />
          ))
        )}
        <NewIdeaInput slotId={slot.id} onAdded={onIdeaAdd} />
      </div>
    </section>
  );
}

function SlotHeader({ slot, onChange }: { slot: Slot; onChange: (patch: Partial<Slot>) => void }) {
  const [emoji, setEmoji] = useState(slot.emoji ?? "");
  const [formatName, setFormatName] = useState(slot.formatName);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  async function persist(next: { emoji?: string | null; formatName?: string }) {
    try {
      await fetch(`/api/content/stories/slots/${slot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      onChange(next);
    } catch { /* silencioso */ }
  }

  function schedule(next: { emoji?: string | null; formatName?: string }) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist(next), 700);
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={emoji}
        onChange={(e) => {
          const v = e.target.value.slice(0, 4);
          setEmoji(v);
          schedule({ emoji: v || null });
        }}
        placeholder="✨"
        className="w-8 text-center text-lg bg-transparent border-none focus:outline-none focus:bg-white rounded"
        maxLength={4}
        title="Emoji"
      />
      <input
        value={formatName}
        onChange={(e) => {
          const v = e.target.value.slice(0, 120);
          setFormatName(v);
          schedule({ formatName: v });
        }}
        placeholder="Formato del día"
        className="flex-1 text-sm font-semibold bg-transparent border-none focus:outline-none focus:bg-white rounded px-1"
      />
    </div>
  );
}

function IdeaRow({
  idea,
  onChange,
  onRemove,
}: {
  idea: Idea;
  onChange: (patch: Partial<Idea>) => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState(idea.text);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ta = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = el.scrollHeight + "px";
  }, [text]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  async function persistText(next: string) {
    try {
      await fetch(`/api/content/stories/ideas/${idea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: next }),
      });
      onChange({ text: next });
    } catch { /* silencioso */ }
  }

  async function toggleDone() {
    const next = !idea.done;
    onChange({ done: next });
    try {
      await fetch(`/api/content/stories/ideas/${idea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: next }),
      });
    } catch { /* silencioso — rollback opcional */ }
  }

  async function remove() {
    if (!confirm("¿Borrar esta idea?")) return;
    onRemove();
    try {
      await fetch(`/api/content/stories/ideas/${idea.id}`, { method: "DELETE" });
    } catch { /* silencioso */ }
  }

  return (
    <div className={`group flex items-start gap-2 ${idea.done ? "opacity-50" : ""}`}>
      <button
        type="button"
        onClick={toggleDone}
        className={`mt-1 shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[10px] transition-colors ${
          idea.done
            ? "bg-neutral-900 border-neutral-900 text-white"
            : "bg-white border-neutral-300 hover:border-neutral-500"
        }`}
        title={idea.done ? "Marcar como pendiente" : "Marcar como publicada"}
      >
        {idea.done && "✓"}
      </button>
      <textarea
        ref={ta}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => persistText(e.target.value), 700);
        }}
        onBlur={() => {
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
          }
          if (text !== idea.text) persistText(text);
        }}
        rows={1}
        className={`text-xs flex-1 bg-transparent resize-none focus:outline-none rounded px-1 hover:bg-neutral-50 focus:bg-neutral-50 ${
          idea.done ? "line-through" : ""
        }`}
      />
      <button
        type="button"
        onClick={remove}
        className="text-[10px] text-neutral-300 opacity-0 group-hover:opacity-100 hover:text-red-600 transition-all shrink-0 pt-1"
        title="Borrar"
      >
        ×
      </button>
    </div>
  );
}

function NewIdeaInput({ slotId, onAdded }: { slotId: string; onAdded: (idea: Idea) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/content/stories/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateSlotId: slotId, text: trimmed }),
      });
      const d = await r.json();
      if (r.ok && d?.ok) {
        onAdded(d.idea);
        setText("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start gap-2 pt-1 border-t border-dashed border-neutral-200">
      <span className="text-neutral-300 mt-1.5 shrink-0 text-[10px]">＋</span>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        onBlur={submit}
        rows={1}
        placeholder="Nueva idea…"
        className="text-xs flex-1 bg-transparent resize-none focus:outline-none rounded px-1 placeholder:text-neutral-300 focus:bg-neutral-50"
        disabled={busy}
      />
    </div>
  );
}
