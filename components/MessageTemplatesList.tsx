"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABELS, type ResourceRole } from "./ResourceRoleTabs";

type Message = {
  id: string;
  name: string;
  category: string;
  targetRole: ResourceRole;
  body: string;
};

const CATEGORIES = ["Bienvenida", "Seguimiento", "Renovación", "Alta", "Otros"];
const ROLE_OPTIONS: ResourceRole[] = ["ceo", "head_success", "fisio", "setter", "closer"];

export function MessageTemplatesList({
  messages,
  isCeo,
  defaultRole,
}: {
  messages: Message[];
  isCeo: boolean;
  defaultRole: ResourceRole;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Message | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Cuando el CEO ve "Todos", agrupamos primero por rol y luego por categoría.
  // Cuando el filtro es un solo rol (CEO viendo un tab concreto, o no-CEO), agrupamos solo por categoría.
  const showRoleGroup = isCeo && new Set(messages.map((m) => m.targetRole)).size > 1;

  type Group = { key: string; label: string; items: Message[] };
  const groups: Group[] = [];

  if (showRoleGroup) {
    const byRole: Record<string, Message[]> = {};
    for (const m of messages) {
      (byRole[m.targetRole] ||= []).push(m);
    }
    for (const r of ROLE_OPTIONS) {
      if (byRole[r]?.length) {
        groups.push({ key: r, label: ROLE_LABELS[r], items: byRole[r] });
      }
    }
  } else {
    const byCat: Record<string, Message[]> = {};
    for (const m of messages) {
      (byCat[m.category] ||= []).push(m);
    }
    for (const c of Object.keys(byCat)) {
      groups.push({ key: c, label: c, items: byCat[c] });
    }
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

      {groups.map((g) => (
        <section key={g.key} className="mb-5">
          <h2 className="text-xs uppercase text-neutral-500 font-medium mb-2">{g.label}</h2>
          <div className="space-y-2">
            {g.items.map((m) => (
              <div key={m.id} className="card !p-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-medium text-sm">{m.name}</div>
                      {/* Cuando agrupamos por rol no repetimos el rol en cada tarjeta; al agrupar por categoría sí lo mostramos. */}
                      {!showRoleGroup && isCeo && (
                        <span className="text-[10px] uppercase tracking-wide bg-neutral-100 text-neutral-600 rounded px-1.5 py-0.5">
                          {ROLE_LABELS[m.targetRole]}
                        </span>
                      )}
                      {showRoleGroup && (
                        <span className="text-[10px] uppercase tracking-wide bg-neutral-100 text-neutral-600 rounded px-1.5 py-0.5">
                          {m.category}
                        </span>
                      )}
                    </div>
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
          isCeo={isCeo}
          defaultRole={defaultRole}
          onClose={() => { setShowNew(false); setEditing(null); }}
          onSaved={() => { setShowNew(false); setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function MessageModal({
  message,
  isCeo,
  defaultRole,
  onClose,
  onSaved,
}: {
  message: Message | null;
  isCeo: boolean;
  defaultRole: ResourceRole;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(message?.name ?? "");
  const [category, setCategory] = useState(message?.category ?? "Otros");
  const [targetRole, setTargetRole] = useState<ResourceRole>(message?.targetRole ?? defaultRole);
  const [body, setBody] = useState(message?.body ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || !body.trim()) return;
    setSaving(true);
    const method = message ? "PATCH" : "POST";
    const payload = JSON.stringify({ ...(message && { id: message.id }), name, category, targetRole, body });
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
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Nombre</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Categoría</label>
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">
                Rol {isCeo ? "" : "(solo CEO)"}
              </label>
              <select
                className="input"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value as ResourceRole)}
                disabled={!isCeo}
              >
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
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
