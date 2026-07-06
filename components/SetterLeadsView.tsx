"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RescheduleLinkButton } from "@/components/RescheduleLinkButton";
import {
  datetimeLocalInputToUtcIso,
  utcIsoToDatetimeLocalInput,
  nowPlusHoursForInput,
} from "@/lib/datetime-local";

type Pro = { id: string; fullName: string; role: string };

type Lead = {
  id: string;
  fullName: string;
  contactType: string;
  contactValue: string;
  email: string | null;
  phone: string | null;
  motivo: string | null;
  tratamientosPrevios: string | null;
  impactoCrossfit: string | null;
  aiSummary: string | null;
  meetingUrl: string | null;
  source: string | null;
  aiScheduled: boolean;
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

  async function markNotified(leadId: string) {
    await fetch(`/api/leads/${leadId}/mark-setter-notified`, { method: "POST" });
    router.refresh();
  }

  async function toggleAiScheduled(leadId: string, current: boolean) {
    await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: leadId, aiScheduled: !current }),
    });
    router.refresh();
  }

  return (
    <main>
      <header className="mb-5 flex justify-between items-end flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">Llamadas pendientes</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            {leads.length} {leads.length === 1 ? "lead pendiente" : "leads pendientes"} de avisar al closer
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

      {leads.length === 0 ? (
        <section className="card">
          <p className="text-sm text-neutral-400 text-center py-12 italic">
            No hay leads pendientes de avisar. Pulsa "+ Nueva llamada agendada" para añadir uno.
          </p>
        </section>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => (
            <article key={lead.id} className="card">
              <div className="flex justify-between items-start gap-3">
                <button
                  onClick={() => setEditing(lead)}
                  className="flex-1 min-w-0 text-left -m-2 p-2 rounded hover:bg-neutral-50 transition-colors"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{lead.fullName}</span>
                    {lead.source === "landing" && (
                      <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: "#15803D", color: "#FFFFFF" }}>
                        LANDING
                      </span>
                    )}
                  </div>

                  {/* Datos de contacto siempre visibles */}
                  {(lead.email || lead.phone) ? (
                    <div className="mt-1.5 space-y-0.5">
                      {lead.phone && (
                        <div className="text-xs text-neutral-700 flex items-center gap-1.5">
                          <span>📞</span>
                          <a
                            href={`https://wa.me/${lead.phone.replace(/[^0-9+]/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="hover:underline tabular-nums"
                          >
                            {lead.phone}
                          </a>
                        </div>
                      )}
                      {lead.email && (
                        <div className="text-xs text-neutral-700 flex items-center gap-1.5">
                          <span>✉️</span>
                          <a
                            href={`mailto:${lead.email}`}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:underline truncate"
                          >
                            {lead.email}
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-neutral-600 mt-1.5">
                      {CONTACT_ICON[lead.contactType] ?? "·"} {lead.contactValue}
                    </div>
                  )}

                  {/* Cuestionario de la landing — visible directamente */}
                  {(lead.motivo || lead.tratamientosPrevios || lead.impactoCrossfit) && (
                    <div className="mt-2 rounded-lg p-2.5 space-y-1.5" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
                      {lead.motivo && (
                        <div className="text-xs">
                          <div className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "#15803D" }}>Motivo</div>
                          <div className="text-neutral-800 mt-0.5">{lead.motivo}</div>
                        </div>
                      )}
                      {lead.tratamientosPrevios && (
                        <div className="text-xs">
                          <div className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "#15803D" }}>Tratamientos previos</div>
                          <div className="text-neutral-800 mt-0.5">{lead.tratamientosPrevios}</div>
                        </div>
                      )}
                      {lead.impactoCrossfit && (
                        <div className="text-xs">
                          <div className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "#15803D" }}>Impacto CrossFit</div>
                          <div className="text-neutral-800 mt-0.5">{lead.impactoCrossfit}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {lead.aiSummary && (
                    <p className="text-xs text-neutral-600 italic mt-2">"{lead.aiSummary}"</p>
                  )}
                </button>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs font-medium text-blue-700 whitespace-nowrap">
                    📅 {formatCallDate(lead.callScheduledAt)}
                  </div>
                  {lead.closer && (
                    <div className="text-[11px] text-neutral-500 mt-1">
                      → {lead.closer.fullName.split(" ")[0]}
                    </div>
                  )}
                </div>
              </div>

              {/* Pie con acciones rápidas: marcar agendado por IA + avisado al closer */}
              <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center justify-between gap-2 flex-wrap">
                <button
                  onClick={() => toggleAiScheduled(lead.id, lead.aiScheduled)}
                  className="text-xs font-medium px-2.5 py-1 rounded-full border transition-colors"
                  style={lead.aiScheduled
                    ? { background: "#8B5CF6", color: "#FFFFFF", borderColor: "#8B5CF6" }
                    : { background: "transparent", color: "#737373", borderColor: "#D4D4D4" }}
                  title="Marca si esta llamada la agendó la IA (para métricas)"
                >
                  🤖 {lead.aiScheduled ? "Agendado por IA" : "¿Agendado por IA?"}
                </button>
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-[11px] text-neutral-500 hidden sm:inline">Cuando avises al closer →</span>
                  <button
                    onClick={() => markNotified(lead.id)}
                    className="text-xs font-medium px-3 py-1.5 rounded-md"
                    style={{ background: "#0A0A0A", color: "#FAFAFA" }}
                  >
                    ✓ Avisado
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

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
  // Teléfono y email como campos INDEPENDIENTES editables (no como un selector
  // de tipo + valor único). Si el lead viene de la landing tendrá ambos; si la
  // setter lo crea a mano y solo tiene uno, basta con rellenar el que sepa.
  const [phone, setPhone] = useState(editingLead?.phone ?? (editingLead?.contactType === "phone" ? editingLead.contactValue : "") ?? "");
  const [email, setEmail] = useState(editingLead?.email ?? (editingLead?.contactType === "email" ? editingLead.contactValue : "") ?? "");
  const [aiSummary, setAiSummary] = useState(editingLead?.aiSummary ?? "");
  const [callScheduledAt, setCallScheduledAt] = useState(
    editingLead
      ? utcIsoToDatetimeLocalInput(editingLead.callScheduledAt)
      : nowPlusHoursForInput(0)
  );
  const [closerId, setCloserId] = useState(editingLead?.closer?.id ?? "");
  const [aiScheduled, setAiScheduled] = useState(editingLead?.aiScheduled ?? false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!fullName || (!phone.trim() && !email.trim())) return;
    setSaving(true);
    // Derivamos contactType/contactValue para compat (la API los sigue requiriendo)
    const trimmedPhone = phone.trim();
    const trimmedEmail = email.trim();
    const contactType = trimmedPhone ? "phone" : "email";
    const contactValue = trimmedPhone || trimmedEmail;
    await fetch("/api/leads", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(isEdit && { id: editingLead!.id }),
        fullName,
        contactType,
        contactValue,
        phone: trimmedPhone || null,
        email: trimmedEmail || null,
        aiSummary,
        callScheduledAt: datetimeLocalInputToUtcIso(callScheduledAt),
        closerId: closerId || null,
        aiScheduled,
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
          <h3 className="font-medium">{isEdit ? `Llamada · ${editingLead!.fullName}` : "Nueva llamada agendada"}</h3>
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

          {/* Teléfono y Email — INDEPENDIENTES y editables, como en el modal del closer */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">📞 Teléfono</label>
              <input
                type="tel"
                className="input text-sm"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+34 600 000 000"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">✉️ Email</label>
              <input
                type="email"
                className="input text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
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

          {/* Cuestionario rellenado en la landing (solo lectura) */}
          {editingLead && (editingLead.motivo || editingLead.tratamientosPrevios || editingLead.impactoCrossfit || editingLead.meetingUrl) && (
            <div className="rounded-lg p-3" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: "#15803D", color: "#FFFFFF" }}>
                  LANDING
                </span>
                <span className="text-xs font-medium" style={{ color: "#065F46" }}>
                  Cuestionario rellenado por el lead
                </span>
              </div>
              {editingLead.meetingUrl && (
                <div className="text-xs mb-2">
                  <a href={editingLead.meetingUrl} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "#065F46" }}>
                    🔗 Abrir Google Meet
                  </a>
                </div>
              )}
              {editingLead.motivo && (
                <div className="text-xs mb-2">
                  <strong>Motivo:</strong>
                  <p className="whitespace-pre-wrap mt-0.5" style={{ color: "#1F2937" }}>{editingLead.motivo}</p>
                </div>
              )}
              {editingLead.tratamientosPrevios && (
                <div className="text-xs mb-2">
                  <strong>Tratamientos previos:</strong>
                  <p className="whitespace-pre-wrap mt-0.5" style={{ color: "#1F2937" }}>{editingLead.tratamientosPrevios}</p>
                </div>
              )}
              {editingLead.impactoCrossfit && (
                <div className="text-xs">
                  <strong>Impacto en CrossFit:</strong>
                  <p className="whitespace-pre-wrap mt-0.5" style={{ color: "#1F2937" }}>{editingLead.impactoCrossfit}</p>
                </div>
              )}
            </div>
          )}

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

          {/* Marcar si esta llamada la agendó la IA (para métricas a futuro) */}
          <label className="flex items-center gap-2 text-sm cursor-pointer pt-2">
            <input
              type="checkbox"
              checked={aiScheduled}
              onChange={(e) => setAiScheduled(e.target.checked)}
              className="w-4 h-4 accent-violet-600"
            />
            <span>🤖 Agendado por IA</span>
          </label>

          <div className="flex justify-between items-center pt-2 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              {isEdit && (
                <button onClick={remove} disabled={saving} className="text-xs text-red-600">
                  🗑️ Eliminar
                </button>
              )}
              {/* La setter solo ve leads "scheduled" → siempre tiene sentido el enlace */}
              {isEdit && (
                <RescheduleLinkButton leadId={editingLead!.id} leadStatus="scheduled" />
              )}
            </div>
            <button
              onClick={save}
              disabled={!fullName || (!phone.trim() && !email.trim()) || saving}
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
