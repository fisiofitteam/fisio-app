"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

type Member = { id: string; fullName: string; role: string };

type Channel = {
  id: string;
  kind: "public" | "private" | "dm";
  name: string | null;
  description: string | null;
  emoji: string | null;
  lastMessageAt: string | null;
  unread: boolean;
  dmOther?: { id: string; fullName: string; role: string } | null;
};

type Channels = {
  publicChannels: Channel[];
  privateChannels: Channel[];
  dms: Channel[];
};

type Message = {
  id: string;
  authorId: string | null;
  authorName: string;
  body: string;
  mentions: string[];
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
};

const POLL_MS = 20000;

const ROLE_LABEL: Record<string, string> = {
  ceo: "CEO",
  head_success: "Head-success",
  fisio: "Fisio",
  setter: "Setter",
  closer: "Closer",
};

export function ChatView({
  currentUser,
  canCreate,
  teamMembers,
  initialChannelId,
}: {
  currentUser: Member;
  canCreate: boolean;
  teamMembers: Member[];
  initialChannelId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/fisio/chat";
  const searchParams = useSearchParams();

  const [channels, setChannels] = useState<Channels>({ publicChannels: [], privateChannels: [], dms: [] });
  const [activeId, setActiveId] = useState<string | null>(initialChannelId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [showNewDm, setShowNewDm] = useState(false);

  // ─── Cargar lista de canales ───
  const loadChannels = useCallback(async () => {
    const r = await fetch("/api/chat/channels", { cache: "no-store" });
    if (r.ok) setChannels(await r.json());
  }, []);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  // ─── Si no hay canal activo, elige el primer público disponible ───
  useEffect(() => {
    if (activeId) return;
    const first = channels.publicChannels[0] ?? channels.privateChannels[0] ?? channels.dms[0];
    if (first) setActiveId(first.id);
  }, [channels, activeId]);

  // ─── Sincronizar URL ?canal=... ───
  useEffect(() => {
    if (!activeId) return;
    const current = searchParams?.get("canal");
    if (current !== activeId) {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("canal", activeId);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [activeId, pathname, router, searchParams]);

  // ─── Cargar mensajes del canal activo + marcar como leído + refrescar lista ───
  const loadMessages = useCallback(async (channelId: string) => {
    setLoadingMessages(true);
    const r = await fetch(`/api/chat/channels/${channelId}/messages`, { cache: "no-store" });
    if (r.ok) {
      const data = await r.json();
      setMessages(data.messages);
    } else {
      setMessages([]);
    }
    setLoadingMessages(false);
  }, []);

  const markRead = useCallback(async (channelId: string) => {
    await fetch(`/api/chat/channels/${channelId}/read`, { method: "POST" });
    // Refresca la lista de canales para borrar el badge.
    loadChannels();
  }, [loadChannels]);

  useEffect(() => {
    if (!activeId) return;
    loadMessages(activeId);
    markRead(activeId);
  }, [activeId, loadMessages, markRead]);

  // ─── Polling: refresca mensajes y lista cada POLL_MS ───
  useEffect(() => {
    if (!activeId) return;
    const id = window.setInterval(() => {
      loadMessages(activeId);
      loadChannels();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [activeId, loadMessages, loadChannels]);

  // ─── Detalles del canal activo (para el header) ───
  const activeChannel = useMemo<Channel | null>(() => {
    if (!activeId) return null;
    return (
      channels.publicChannels.find((c) => c.id === activeId) ??
      channels.privateChannels.find((c) => c.id === activeId) ??
      channels.dms.find((c) => c.id === activeId) ??
      null
    );
  }, [channels, activeId]);

  // ─── Envío de mensaje + autocomplete de menciones ───
  async function sendMessage(body: string, mentions: string[]) {
    if (!activeId || !body.trim()) return;
    const r = await fetch(`/api/chat/channels/${activeId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, mentions }),
    });
    if (r.ok) {
      const m = await r.json();
      setMessages((prev) => [...prev, m]);
      // Refrescamos la lista para subir este canal arriba con su lastMessageAt.
      loadChannels();
    }
  }

  async function onCreateChannel(payload: { kind: "public" | "private"; name: string; description: string; emoji: string; memberIds: string[] }) {
    const r = await fetch("/api/chat/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      const { id } = await r.json();
      setShowNewChannel(false);
      await loadChannels();
      setActiveId(id);
    } else {
      const data = await r.json().catch(() => ({}));
      alert(data?.error ?? "No se ha podido crear el canal");
    }
  }

  async function onStartDm(otherId: string) {
    const r = await fetch("/api/chat/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "dm", memberIds: [otherId] }),
    });
    if (r.ok) {
      const { id } = await r.json();
      setShowNewDm(false);
      await loadChannels();
      setActiveId(id);
    }
  }

  return (
    <div className="flex flex-col md:flex-row gap-3 h-[calc(100vh-160px)] min-h-[500px]">
      {/* Sidebar de canales */}
      <aside className="w-full md:w-60 flex-shrink-0 bg-white rounded-xl border border-neutral-200 overflow-y-auto">
        <div className="p-3 border-b border-neutral-100">
          <h2 className="font-medium text-sm">💬 Chat de equipo</h2>
          <p className="text-[11px] text-neutral-500 mt-0.5">Canales, privados y DMs</p>
        </div>

        <ChannelGroup
          title="Canales"
          items={channels.publicChannels}
          activeId={activeId}
          onSelect={setActiveId}
          renderName={(c) => `# ${c.name}`}
          extraButton={canCreate ? { label: "+ Nuevo canal", onClick: () => setShowNewChannel(true) } : null}
        />

        {(channels.privateChannels.length > 0 || canCreate) && (
          <ChannelGroup
            title="Privados"
            items={channels.privateChannels}
            activeId={activeId}
            onSelect={setActiveId}
            renderName={(c) => `🔒 ${c.name}`}
          />
        )}

        <ChannelGroup
          title="Mensajes directos"
          items={channels.dms}
          activeId={activeId}
          onSelect={setActiveId}
          renderName={(c) => c.dmOther ? c.dmOther.fullName : "DM"}
          extraButton={{ label: "+ Nuevo DM", onClick: () => setShowNewDm(true) }}
        />
      </aside>

      {/* Panel principal */}
      <main className="flex-1 min-w-0 bg-white rounded-xl border border-neutral-200 flex flex-col overflow-hidden">
        {!activeChannel ? (
          <div className="flex-1 flex items-center justify-center text-sm text-neutral-400">
            Selecciona o crea un canal para empezar.
          </div>
        ) : (
          <>
            <header className="p-3 border-b border-neutral-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {activeChannel.kind === "dm"
                    ? activeChannel.dmOther?.fullName ?? "DM"
                    : `${activeChannel.kind === "private" ? "🔒" : "#"} ${activeChannel.name}`}
                </span>
                {activeChannel.kind === "dm" && activeChannel.dmOther && (
                  <span className="text-[11px] text-neutral-400">
                    {ROLE_LABEL[activeChannel.dmOther.role] ?? activeChannel.dmOther.role}
                  </span>
                )}
              </div>
              {activeChannel.description && (
                <p className="text-xs text-neutral-500 mt-0.5">{activeChannel.description}</p>
              )}
            </header>

            <MessagesList
              messages={messages}
              loading={loadingMessages}
              currentUserId={currentUser.id}
              teamMembers={teamMembers}
              currentUserName={currentUser.fullName}
            />

            <Composer
              key={activeChannel.id}
              teamMembers={teamMembers}
              onSend={sendMessage}
              placeholder={
                activeChannel.kind === "dm"
                  ? `Mensaje a ${activeChannel.dmOther?.fullName ?? "..."}`
                  : `Mensaje en #${activeChannel.name}`
              }
            />
          </>
        )}
      </main>

      {showNewChannel && (
        <NewChannelModal
          teamMembers={teamMembers}
          onClose={() => setShowNewChannel(false)}
          onCreate={onCreateChannel}
        />
      )}

      {showNewDm && (
        <NewDmModal
          teamMembers={teamMembers}
          onClose={() => setShowNewDm(false)}
          onStart={onStartDm}
        />
      )}
    </div>
  );
}

function ChannelGroup({
  title,
  items,
  activeId,
  onSelect,
  renderName,
  extraButton,
}: {
  title: string;
  items: Channel[];
  activeId: string | null;
  onSelect: (id: string) => void;
  renderName: (c: Channel) => string;
  extraButton?: { label: string; onClick: () => void } | null;
}) {
  if (items.length === 0 && !extraButton) return null;
  return (
    <div className="py-2 border-b border-neutral-100">
      <div className="px-3 text-[10px] uppercase tracking-wide text-neutral-400 font-medium mb-1">{title}</div>
      {items.map((c) => {
        const active = c.id === activeId;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`w-full text-left text-sm px-3 py-1.5 flex items-center gap-2 ${
              active ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            <span className="flex-1 truncate">{renderName(c)}</span>
            {c.unread && !active && (
              <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" aria-label="No leído" />
            )}
          </button>
        );
      })}
      {extraButton && (
        <button
          onClick={extraButton.onClick}
          className="w-full text-left text-xs px-3 py-1.5 text-neutral-500 hover:bg-neutral-50"
        >
          {extraButton.label}
        </button>
      )}
    </div>
  );
}

function MessagesList({
  messages,
  loading,
  currentUserId,
  teamMembers,
  currentUserName,
}: {
  messages: Message[];
  loading: boolean;
  currentUserId: string;
  teamMembers: Member[];
  currentUserName: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Auto-scroll al final cuando llegan mensajes nuevos.
  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages.length]);

  // Mapa para resaltar la propia mención.
  const memberById = useMemo(() => {
    const m: Record<string, Member> = {};
    for (const t of teamMembers) m[t.id] = t;
    m[currentUserId] = { id: currentUserId, fullName: currentUserName, role: "" };
    return m;
  }, [teamMembers, currentUserId, currentUserName]);

  return (
    <div ref={ref} className="flex-1 overflow-y-auto p-3 space-y-3">
      {loading && messages.length === 0 ? (
        <p className="text-xs text-neutral-400 italic text-center">Cargando mensajes…</p>
      ) : messages.length === 0 ? (
        <p className="text-xs text-neutral-400 italic text-center">Aún no hay mensajes. Sé el primero.</p>
      ) : (
        messages.map((m) => (
          <MessageRow
            key={m.id}
            message={m}
            isOwn={m.authorId === currentUserId}
            mentionsMe={m.mentions.includes(currentUserId)}
            memberById={memberById}
          />
        ))
      )}
    </div>
  );
}

function MessageRow({
  message,
  isOwn,
  mentionsMe,
  memberById,
}: {
  message: Message;
  isOwn: boolean;
  mentionsMe: boolean;
  memberById: Record<string, Member>;
}) {
  const date = new Date(message.createdAt);
  const time = date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const isDeleted = !!message.deletedAt;

  return (
    <div className={`flex flex-col gap-0.5 ${mentionsMe ? "bg-amber-50 -mx-2 px-2 py-1 rounded" : ""}`}>
      <div className="flex items-baseline gap-2">
        <span className={`text-xs font-medium ${isOwn ? "text-neutral-900" : "text-neutral-700"}`}>
          {message.authorName}
        </span>
        <span className="text-[10px] text-neutral-400">{time}</span>
        {message.editedAt && !isDeleted && (
          <span className="text-[10px] text-neutral-300">(editado)</span>
        )}
      </div>
      <div className="text-sm whitespace-pre-wrap text-neutral-800">
        {isDeleted ? (
          <em className="text-neutral-400">Mensaje eliminado</em>
        ) : (
          renderBodyWithMentions(message.body, memberById)
        )}
      </div>
    </div>
  );
}

/**
 * Resalta @firstname en el cuerpo del mensaje. No es perfecto (no usamos los IDs
 * del array `mentions` para emparejar, solo para badge de 'me han mencionado'),
 * pero da suficiente feedback visual para el MVP.
 */
function renderBodyWithMentions(body: string, memberById: Record<string, Member>) {
  // Construye un set de primeros nombres lowercase para identificarlos.
  const firstNames = new Set(Object.values(memberById).map((m) => m.fullName.split(/\s+/)[0]?.toLowerCase()).filter(Boolean));
  const parts = body.split(/(@[\p{L}\p{N}_-]+)/gu);
  return parts.map((p, i) => {
    if (p.startsWith("@")) {
      const name = p.slice(1).toLowerCase();
      if (firstNames.has(name)) {
        return <span key={i} className="bg-amber-100 text-amber-900 rounded px-1">{p}</span>;
      }
    }
    return <span key={i}>{p}</span>;
  });
}

function Composer({
  teamMembers,
  onSend,
  placeholder,
}: {
  teamMembers: Member[];
  onSend: (body: string, mentions: string[]) => void;
  placeholder: string;
}) {
  const [value, setValue] = useState("");
  const [mentionMenu, setMentionMenu] = useState<{ open: boolean; query: string; start: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Resuelve menciones del texto a IDs (busca @firstname).
  function resolveMentions(text: string): string[] {
    const tokens = Array.from(text.matchAll(/@([\p{L}\p{N}_-]+)/gu)).map((m) => m[1].toLowerCase());
    const found: string[] = [];
    for (const t of tokens) {
      const match = teamMembers.find((m) => m.fullName.split(/\s+/)[0]?.toLowerCase() === t);
      if (match && !found.includes(match.id)) found.push(match.id);
    }
    return found;
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setValue(v);
    // Detectar si el cursor está justo después de una @palabra para abrir el menú.
    const cursor = e.target.selectionStart ?? v.length;
    const before = v.slice(0, cursor);
    const m = before.match(/@([\p{L}\p{N}_-]*)$/u);
    if (m) {
      setMentionMenu({ open: true, query: m[1].toLowerCase(), start: cursor - m[1].length - 1 });
    } else {
      setMentionMenu(null);
    }
  }

  function pickMention(member: Member) {
    if (!mentionMenu || !textareaRef.current) return;
    const firstName = member.fullName.split(/\s+/)[0];
    const cursor = textareaRef.current.selectionStart ?? value.length;
    const newVal = value.slice(0, mentionMenu.start) + `@${firstName} ` + value.slice(cursor);
    setValue(newVal);
    setMentionMenu(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function send() {
    const trimmed = value.trim();
    if (!trimmed) return;
    const mentions = resolveMentions(trimmed);
    onSend(trimmed, mentions);
    setValue("");
    setMentionMenu(null);
  }

  const mentionCandidates = mentionMenu?.open
    ? teamMembers.filter((m) => {
        const fn = m.fullName.split(/\s+/)[0]?.toLowerCase() ?? "";
        return fn.startsWith(mentionMenu.query);
      }).slice(0, 6)
    : [];

  return (
    <div className="p-2 border-t border-neutral-100 flex-shrink-0 relative">
      {mentionMenu?.open && mentionCandidates.length > 0 && (
        <div className="absolute bottom-full left-2 mb-1 bg-white border border-neutral-200 rounded-lg shadow-lg min-w-[200px] py-1 z-10">
          {mentionCandidates.map((m) => (
            <button
              key={m.id}
              onClick={() => pickMention(m)}
              className="block w-full text-left text-sm px-3 py-1.5 hover:bg-neutral-100"
            >
              <span className="font-medium">@{m.fullName.split(/\s+/)[0]}</span>
              <span className="text-xs text-neutral-400 ml-2">{m.fullName}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          className="flex-1 input resize-none text-sm"
          placeholder={placeholder + " (Enter para enviar · Shift+Enter para nueva línea · @ para mencionar)"}
        />
        <button onClick={send} disabled={!value.trim()} className="btn btn-primary text-xs">
          Enviar
        </button>
      </div>
    </div>
  );
}

function NewChannelModal({
  teamMembers,
  onClose,
  onCreate,
}: {
  teamMembers: Member[];
  onClose: () => void;
  onCreate: (p: { kind: "public" | "private"; name: string; description: string; emoji: string; memberIds: string[] }) => void;
}) {
  const [kind, setKind] = useState<"public" | "private">("public");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);

  function toggle(id: string) {
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-medium">Nuevo canal</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setKind("public")}
              className={`flex-1 text-xs px-3 py-2 rounded-lg border ${
                kind === "public" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200"
              }`}
            >
              # Público
            </button>
            <button
              onClick={() => setKind("private")}
              className={`flex-1 text-xs px-3 py-2 rounded-lg border ${
                kind === "private" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200"
              }`}
            >
              🔒 Privado
            </button>
          </div>
          <div className="grid grid-cols-[60px_1fr] gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Emoji</label>
              <input className="input text-center" value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="💬" maxLength={4} />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Nombre</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="general" autoFocus />
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Descripción (opcional)</label>
            <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Para qué se usa este canal" />
          </div>
          {kind === "private" && (
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Invitados</label>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {teamMembers.map((m) => {
                  const sel = memberIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggle(m.id)}
                      className={`text-xs px-2 py-1 rounded-full border ${
                        sel ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200"
                      }`}
                    >
                      {sel && "✓ "}{m.fullName.split(" ")[0]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <button
            disabled={!name.trim()}
            onClick={() => onCreate({ kind, name: name.trim(), description: description.trim(), emoji: emoji.trim(), memberIds })}
            className="btn btn-primary w-full"
          >
            Crear canal
          </button>
        </div>
      </div>
    </div>
  );
}

function NewDmModal({
  teamMembers,
  onClose,
  onStart,
}: {
  teamMembers: Member[];
  onClose: () => void;
  onStart: (otherId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return teamMembers;
    return teamMembers.filter((m) => m.fullName.toLowerCase().includes(q));
  }, [query, teamMembers]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-sm w-full p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-medium">Iniciar mensaje directo</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <input
          className="input text-sm mb-3"
          placeholder="Buscar por nombre…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {filtered.map((m) => (
            <button
              key={m.id}
              onClick={() => onStart(m.id)}
              className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-neutral-100"
            >
              <span className="font-medium">{m.fullName}</span>
              <span className="text-xs text-neutral-400 ml-2">{ROLE_LABEL[m.role] ?? m.role}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-neutral-400 italic text-center py-4">Sin resultados.</p>
          )}
        </div>
      </div>
    </div>
  );
}
