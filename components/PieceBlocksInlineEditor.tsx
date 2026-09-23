"use client";
/**
 * Editor inline del guion (blocks) de una pieza, para el dossier.
 *
 * Cada bloque tiene {label, content}. El editor:
 *  - Muestra los bloques como en el dossier (label bold + content plano).
 *  - Al hacer click sobre label o content los convierte en <input>/<textarea>.
 *  - Autosize del content.
 *  - Autosave con debounce 800ms enviando el ARRAY completo de blocks
 *    (evitamos merge de PATCH parciales — sencillez > eficiencia dado que
 *    los blocks nunca crecen a MB).
 *  - "+ Añadir bloque" al final; "×" al lado de cada bloque para borrarlo.
 *  - Al imprimir: texto plano tal cual, sin controles.
 */
import { useEffect, useRef, useState } from "react";

type Block = { label: string; content: string };

export function PieceBlocksInlineEditor({
  pieceId,
  initialBlocks,
}: {
  pieceId: string;
  initialBlocks: Block[];
}) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [saved, setSaved] = useState<Block[]>(initialBlocks);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function flush(next: Block[]) {
    if (JSON.stringify(next) === JSON.stringify(saved)) return;
    setStatus("saving");
    try {
      const r = await fetch("/api/content/pieces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pieceId, blocks: next }),
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

  function schedule(next: Block[]) {
    setBlocks(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => flush(next), 800);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function updateLabel(i: number, label: string) {
    const next = blocks.map((b, k) => (k === i ? { ...b, label } : b));
    schedule(next);
  }
  function updateContent(i: number, content: string) {
    const next = blocks.map((b, k) => (k === i ? { ...b, content } : b));
    schedule(next);
  }
  function remove(i: number) {
    const next = blocks.filter((_, k) => k !== i);
    schedule(next);
  }
  function add() {
    // Auto-label "Plano N" siguiendo la convención del marketer/reels.
    const nextIndex = blocks.length + 1;
    const next = [...blocks, { label: `Plano ${nextIndex}`, content: "" }];
    schedule(next);
  }
  function flushNow() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    flush(blocks);
  }

  return (
    <>
      {/* Print: sólo texto */}
      <div className="hidden print:block space-y-2">
        {saved.map((b, i) => (
          <div key={i} className="text-sm">
            {b.label && (
              <div className="text-[12px] font-bold uppercase tracking-wide" style={{ color: "#172554" }}>
                {b.label}
              </div>
            )}
            {b.content && <div className="text-neutral-800 whitespace-pre-wrap">{b.content}</div>}
          </div>
        ))}
      </div>

      {/* Editable en pantalla */}
      <div className="print:block space-y-2 hidden">{null}</div>
      <div className="space-y-2 print:hidden">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500">Guion</div>
          <span className="text-[9px] text-neutral-400 select-none">
            {status === "saving" && "guardando…"}
            {status === "saved" && <span className="text-emerald-600">✓ guardado</span>}
            {status === "error" && <span className="text-red-600">✕ error</span>}
          </span>
        </div>
        {blocks.length === 0 ? (
          <p className="text-xs text-neutral-400 italic">Sin guion aún.</p>
        ) : (
          blocks.map((b, i) => (
            <BlockRow
              key={i}
              block={b}
              onLabel={(v) => updateLabel(i, v)}
              onContent={(v) => updateContent(i, v)}
              onRemove={() => remove(i)}
              onBlur={flushNow}
            />
          ))
        )}
        <button
          type="button"
          onClick={add}
          className="text-[11px] text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          + Añadir bloque
        </button>
      </div>
    </>
  );
}

function BlockRow({
  block,
  onLabel,
  onContent,
  onRemove,
  onBlur,
}: {
  block: Block;
  onLabel: (v: string) => void;
  onContent: (v: string) => void;
  onRemove: () => void;
  onBlur: () => void;
}) {
  const ta = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = el.scrollHeight + "px";
  }, [block.content]);

  return (
    <div className="group relative pl-2 border-l-2 border-transparent hover:border-neutral-200 transition-colors">
      <div className="flex items-center gap-2">
        <input
          value={block.label}
          onChange={(e) => onLabel(e.target.value)}
          onBlur={onBlur}
          placeholder="Etiqueta (Plano 1, hook…)"
          className="text-[12px] font-bold uppercase tracking-wide bg-transparent border-none focus:outline-none focus:bg-neutral-50 rounded px-1 -mx-1 hover:bg-neutral-50/60 flex-1 min-w-0"
          style={{ color: "#172554" }}
        />
        <button
          type="button"
          onClick={() => {
            if (confirm("¿Borrar este bloque del guion?")) onRemove();
          }}
          className="text-[10px] text-neutral-300 opacity-0 group-hover:opacity-100 hover:text-red-600 transition-all px-1"
          title="Borrar bloque"
        >
          ×
        </button>
      </div>
      <textarea
        ref={ta}
        value={block.content}
        onChange={(e) => onContent(e.target.value)}
        onBlur={onBlur}
        placeholder="Idea del plano…"
        rows={1}
        className="text-sm text-neutral-800 whitespace-pre-wrap bg-transparent resize-none focus:outline-none focus:bg-neutral-50 rounded px-1 -mx-1 hover:bg-neutral-50/60 w-full"
      />
    </div>
  );
}
