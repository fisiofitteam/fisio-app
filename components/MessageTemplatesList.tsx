"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Message = {
  id: string;
  name: string;
  category: string;
  body: string;
};

const CATEGORIES = ["Bienvenida", "Seguimiento", "Renovación", "Alta", "Otros"];

export function MessageTemplatesList({ messages }: { messages: Message[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Message | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const byCat: Record<string, Message[]> = {};
  for (const m of messages) {
    if (!byCat[m.category]) byCat[m.category] = [];
    byCat[m.category].push(m);
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar este mensaje?")) return;
    await fetch(`/api/messages?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  function copyToClipboard(body: string, id: string) {
    navigator.clipboard.writeText(body);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-neutral-500">{messages.length} plantilla{messages.length !== 1 && "s"}</p>
        <button onClick={() => setShowNew(true)} className="btn btn-primary text-xs">+ Nuevo mensaje</button>
      </div>

      {messages.length === 0 && (
        <p className="text-sm text-neutral-500 text-center py-12">No hay mensajes todavía.</p>
      )}

      {Object.entries(byCat).map(([cat, list]) => (
        <section key={cat} className="mb-5">
          <h2 className="text-xs uppercase text-neutral-500 font-medium mb-2">{cat}</h2>
          <div className="space-y-2">
            {list.map((m) => (
              <div key={m.id} className="card !p-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{m.name}</div>
                    <div className="text-xs text-neutral-600 mt-1 whitespace-pre-wrap">{m.body}</div>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      onClick={() => copyToClipboard(m.body, m.id)}
                      className="text-xs px-2 py-1 bg-neutral-100 rounded hover:bg-neutral-200"
                    >
                      {copied === m.id ? "✓ Copiado" : "Copiar"}
                    </button>
                    <button onClick={() => setEditing(m)} className="text-xs text-neutral-500">Editar</button>
                    <button onClick={() => remove(m.id)} className="text-xs text-red-600">Eliminar</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {(showNew || editing) && (
        <MessageModal
          message={editing}
          onClose={() => { setShowNew(false); setEditing(null); }}
          onSaved={() => { setShowNew(false); setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function MessageModal({ message, onClose, onSaved }: { message: Message | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(message?.name ?? "");
  const [category, setCategory] = useState(message?.category ?? "Otros");
  const [body, setBody] = useState(message?.body ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || !body.trim()) return;
    setSaving(true);
    const method = message ? "PATCH" : "POST";
    const payload = JSON.stringify({ ...(message && { id: message.id }), name, category, body });
    await fetch("/api/messages", { method, headers: { "Content-Type": "application/json" }, body: payload });
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">{message ? "Editar mensaje" : "Nuevo mensaje"}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Nombre</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Categoría</label>
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Contenido</label>
            <textarea
              className="input"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Puedes usar variables como {nombre} o {dias_renovacion} que rellenarás manualmente al usar el mensaje."
            />
          </div>
          <p className="text-xs text-neutral-400">
            Las variables como {`{nombre}`} se sustituirán manualmente al copiar el mensaje. Más adelante haremos sustitución automática.
          </p>
          <button onClick={save} disabled={!name.trim() || !body.trim() || saving} className="btn btn-primary w-full">
            {saving ? "Guardando..." : message ? "Guardar cambios" : "Crear mensaje"}
          </button>
        </div>
      </div>
    </div>
  );
}
