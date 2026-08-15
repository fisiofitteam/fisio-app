"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Save, Trash2, Settings2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { FisioAiPatientPicker, type PickedPatient } from "@/components/FisioAiPatientPicker";
import { TEAM_ROLES, type TeamRole } from "@/lib/fisio-ai-agents";

type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Chat con UN agente concreto de Fisio IA. Recibe el `slug` (para llamar
 * al endpoint de chat con el agente correcto) y el brief inicial. El
 * editor del brief está colapsable arriba — solo CEO por ahora, pero la
 * UI ya está preparada para más adelante si abrimos a más roles.
 *
 * El chat es transitorio: no persistimos conversaciones mientras iteramos
 * los briefs. Al recargar se pierde.
 */
export function FisioAiAgentChat({
  slug,
  initialBrief,
  initialName,
  initialDescription,
  initialIcon,
  usesPatientContext,
  isCeo = false,
  initialAllowedRoles = null,
}: {
  slug: string;
  initialBrief: string;
  initialName: string;
  initialDescription: string;
  initialIcon: string;
  usesPatientContext: boolean;
  /** Solo el CEO puede editar el agente + gestionar acceso. */
  isCeo?: boolean;
  /** Lista de roles con acceso; null = todos. Solo se muestra al CEO. */
  initialAllowedRoles?: TeamRole[] | null;
}) {
  const [brief, setBrief] = useState(initialBrief);
  const [briefSaved, setBriefSaved] = useState(initialBrief);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [icon, setIcon] = useState(initialIcon);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [patient, setPatient] = useState<PickedPatient | null>(null);
  const [usesPatient, setUsesPatient] = useState(usesPatientContext);

  // Acceso por rol: null = público. El CEO edita la lista abajo del editor.
  const [allowedRoles, setAllowedRoles] = useState<TeamRole[] | null>(initialAllowedRoles);
  const rolesJsonSaved = JSON.stringify(initialAllowedRoles ?? null);
  const rolesJsonCurrent = JSON.stringify(allowedRoles ?? null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function saveAgent() {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/fisio-ai/agents/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief,
          name,
          description,
          icon,
          usesPatientContext: usesPatient,
          allowedRoles: allowedRoles && allowedRoles.length > 0 ? allowedRoles : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Error");
      setBriefSaved(brief);
      setFeedback("✓ Guardado");
      setTimeout(() => setFeedback(null), 2000);
    } catch (e: any) {
      setFeedback(e?.message || "No se pudo guardar");
    }
    setSaving(false);
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
        body: JSON.stringify({
          agentSlug: slug,
          messages: next,
          patientId: usesPatient ? (patient?.id ?? null) : null,
        }),
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

  const briefDirty = brief !== briefSaved || name !== initialName || description !== initialDescription || icon !== initialIcon || usesPatient !== usesPatientContext || rolesJsonCurrent !== rolesJsonSaved;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Editor del agente (solo CEO) — nombre + descripcion + icono + brief + acceso */}
      {isCeo && (
      <section className="card">
        <button
          type="button"
          onClick={() => setEditorOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <Settings2 size={16} className="text-neutral-500" />
            <h2 className="font-medium text-sm">Editar agente</h2>
            {briefDirty && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                sin guardar
              </span>
            )}
          </div>
          {editorOpen ? <ChevronUp size={16} className="text-neutral-500" /> : <ChevronDown size={16} className="text-neutral-500" />}
        </button>
        {editorOpen && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-[80px_1fr] gap-3 items-start">
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Icono</label>
                <input
                  className="input text-2xl text-center"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  maxLength={4}
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Nombre</label>
                <input
                  className="input text-sm font-medium"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Descripción corta</label>
              <input
                className="input text-sm"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Frase que se ve debajo del nombre en la tarjeta"
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={usesPatient}
                onChange={(e) => setUsesPatient(e.target.checked)}
                className="w-4 h-4 accent-neutral-900"
              />
              <span>Este agente puede leer la ficha completa de un paciente</span>
            </label>
            <p className="text-[11px] text-neutral-500 -mt-2">
              Al activar, el chat mostrará un buscador con lupa. Al elegir un paciente, se adjuntará su ficha (anamnesis, adaptaciones, PRs, últimas sesiones y métricas) al brief.
            </p>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">
                Brief (system prompt del agente)
              </label>
              <textarea
                className="input text-sm font-mono"
                rows={14}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
              />
            </div>
            {/* Permisos por rol: quién ve este agente en la landing */}
            <div className="rounded-lg p-3" style={{ background: "#F5F3FF", border: "1px solid #DDD6FE" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold" style={{ color: "#4C1D95" }}>👥 Quién puede usar este agente</span>
                <label className="flex items-center gap-1.5 text-[11px] cursor-pointer" style={{ color: "#4C1D95" }}>
                  <input
                    type="checkbox"
                    checked={allowedRoles === null}
                    onChange={(e) => setAllowedRoles(e.target.checked ? null : [])}
                    className="w-3.5 h-3.5 accent-violet-700"
                  />
                  Todos
                </label>
              </div>
              {allowedRoles !== null && (
                <div className="flex flex-wrap gap-2">
                  {TEAM_ROLES.map((r) => {
                    const active = allowedRoles.includes(r.value);
                    return (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => {
                          setAllowedRoles((prev) => {
                            const cur = prev ?? [];
                            return cur.includes(r.value) ? cur.filter((x) => x !== r.value) : [...cur, r.value];
                          });
                        }}
                        className="text-xs px-2.5 py-1 rounded-full border transition"
                        style={{
                          background: active ? "#7C3AED" : "#FFFFFF",
                          color: active ? "#FFFFFF" : "#4C1D95",
                          border: `1px solid ${active ? "#7C3AED" : "#DDD6FE"}`,
                        }}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-[10px] mt-2" style={{ color: "#5B21B6" }}>
                El CEO siempre tiene acceso. {allowedRoles === null ? "Ahora mismo lo ve todo el equipo." : `Ahora mismo solo lo ven: ${allowedRoles.length === 0 ? "solo tú (CEO)" : allowedRoles.map((v) => TEAM_ROLES.find((r) => r.value === v)?.label).filter(Boolean).join(", ")}.`}
              </p>
            </div>

            <div className="flex justify-between items-center gap-2">
              <span className="text-xs text-neutral-500">{feedback}</span>
              <button
                onClick={saveAgent}
                disabled={saving || !briefDirty}
                className="btn btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        )}
      </section>
      )}

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

        {/* Selector de paciente — solo si el agente lo admite. Al elegir,
            su ficha completa se adjunta al system prompt en cada request. */}
        {usesPatient && (
          <div className="mb-3">
            <FisioAiPatientPicker selected={patient} onChange={setPatient} />
            {patient && (
              <p className="text-[11px] text-neutral-500 mt-1.5">
                💡 Estoy leyendo la ficha completa (anamnesis, adaptaciones, PRs, últimas sesiones y métricas) para responder con contexto real de este paciente.
              </p>
            )}
          </div>
        )}

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {messages.length === 0 && !sending && (
            <div className="text-center py-10 text-sm text-neutral-500">
              <p>Empieza escribiendo abajo.</p>
              <p className="text-xs mt-1">Cuenta el caso, pega datos concretos si los tienes, y verás cómo responde este agente con su brief.</p>
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
                {m.role === "user" ? "Tú" : name}
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
