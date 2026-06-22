"use client";
/**
 * Captura rápida del inbox del CEO.
 *
 * - Botón flotante (📥) abajo-derecha visible en /fisio.
 * - Atajo de teclado Shift+I para abrir desde cualquier sitio del panel.
 * - Modal mínimo: textarea + Enter para guardar y limpiar (queda abierto para
 *   seguir vertiendo), Shift+Enter salto de línea, Esc cierra.
 *
 * Solo se renderiza si el rol es "ceo". El padre debe controlar eso.
 */
import { useEffect, useRef, useState } from "react";

type Props = { enabled: boolean };

export function CeoInboxQuickCapture({ enabled }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Atajo Shift+I (sólo si no estás escribiendo en otro input/textarea/editable)
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      // Esc cierra
      if (open && e.key === "Escape") { setOpen(false); return; }
      // Shift+I para abrir
      if (e.shiftKey && (e.key === "I" || e.key === "i") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement | null;
        const tag = (t?.tagName ?? "").toLowerCase();
        const isTyping = tag === "input" || tag === "textarea" || (t as any)?.isContentEditable;
        if (isTyping) return;
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, open]);

  useEffect(() => {
    if (open) setTimeout(() => taRef.current?.focus(), 50);
  }, [open]);

  if (!enabled) return null;

  async function save() {
    const content = value.trim();
    if (!content) return;
    setSaving(true);
    try {
      const r = await fetch("/api/ceo/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (r.ok) {
        setValue("");
        setSavedCount((n) => n + 1);
        // Notificar al panel para que refresque el contador del bloque "Inbox"
        window.dispatchEvent(new CustomEvent("ceo-inbox:changed"));
        setTimeout(() => taRef.current?.focus(), 30);
      }
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      save();
    }
  }

  return (
    <>
      {/* Botón flotante */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-30 w-12 h-12 rounded-full bg-neutral-900 text-white shadow-lg hover:bg-neutral-800 flex items-center justify-center text-xl"
          title="Inbox del CEO (Shift+I)"
          aria-label="Abrir inbox"
        >
          📥
        </button>
      )}

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-40 flex items-start justify-center pt-20 px-4 bg-black/30" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-baseline mb-2">
              <h2 className="font-semibold text-sm">📥 Inbox — captura rápida</h2>
              <button onClick={() => setOpen(false)} className="text-neutral-400 hover:text-neutral-700 text-xs">Cerrar (Esc)</button>
            </div>
            <p className="text-[11px] text-neutral-500 mb-2">
              Solo texto. Lo clasificas luego en la planificación semanal. <kbd className="border rounded px-1 text-[10px]">Enter</kbd> guarda, <kbd className="border rounded px-1 text-[10px]">Shift+Enter</kbd> salto de línea.
            </p>
            <textarea
              ref={taRef}
              className="w-full text-sm rounded-md border border-neutral-200 focus:border-neutral-500 outline-none px-2 py-1.5 min-h-[80px]"
              rows={3}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Idea, recordatorio, lo que sea. No tienes que clasificar nada ahora."
              disabled={saving}
            />
            <div className="flex justify-between items-center mt-2">
              <span className="text-[11px] text-neutral-400">
                {savedCount > 0 ? `${savedCount} guardado${savedCount > 1 ? "s" : ""} en esta sesión` : "Sigue vertiendo, no clasifiques aún"}
              </span>
              <button
                type="button"
                onClick={save}
                disabled={saving || !value.trim()}
                className="text-xs btn btn-primary px-3 py-1.5 disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Guardar y seguir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
