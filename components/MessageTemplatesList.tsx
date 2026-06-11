"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ACTION_TYPE_LABELS, ACTION_TYPES_IMPLEMENTED, ROLE_LABELS, type ResourceRole, type TemplateActionType } from "@/lib/resource-roles";

type Message = {
  id: string;
  name: string;
  category: string;
  targetRoles: ResourceRole[];
  body: string;
  actionType: TemplateActionType | null;
};

const CATEGORIES = ["Bienvenida", "Seguimiento", "Renovación", "Alta", "Otros"];

export function MessageTemplatesList({
  messages,
  canManage,
  assignableRoles,
  defaultRoles,
}: {
  messages: Message[];
  canManage: boolean;
  assignableRoles: ResourceRole[];
  defaultRoles: ResourceRole[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Message | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Agrupamos siempre por categoría. El rol/roles se muestran como badges
  // dentro de cada tarjeta para quien pueda gestionar.
  const byCat: Record<string, Message[]> = {};
  for (const m of messages) {
    (byCat[m.category] ||= []).push(m);
  }
  const groups = Object.entries(byCat);

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
        {canManage && (
          <button onClick={() => setShowNew(true)} className="btn btn-primary text-xs">+ Nuevo mensaje</button>
        )}
      </div>

      {messages.length === 0 && (
        <p className="text-sm text-neutral-500 text-center py-12">No hay mensajes todavía.</p>
      )}

      {groups.map(([cat, list]) => (
        <section key={cat} className="mb-5">
          <h2 className="text-xs uppercase text-neutral-500 font-medium mb-2">{cat}</h2>
          <div className="space-y-2">
            {list.map((m) => (
              <div key={m.id} className="card !p-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <div className="font-medium text-sm">{m.name}</div>
                      {m.actionType && (
                        <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">
                          📤 {ACTION_TYPE_LABELS[m.actionType]}
                        </span>
                      )}
                      {canManage && m.targetRoles.map((r) => (
                        <span key={r} className="text-[10px] uppercase tracking-wide bg-neutral-100 text-neutral-600 rounded px-1.5 py-0.5">
                          {ROLE_LABELS[r]}
                        </span>
                      ))}
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
                    {canManage && (
                      <>
                        <button onClick={() => setEditing(m)} className="text-xs text-neutral-500">Editar</button>
                        <button onClick={() => remove(m.id)} className="text-xs text-red-600">Eliminar</button>
                      </>
                    )}
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
          assignableRoles={assignableRoles}
          defaultRoles={defaultRoles}
          onClose={() => { setShowNew(false); setEditing(null); }}
          onSaved={() => { setShowNew(false); setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

// Variables disponibles para interpolar en el cuerpo, según el actionType de la
// plantilla. Mostramos chuletas al editar para que el CEO sepa qué puede usar.
const BASE_VARS: { token: string; desc: string }[] = [
  { token: "{nombre}", desc: "Nombre del lead/paciente" },
  { token: "{closer}", desc: "Nombre del closer logueado" },
  { token: "{closer.intro}", desc: "Presentación del closer (editable en Equipo)" },
];

const CASE_VARS: { token: string; desc: string }[] = [
  { token: "{caso.nombre}", desc: "Nombre del paciente del caso" },
  { token: "{caso.lesion}", desc: "Lesión / motivo" },
  { token: "{caso.link}", desc: "Link de YouTube del vídeo" },
];

const REMINDER_VARS: { token: string; desc: string }[] = [
  { token: "{cita.fecha}", desc: "Fecha de la llamada (ej. 'mañana, martes 5 de junio')" },
  { token: "{cita.hora}", desc: "Hora de la llamada (ej. '17:30')" },
  { token: "{cita.meet}", desc: "URL de Google Meet del lead (si la tiene)" },
];

const AGENDA_VARS: { token: string; desc: string }[] = [
  { token: "{agenda.link}", desc: "Link a la agenda (de momento sustituye por '[Enlace agenda]' a falta de configurar)" },
];

function MessageModal({
  message,
  assignableRoles,
  defaultRoles,
  onClose,
  onSaved,
}: {
  message: Message | null;
  assignableRoles: ResourceRole[];
  defaultRoles: ResourceRole[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(message?.name ?? "");
  const [category, setCategory] = useState(message?.category ?? "Otros");
  const initialRoles = (message?.targetRoles ?? defaultRoles).filter((r) => assignableRoles.includes(r));
  const [targetRoles, setTargetRoles] = useState<ResourceRole[]>(
    initialRoles.length ? initialRoles : (assignableRoles[0] ? [assignableRoles[0]] : []),
  );
  const [actionType, setActionType] = useState<TemplateActionType | "">(message?.actionType ?? "");
  const [body, setBody] = useState(message?.body ?? "");
  const [saving, setSaving] = useState(false);

  function toggleRole(r: ResourceRole) {
    setTargetRoles((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);
  }

  async function save() {
    if (!name.trim() || !body.trim() || targetRoles.length === 0) return;
    setSaving(true);
    const method = message ? "PATCH" : "POST";
    const payload = JSON.stringify({
      ...(message && { id: message.id }),
      name,
      category,
      targetRoles,
      body,
      actionType: actionType || null,
    });
    await fetch("/api/messages", { method, headers: { "Content-Type": "application/json" }, body: payload });
    onSaved();
  }

  const actionVars =
    actionType === "send_success_case" ? CASE_VARS :
    actionType === "send_meeting_reminder" ? REMINDER_VARS :
    actionType === "send_agenda" ? AGENDA_VARS :
    [];

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
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Categoría</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Roles destinatarios (uno o varios)</label>
            <div className="flex flex-wrap gap-1.5">
              {assignableRoles.map((r) => {
                const checked = targetRoles.includes(r);
                return (
                  <button
                    type="button"
                    key={r}
                    onClick={() => toggleRole(r)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                      checked
                        ? "bg-neutral-900 text-white border-neutral-900"
                        : "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50"
                    }`}
                  >
                    {checked && "✓ "}{ROLE_LABELS[r]}
                  </button>
                );
              })}
            </div>
            {targetRoles.length === 0 && (
              <p className="text-[11px] text-red-600 mt-1">Selecciona al menos un rol.</p>
            )}
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">
              Acción al pulsar "Enviar" desde una tarea
            </label>
            <select
              className="input"
              value={actionType}
              onChange={(e) => setActionType(e.target.value as TemplateActionType | "")}
            >
              <option value="">Ninguna (copia al portapapeles)</option>
              {ACTION_TYPES_IMPLEMENTED.map((a) => (
                <option key={a} value={a}>{ACTION_TYPE_LABELS[a]}</option>
              ))}
            </select>
            <p className="text-[11px] text-neutral-400 mt-1">
              Si eliges una acción, la plantilla se usa desde tareas y abre WhatsApp con el texto interpolado.
            </p>
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Contenido</label>
            <textarea
              className="input"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escribe el mensaje y usa las variables de abajo donde toque."
            />
          </div>
          <div className="bg-neutral-50 rounded-lg p-2.5 text-[11px] text-neutral-600 space-y-1">
            <div className="font-medium text-neutral-700 mb-1">Variables disponibles:</div>
            {BASE_VARS.map((v) => (
              <div key={v.token}>
                <code className="bg-white px-1 rounded">{v.token}</code> — {v.desc}
              </div>
            ))}
            {actionVars.map((v) => (
              <div key={v.token}>
                <code className="bg-white px-1 rounded">{v.token}</code> — {v.desc}
              </div>
            ))}
          </div>
          <button
            onClick={save}
            disabled={!name.trim() || !body.trim() || targetRoles.length === 0 || saving}
            className="btn btn-primary w-full"
          >
            {saving ? "Guardando..." : message ? "Guardar cambios" : "Crear mensaje"}
          </button>
        </div>
      </div>
    </div>
  );
}
