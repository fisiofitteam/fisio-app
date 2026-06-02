"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StickyNote } from "lucide-react";

/**
 * Botón "Notas" en la cabecera del paciente.
 *
 * - Vacío: fondo blanco, texto negro, icono amarillo.
 * - Con contenido: fondo amarillo, texto negro, icono gris.
 *
 * Al pulsar se abre un modal con un textarea. Guardado debounced (1s tras la
 * última pulsación) y también al cerrar. Persiste en Patient.fisioNotes.
 */
export function PatientNotesButton({
  patientId,
  initialNotes,
}: {
  patientId: string;
  initialNotes: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initialNotes ?? "");
  const [savedText, setSavedText] = useState(initialNotes ?? "");
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasContent = text.trim().length > 0;

  async function persist(value: string) {
    if (value === savedText) return;
    setSaving(true);
    const res = await fetch("/api/patients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: patientId, fisioNotes: value }),
    }).catch(() => null);
    if (res?.ok) setSavedText(value);
    setSaving(false);
  }

  function scheduleSave(value: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(value), 1000);
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setText(v);
    scheduleSave(v);
  }

  async function close() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (text !== savedText) await persist(text);
    setOpen(false);
    router.refresh();
  }

  // ESC cierra
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, text, savedText]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors"
        style={{
          background: hasContent ? "#FCD34D" : "#FFFFFF",
          color: "#0A0A0A",
          border: `1px solid ${hasContent ? "#F59E0B" : "#E5E5E5"}`,
        }}
        title="Notas internas sobre este paciente"
      >
        <StickyNote
          size={14}
          strokeWidth={2.25}
          style={{ color: hasContent ? "#6B7280" : "#F59E0B" }}
        />
        Notas
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={close}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-medium flex items-center gap-2">
                <StickyNote size={16} style={{ color: "#F59E0B" }} />
                Notas
              </h3>
              <button
                onClick={close}
                className="text-neutral-400 text-xl leading-none px-2"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <textarea
              autoFocus
              value={text}
              onChange={onChange}
              rows={10}
              className="w-full resize-y rounded-lg p-3 text-sm"
              style={{ background: "#FAFAFA", border: "1px solid #E5E5E5", color: "#0A0A0A" }}
              placeholder="Escribe aquí tus notas sobre este paciente…"
            />
            <div className="flex justify-between items-center mt-3 text-xs">
              <span style={{ color: saving ? "#737373" : "#16A34A" }}>
                {saving ? "Guardando…" : text === savedText && hasContent ? "✓ Guardado" : text === savedText ? "" : "Cambios sin guardar"}
              </span>
              <button
                onClick={close}
                className="text-sm font-semibold px-3 py-1.5 rounded-lg"
                style={{ background: "#0A0A0A", color: "#FAFAFA" }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
