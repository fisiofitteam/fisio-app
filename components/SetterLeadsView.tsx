"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Pro = { id: string; fullName: string; role: string };

type Lead = {
  id: string;
  fullName: string;
  contactType: string;
  contactValue: string;
  aiSummary: string | null;
  callScheduledAt: string;
  closer: Pro | null;
};

const CONTACT_ICON: Record<string, string> = {
  phone: "📞",
  instagram: "📷",
  email: "✉️",
};

function formatCallDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayStart = new Date(d);
  dayStart.setHours(0, 0, 0, 0);
  const diff = Math.round((dayStart.getTime() - today.getTime()) / 86400000);
  const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  if (diff === 0) return `Hoy ${time}`;
  if (diff === 1) return `Mañana ${time}`;
  if (diff === -1) return `Ayer ${time}`;
  if (diff > 1 && diff < 7) return `${d.toLocaleDateString("es-ES", { weekday: "short" })} ${time}`;
  return `${d.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} ${time}`;
}

export function SetterLeadsView({
  activeFilter,
  counts,
  closers,
  leads,
}: {
  activeFilter: string;
  counts: Record<string, number>;
  closers: Pro[];
  leads: Lead[];
}) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);

  function switchFilter(filter: string) {
    const url = new URL(window.location.href);
    if (filter === "all") url.searchParams.delete("closer");
    else url.searchParams.set("closer", filter);
    router.push(url.pathname + url.search);
    router.refresh();
  }

  return (
    <main>
      <header className="mb-5 flex justify-between items-end flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">Llamadas agendadas</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            {leads.length} {leads.length === 1 ? "agendada" : "agendadas"} · pendientes de la llamada
          </p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn btn-primary text-sm">
          + Nueva llamada agendada
        </button>
      </header>

      {/* Tabs por closer */}
      <div className="flex gap-1 mb-4 border-b border-neutral-200 overflow-x-auto">
        <TabButton
          active={activeFilter === "all"}
          onClick={() => switchFilter("all")}
          label="Todas"
          count={counts.all ?? 0}
        />
        {closers.map((c) => (
          <TabButton
            key={c.id}
            active={activeFilter === c.id}
            onClick={() => switchFilter(c.id)}
            label={`${c.role === "ceo" ? "👑 " : "📞 "}${c.fullName.split(" ")[0]}`}
            count={counts[c.id] ?? 0}
          />
        ))}
      </div>

      <section className="card">
        {leads.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-12 italic">
            No hay llamadas agendadas en este filtro. Pulsa "+ Nueva llamada agendada" para añadir una.
          </p>
        ) : (
          <div className="divide-y divide-neutral-100">
            {leads.map((lead) => (
              <button
                key={lead.id}
                onClick={() => setEditing(lead)}
                className="w-full text-left py-3 px-2 -mx-2 hover:bg-neutral-50 rounded transition-colors"
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{lead.fullName}</span>
                      <span className="text-xs text-neutral-500">
                        {CONTACT_ICON[lead.contactType] ?? "·"} {lead.contactValue}
                      </span>
                    </div>
                    {lead.aiSummary && (
                      <p className="text-xs text-neutral-600 italic mt-1 line-clamp-2">
                        "{lead.aiSummary}"
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs font-medium text-blue-700">
                      📅 {formatCallDate(lead.callScheduledAt)}
                    </div>
                    {lead.closer && (
                      <div className="text-[11px] text-neutral-500 mt-1">
                        → {lead.closer.fullName.split(" ")[0]}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {(showNew || editing) && (
        <SetterLeadModal
          editingLead={editing}
          closers={closers}
          onClose={() => { setShowNew(false); setEditing(null); }}
          onSaved={() => {
            setShowNew(false);
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

function TabButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
        active ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"
      }`}
    >
      <span>{label}</span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"}`}>
        {count}
      </span>
    </button>
  );
}

function SetterLeadModal({
  editingLead,
  closers,
  onClose,
  onSaved,
}: {
  editingLead: Lead | null;
  closers: Pro[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!editingLead;

  const [fullName, setFullName] = useState(editingLead?.fullName ?? "");
  const [contactType, setContactType] = useState(editingLead?.contactType ?? "phone");
  const [contactValue, setContactValue] = useState(editingLead?.contactValue ?? "");
  const [aiSummary, setAiSummary] = useState(editingLead?.aiSummary ?? "");
  const [callScheduledAt, setCallScheduledAt] = useState(
    editingLead
      ? new Date(editingLead.callScheduledAt).toISOString().slice(0, 16)
      : new Date().toISOString().slice(0, 16)
  );
  const [closerId, setCloserId] = useState(editingLead?.closer?.id ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!fullName || !contactValue) return;
    setSaving(true);
    await fetch("/api/leads", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(isEdit && { id: editingLead!.id }),
        fullName,
        contactType,
        contactValue,
        aiSummary,
        callScheduledAt,
        closerId: closerId || null,
      }),
    });
    onSaved();
  }

  async function remove() {
    if (!editingLead) return;
    if (!confirm("¿Eliminar esta llamada?")) return;
    setSaving(true);
    await fetch(`/api/leads?id=${editingLead.id}`, { method: "DELETE" });
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">{isEdit ? "Editar llamada agendada" : "Nueva llamada agendada"}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Nombre completo</label>
            <input
              className="input text-sm"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ej: María García"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Contacto</label>
              <select className="input text-sm" value={contactType} onChange={(e) => setContactType(e.target.value)}>
                <option value="phone">📞 Teléfono</option>
                <option value="instagram">📷 Instagram</option>
                <option value="email">✉️ Email</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-neutral-500 block mb-1">Valor</label>
              <input
                className="input text-sm"
                value={contactValue}
                onChange={(e) => setContactValue(e.target.value)}
                placeholder={contactType === "phone" ? "+34 600 123 456" : contactType === "instagram" ? "@usuario" : "correo@ejemplo.com"}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Resumen de la conversación</label>
            <textarea
              className="input text-sm"
              rows={3}
              value={aiSummary}
              onChange={(e) => setAiSummary(e.target.value)}
              placeholder="Lo que la IA captó. Punto de dolor, urgencia, objeciones..."
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Fecha y hora de llamada</label>
              <input
                type="datetime-local"
                className="input text-sm"
                value={callScheduledAt}
                onChange={(e) => setCallScheduledAt(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Closer asignado</label>
              <select className="input text-sm" value={closerId} onChange={(e) => setCloserId(e.target.value)}>
                <option value="">— Sin asignar —</option>
                {closers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}{c.role === "ceo" ? " (CEO)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-between items-center pt-2">
            {isEdit && (
              <button onClick={remove} disabled={saving} className="text-xs text-red-600">
                🗑️ Eliminar
              </button>
            )}
            <button
              onClick={save}
              disabled={!fullName || !contactValue || saving}
              className="btn btn-primary text-sm ml-auto"
            >
              {saving ? "Guardando..." : isEdit ? "Guardar" : "Agendar llamada"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
