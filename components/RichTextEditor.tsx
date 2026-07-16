"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline } from "lucide-react";

/**
 * Editor mínimo con negrita/cursiva/subrayado para el composer de la
 * comunidad. Usa contenteditable + document.execCommand — que sigue
 * funcionando bien en todos los navegadores modernos para este subset
 * pequeño de acciones, aunque esté marcado como deprecated. Zero deps.
 *
 * Al montar carga `initialHtml` (ya sanitizado por el server o el helper).
 * Al cambiar dispara `onChange` con el HTML actual. El sanitizado real se
 * hace al guardar en el padre, aquí solo devolvemos el crudo del editor
 * (los tags que produce execCommand son b/i/u de forma consistente).
 */
export function RichTextEditor({
  initialHtml = "",
  onChange,
  placeholder = "Escribe algo…",
  minHeight = 100,
  autoFocus = false,
}: {
  initialHtml?: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState({ bold: false, italic: false, underline: false });

  // Hidratar el contenido inicial una sola vez (no en cada render — si
  // React actualizara el innerHTML machacaria la caret position).
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== initialHtml) {
      ref.current.innerHTML = initialHtml;
    }
    if (autoFocus) ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refreshActive() {
    if (typeof document === "undefined") return;
    setActive({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
    });
  }

  function cmd(name: "bold" | "italic" | "underline") {
    document.execCommand(name, false);
    ref.current?.focus();
    setTimeout(refreshActive, 0);
    setTimeout(handleInput, 0);
  }

  function handleInput() {
    if (ref.current) onChange(ref.current.innerHTML);
  }

  return (
    <div className="rounded-lg border" style={{ borderColor: "var(--p-border, #E5E5E5)" }}>
      <div
        className="flex items-center gap-1 px-2 py-1"
        style={{ borderBottom: "1px solid var(--p-border, #E5E5E5)" }}
      >
        <ToolbarBtn Icon={Bold} active={active.bold} onClick={() => cmd("bold")} label="Negrita" />
        <ToolbarBtn Icon={Italic} active={active.italic} onClick={() => cmd("italic")} label="Cursiva" />
        <ToolbarBtn Icon={Underline} active={active.underline} onClick={() => cmd("underline")} label="Subrayado" />
      </div>
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-label={placeholder}
        onInput={handleInput}
        onKeyUp={refreshActive}
        onMouseUp={refreshActive}
        data-placeholder={placeholder}
        className="w-full text-sm px-3 py-2 outline-none rich-text-editor"
        style={{
          minHeight,
          color: "var(--p-text, #0A0A0A)",
        }}
        suppressContentEditableWarning
      />
      <style jsx global>{`
        .rich-text-editor[contenteditable="true"]:empty::before {
          content: attr(data-placeholder);
          color: var(--p-text-faint, #A3A3A3);
          pointer-events: none;
        }
        .rich-text-editor b, .rich-text-editor strong { font-weight: 700; }
        .rich-text-editor i, .rich-text-editor em { font-style: italic; }
        .rich-text-editor u { text-decoration: underline; }
      `}</style>
    </div>
  );
}

function ToolbarBtn({
  Icon, active, onClick, label,
}: {
  Icon: typeof Bold;
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      // El mousedown por defecto quita el foco del contenteditable — lo
      // prevenimos para que el comando se aplique sobre la selección viva.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className="p-1.5 rounded transition-colors"
      style={{
        background: active ? "var(--p-accent, #0A0A0A)" : "transparent",
        color: active ? "var(--p-accent-ink, #FFFFFF)" : "var(--p-text-dim, #525252)",
      }}
    >
      <Icon size={14} />
    </button>
  );
}
