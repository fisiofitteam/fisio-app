"use client";

import { useEffect, useState } from "react";
import type { MarketerContext } from "@/lib/ai-marketer";

const SUGGESTED = [
  "¿Qué formato de contenido debería priorizar y por qué?",
  "Analiza mis top hooks y dime qué patrones están funcionando",
  "¿Qué zonas del cuerpo estoy tratando de menos y debería reforzar?",
  "Dame 5 ideas concretas de contenido para la próxima semana",
  "Sugiere 3 lead magnets nuevos con su palabra clave para probar",
  "Auditoría rápida: ¿qué estoy haciendo bien y qué debería cambiar?",
  "Escribe 5 hooks nuevos inspirados en los que mejor me han funcionado",
  "¿Qué KPIs estoy fallando en cumplir y qué corregir en las próximas semanas?",
];

const STORAGE_KEY = "marketerAi:lastConversation";

type Turn = {
  question: string;
  answer: string;
  meta: { model: string; inputTokens: number; outputTokens: number; elapsedMs: number };
  at: number;
};

/**
 * Panel "Marketer IA" para la página de métricas de contenido.
 * Envía la pregunta + snapshot de métricas a /api/ai/marketer y renderiza
 * la respuesta en markdown ligero (sin librería externa — parser simple).
 */
export function MarketerAiPanel({ context }: { context: MarketerContext }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastTurn, setLastTurn] = useState<Turn | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setLastTurn(JSON.parse(raw));
    } catch { /* localStorage bloqueado, no pasa nada */ }
  }, []);

  async function ask(q?: string) {
    const finalQ = (q ?? question).trim();
    if (!finalQ) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/ai/marketer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: finalQ, context }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? "Error");
      const turn: Turn = { question: finalQ, answer: d.answer, meta: d.meta, at: Date.now() };
      setLastTurn(turn);
      setQuestion("");
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(turn)); } catch {}
    } catch (e: any) {
      setErr(e?.message ?? "Error de red");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb-4 border-2" style={{ borderColor: "#DDD6FE", background: "linear-gradient(180deg, #FAF5FF 0%, #FFFFFF 60%)" }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div>
          <h2 className="text-base font-semibold">🧠 Marketer IA</h2>
          <p className="text-xs text-neutral-600 mt-0.5">
            Preguntá lo que quieras sobre tu estrategia de contenido. Lee tus métricas reales del rango activo + tu voz de marca.
          </p>
        </div>
        {lastTurn && (
          <button
            onClick={() => {
              setLastTurn(null);
              try { window.localStorage.removeItem(STORAGE_KEY); } catch {}
            }}
            className="text-[11px] text-neutral-500 hover:text-neutral-800 hover:underline"
          >
            Borrar respuesta
          </button>
        )}
      </div>

      {/* Sugerencias */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            onClick={() => ask(s)}
            disabled={busy}
            className="text-[11px] px-2 py-1 rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-50"
            title="Pregunta sugerida"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Textarea + botón */}
      <div className="flex gap-2 items-end mb-2">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          placeholder="Escribe tu pregunta o pulsa una sugerencia…"
          className="input text-sm flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ask(); }
          }}
        />
        <button
          onClick={() => ask()}
          disabled={busy || !question.trim()}
          className="text-xs font-medium px-4 py-2 rounded-lg disabled:opacity-50 whitespace-nowrap"
          style={{ background: "#7C3AED", color: "#FAFAFA" }}
        >
          {busy ? "Pensando…" : "✨ Preguntar"}
        </button>
      </div>
      <p className="text-[10px] text-neutral-400 mb-1">💡 Cmd/Ctrl + Enter para enviar</p>

      {err && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5 mb-2">
          ⚠ {err}
        </div>
      )}

      {lastTurn && (
        <div className="mt-3 rounded-lg bg-white border border-neutral-200 p-3">
          <div className="text-[11px] text-neutral-500 mb-2 flex items-center justify-between gap-2 flex-wrap">
            <span>
              <strong>Pregunta:</strong> {lastTurn.question}
            </span>
            <span className="tabular-nums">
              {lastTurn.meta.inputTokens}→{lastTurn.meta.outputTokens} tok · {(lastTurn.meta.elapsedMs / 1000).toFixed(1)}s
            </span>
          </div>
          <MarkdownLight text={lastTurn.answer} />
        </div>
      )}
    </div>
  );
}

// Parser markdown super simple: soporta ## y ### headings, viñetas -/*, **bold**,
// *italic*, `code` y párrafos. Suficiente para las respuestas de Claude sin meter
// una lib externa.
function MarkdownLight({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    // Encabezados
    if (/^###\s+/.test(line)) {
      blocks.push(<h5 key={key++} className="text-[13px] font-semibold mt-3 mb-1">{inline(line.replace(/^###\s+/, ""))}</h5>);
      i++;
      continue;
    }
    if (/^##\s+/.test(line)) {
      blocks.push(<h4 key={key++} className="text-sm font-semibold mt-3 mb-1">{inline(line.replace(/^##\s+/, ""))}</h4>);
      i++;
      continue;
    }
    if (/^#\s+/.test(line)) {
      blocks.push(<h3 key={key++} className="text-base font-semibold mt-3 mb-1">{inline(line.replace(/^#\s+/, ""))}</h3>);
      i++;
      continue;
    }
    // Viñetas: bloque contiguo
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="list-disc ml-5 my-1.5 text-xs text-neutral-800 space-y-0.5">
          {items.map((it, j) => <li key={j}>{inline(it)}</li>)}
        </ul>
      );
      continue;
    }
    // Listas numeradas
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={key++} className="list-decimal ml-5 my-1.5 text-xs text-neutral-800 space-y-0.5">
          {items.map((it, j) => <li key={j}>{inline(it)}</li>)}
        </ol>
      );
      continue;
    }
    // Línea vacía → separador
    if (line.trim() === "") {
      i++;
      continue;
    }
    // Párrafo (agrupa líneas contiguas no vacías)
    const buffer: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !/^([#\-*]|\d+\.)\s/.test(lines[i])) {
      buffer.push(lines[i]);
      i++;
    }
    blocks.push(<p key={key++} className="text-xs text-neutral-800 my-1.5 leading-relaxed">{inline(buffer.join(" "))}</p>);
  }

  return <>{blocks}</>;
}

// Renderiza inline: **bold**, *italic*, `code`.
function inline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/;
  while (true) {
    const m = rest.match(re);
    if (!m) { parts.push(rest); break; }
    const idx = m.index ?? 0;
    if (idx > 0) parts.push(rest.slice(0, idx));
    const token = m[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else {
      parts.push(<code key={key++} className="text-[11px] bg-neutral-100 px-1 py-0.5 rounded font-mono">{token.slice(1, -1)}</code>);
    }
    rest = rest.slice(idx + token.length);
  }
  return <>{parts}</>;
}
