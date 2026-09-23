"use client";
/**
 * Textarea/input autosize con autosave por debounce contra
 * /api/content/pieces. Diseñado para editar campos simples de una pieza
 * (title, editorNotes, y también el content/label de cada bloque del
 * guion) directamente desde el dossier, sin abrir el editor de la pieza.
 *
 * Contrato:
 *  - `field="title" | "editorNotes"` → PATCH { id, [field]: value }
 *  - `field="blocks"` → NUNCA se usa aquí; para bloques usa
 *    PieceBlocksInlineEditor, que envía el array completo.
 *
 * UX:
 *  - Se ve como texto plano; al hacer click/focus se convierte en input.
 *  - Autosave 800ms después de dejar de teclear.
 *  - Indicador visual sutil: "…" mientras guarda, "✓" cuando OK, "✕" si error.
 *  - Vuelve al modo "texto" cuando pierde el foco (blur → flush inmediato).
 *  - Se oculta al imprimir.
 */
import { useEffect, useRef, useState } from "react";

type Props = {
  pieceId: string;
  field: "title" | "editorNotes";
  initialValue: string;
  placeholder?: string;
  /** Renderizado de solo lectura (para print y para el estado no editando). */
  as: "h4" | "p";
  className?: string;
  /** Estilo inline del elemento de solo lectura. */
  style?: React.CSSProperties;
};

export function PieceInlineText({
  pieceId,
  field,
  initialValue,
  placeholder,
  as,
  className,
  style,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const [saved, setSaved] = useState(initialValue);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  async function flush(next: string) {
    if (next === saved) return;
    setStatus("saving");
    try {
      const r = await fetch("/api/content/pieces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pieceId, [field]: next }),
      });
      if (!r.ok) throw new Error("save-failed");
      setSaved(next);
      setStatus("saved");
      setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1200);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2000);
    }
  }

  function scheduleFlush(next: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => flush(next), 800);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Autosize del textarea al contenido
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = el.scrollHeight + "px";
  }, [value]);

  const Tag = as;

  return (
    <>
      {/* Print: siempre texto plano */}
      <Tag className={`${className ?? ""} hidden print:block`} style={style}>
        {saved || placeholder || ""}
      </Tag>

      {/* Editor con autosave */}
      <span className="print:hidden inline-flex items-start gap-1 w-full">
        <textarea
          ref={textareaRef}
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            setValue(e.target.value);
            scheduleFlush(e.target.value);
          }}
          onBlur={() => {
            if (debounceRef.current) {
              clearTimeout(debounceRef.current);
              debounceRef.current = null;
            }
            flush(value);
          }}
          rows={1}
          className={`${className ?? ""} w-full bg-transparent resize-none focus:outline-none focus:bg-neutral-50 rounded px-1 -mx-1 hover:bg-neutral-50/60 transition-colors`}
          style={style}
        />
        <span className="text-[9px] text-neutral-400 pt-1.5 select-none w-3 shrink-0">
          {status === "saving" && "…"}
          {status === "saved" && <span className="text-emerald-600">✓</span>}
          {status === "error" && <span className="text-red-600">✕</span>}
        </span>
      </span>
    </>
  );
}
