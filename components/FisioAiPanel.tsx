"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Save, Trash2, Settings2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Panel de Fisio IA (versión CEO-only mientras probamos).
 * - Arriba (colapsable): editor del brief que sirve como system prompt.
 * - Debajo: chat transitorio. No persistimos las conversaciones para
 *   iterar rápido en la fase de tunning del brief. Al recargar se pierde.
 */
export function FisioAiPanel({ initialBrief }: { initialBrief: string }) {
  const [brief, setBrief] = useState(initialBrief);
  const [briefSaved, setBriefSaved] = useState(initialBrief);
  const [briefOpen, setBriefOpen] = useState(initialBrief.trim().length === 0);
  const [savingBrief, setSavingBrief] = useState(false);
  const [briefFeedback, setBriefFeedback] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function saveBrief() {
    setSavingBrief(true);
    setBriefFeedback(null);
    try {
      const res = await fetch("/api/fisio-ai/brief", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: brief }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Error");
      setBriefSaved(brief);
      setBriefFeedback("✓ Brief guardado");
      setTimeout(() => setBriefFeedback(null), 2000);
    } catch (e: any) {
      setBriefFeedback(e?.message || "No se pudo guardar");
    }
    setSavingBrief(false);
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setChatError(null);
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setSending(true);
    try {
      const res = await fetch("/api/fisio-ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error");
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch (e: any) {
      setChatError(e?.message || "Error de red");
    }
    setSending(false);
  }

  function clearChat() {
    if (messages.length === 0) return;
    if (!confirm("¿Vaciar la conversación actual?")) return;
    setMessages([]);
    setChatError(null);
  }

  const briefDirty = brief !== briefSaved;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Brief editor */}
      <section className="card">
        <button
          type="button"
          onClick={() => setBriefOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <Settings2 size={16} className="text-neutral-500" />
            <h2 className="font-medium text-sm">Brief del agente (system prompt)</h2>
            {briefDirty && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                sin guardar
              </span>
            )}
          </div>
          {briefOpen ? <ChevronUp size={16} className="text-neutral-500" /> : <ChevronDown size={16} className="text-neutral-500" />}
        </button>
        {briefOpen && (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-neutral-500">
              Aquí defines qué es y cómo actúa Fisio IA. Se envía como system prompt en cada
              conversación. Cambios se guardan al pulsar el botón.
            </p>
            <textarea
              className="input text-sm font-mono"
              rows={12}
              placeholder="Ej: Eres Fisio IA, asistente para el equipo de FisioFit. Ayudas a preparar llamadas de optimización, resolver casos de pacientes difíciles..."
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
            />
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs text-neutral-500">
                {briefFeedback}
              </span>
              <button
                onClick={saveBrief}
                disabled={savingBrief || !briefDirty}
                className="btn btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingBrief ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {savingBrief ? "Guardando..." : "Guardar brief"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Chat */}
      <section className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-sm">Conversación</h2>
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="text-xs text-neutral-500 hover:text-red-600 inline-flex items-center gap-1"
            >
              <Trash2 size={12} /> Vaciar
            </button>
          )}
        </div>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {messages.length === 0 && !sending && (
            <div className="text-center py-10 text-sm text-neutral-500">
              <p>Empieza escribiendo algo abajo.</p>
              <p className="text-xs mt-1">Ideas: "prepárame la llamada de renovación de X paciente", "ayúdame a redactar un mensaje para un cliente que quiere darse de baja", etc.</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`rounded-lg p-3 text-sm ${
                m.role === "user"
                  ? "bg-neutral-900 text-white ml-8"
                  : "bg-neutral-100 text-neutral-900 mr-8"
              }`}
            >
              <div className="text-[10px] uppercase tracking-wider font-bold opacity-60 mb-1">
                {m.role === "user" ? "Tú" : "Fisio IA"}
              </div>
              <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
            </div>
          ))}
          {sending && (
            <div className="rounded-lg p-3 text-sm bg-neutral-100 text-neutral-500 mr-8 inline-flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Pensando…
            </div>
          )}
          {chatError && (
            <div className="rounded-lg p-3 text-sm bg-red-50 border border-red-200 text-red-800">
              ❌ {chatError}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mt-3 flex items-end gap-2">
          <textarea
            className="input text-sm flex-1"
            rows={2}
            placeholder="Escribe tu pregunta…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            className="btn btn-primary p-3 disabled:opacity-50"
            title="Enviar (⌘/Ctrl + Enter)"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        <p className="text-[10px] text-neutral-400 mt-1">⌘/Ctrl + Enter para enviar</p>
      </section>
    </div>
  );
}
