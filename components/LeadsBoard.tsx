"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Pro = { id: string; fullName: string; role: string };

type Lead = {
  id: string;
  fullName: string;
  contactType: string;
  contactValue: string;
  aiSummary: string | null;
  callScheduledAt: string;
  status: string;
  inFollowUp: boolean;
  followUpNote: string | null;
  followUpDate: string | null;
  lostReason: string | null;
  setter: Pro | null;
  closer: Pro | null;
  convertedPatient: { id: string; fullName: string } | null;
  createdAt: string;
  decidedAt: string | null;
};

const STATUS_COLUMNS = [
  { key: "scheduled", label: "📅 Llamada agendada", color: "blue" },
  { key: "won", label: "🏆 Venta", color: "emerald" },
  { key: "lost", label: "❌ Perdido", color: "red" },
  { key: "postponed", label: "⏸ Pospuesta", color: "amber" },
] as const;

const COLUMN_BG: Record<string, string> = {
  blue: "bg-blue-50 border-blue-200",
  emerald: "bg-emerald-50 border-emerald-200",
  red: "bg-red-50 border-red-200",
  amber: "bg-amber-50 border-amber-200",
};

const LOST_REASONS = [
  { value: "precio", label: "Precio" },
  { value: "no_encaja", label: "No encaja" },
  { value: "ghosting", label: "Ghosting" },
  { value: "otro", label: "Otro" },
];

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

export function LeadsBoard({
  view,
  currentUser,
  leads,
  closers,
  setters,
  fisios,
  counts,
  totals,
}: {
  view: "pipeline" | "followup";
  currentUser: { id: string; fullName: string; role: string; canEdit: boolean };
  leads: Lead[];
  closers: Pro[];
  setters: Pro[];
  fisios: Pro[];
  counts: { pipeline: number; followup: number };
  totals: { scheduled: number; won: number; lost: number; postponed: number };
}) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [converting, setConverting] = useState<Lead | null>(null);

  function switchView(v: "pipeline" | "followup") {
    const url = new URL(window.location.href);
    if (v === "pipeline") url.searchParams.delete("view");
    else url.searchParams.set("view", v);
    router.push(url.pathname + url.search);
    router.refresh();
  }

  // Para vista pipeline, agrupar por status
  const byStatus: Record<string, Lead[]> = { scheduled: [], won: [], lost: [], postponed: [] };
  for (const l of leads) {
    if (byStatus[l.status]) byStatus[l.status].push(l);
  }

  const totalDecided = totals.won + totals.lost;
  const winRate = totalDecided > 0 ? Math.round((totals.won / totalDecided) * 100) : null;

  return (
    <main>
      <header className="mb-5 flex justify-between items-end flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">Leads</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            {currentUser.role === "closer" ? "Tus llamadas asignadas" : "Pipeline comercial"}
          </p>
        </div>
        {currentUser.canEdit && (
          <button onClick={() => setShowNew(true)} className="btn btn-primary text-xs">
            + Nuevo lead
          </button>
        )}
      </header>

      {/* KPIs */}
      {view === "pipeline" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
          <KpiCard label="Agendadas" value={totals.scheduled} accent="blue" />
          <KpiCard label="Ventas" value={totals.won} accent="emerald" />
          <KpiCard label="Perdidas" value={totals.lost} accent="red" />
          <KpiCard label="Tasa cierre" value={winRate !== null ? `${winRate}%` : "—"} />
        </div>
      )}

      {/* Tabs pipeline / follow-up */}
      <div className="flex gap-1 mb-4 border-b border-neutral-200">
        <TabButton
          active={view === "pipeline"}
          onClick={() => switchView("pipeline")}
          label="Pipeline"
          count={counts.pipeline}
        />
        <TabButton
          active={view === "followup"}
          onClick={() => switchView("followup")}
          label="Follow-up"
          count={counts.followup}
        />
      </div>

      {view === "pipeline" ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {STATUS_COLUMNS.map((col) => (
            <div key={col.key} className={`rounded-xl p-3 border ${COLUMN_BG[col.color]}`}>
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-700">{col.label}</h2>
                <span className="text-xs text-neutral-500 bg-white/60 rounded-full px-2 py-0.5">
                  {byStatus[col.key].length}
                </span>
              </div>
              <div className="space-y-2 min-h-[100px]">
                {byStatus[col.key].length === 0 ? (
                  <p className="text-xs text-neutral-400 italic text-center py-4">Vacío</p>
                ) : (
                  byStatus[col.key].map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      onClick={() => setEditing(lead)}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Vista Follow-up: tabla simple
        <div className="card">
          {leads.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-8 italic">
              No hay leads en follow-up.
            </p>
          ) : (
            <div className="space-y-2">
              {leads.map((lead) => (
                <button
                  key={lead.id}
                  onClick={() => setEditing(lead)}
                  className="w-full text-left p-3 bg-neutral-50 hover:bg-neutral-100 rounded-lg flex justify-between items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{lead.fullName}</div>
                    <div className="text-xs text-neutral-500 mt-0.5">{lead.contactValue}</div>
                    {lead.followUpNote && (
                      <div className="text-xs text-neutral-600 mt-1 italic">"{lead.followUpNote}"</div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {lead.followUpDate && (
                      <div className="text-xs font-medium text-amber-700">
                        {new Date(lead.followUpDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                      </div>
                    )}
                    {lead.closer && (
                      <div className="text-[10px] text-neutral-500 mt-0.5">→ {lead.closer.fullName.split(" ")[0]}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {(showNew || editing) && (
        <LeadModal
          editingLead={editing}
          currentUser={currentUser}
          closers={closers}
          onClose={() => { setShowNew(false); setEditing(null); }}
          onSaved={() => {
            setShowNew(false);
            setEditing(null);
            router.refresh();
          }}
          onConvert={(lead) => {
            setEditing(null);
            setConverting(lead);
          }}
        />
      )}

      {converting && (
        <ConvertModal
          lead={converting}
          fisios={fisios}
          onClose={() => setConverting(null)}
          onSaved={() => {
            setConverting(null);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: number | string; accent?: "blue" | "emerald" | "red" }) {
  const accentClass =
    accent === "blue" ? "text-blue-700"
    : accent === "emerald" ? "text-emerald-700"
    : accent === "red" ? "text-red-700"
    : "text-neutral-900";
  return (
    <div className="bg-neutral-50 rounded-lg p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${accentClass}`}>{value}</div>
    </div>
  );
}

function TabButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
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

function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 bg-white border border-neutral-200 rounded-lg hover:border-neutral-400 hover:shadow-sm transition-all"
    >
      <div className="font-medium text-sm mb-0.5">{lead.fullName}</div>
      <div className="text-[11px] text-neutral-500 mb-1.5">{lead.contactValue}</div>
      {lead.aiSummary && (
        <p className="text-[11px] text-neutral-600 italic line-clamp-2 mb-2">"{lead.aiSummary}"</p>
      )}
      <div className="flex justify-between items-center">
        <span className="text-[10px] text-neutral-600 font-medium">
          📅 {formatCallDate(lead.callScheduledAt)}
        </span>
        {lead.closer && (
          <span className="text-[10px] text-neutral-500">
            → {lead.closer.fullName.split(" ")[0]}
          </span>
        )}
      </div>
      {lead.status === "lost" && lead.lostReason && (
        <div className="text-[10px] text-red-600 mt-1.5">Razón: {lead.lostReason}</div>
      )}
      {lead.convertedPatient && (
        <Link
          href={`/fisio/paciente/${lead.convertedPatient.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-[10px] text-emerald-700 mt-1.5 block hover:underline"
        >
          → Ver ficha del paciente
        </Link>
      )}
    </button>
  );
}

// ============================================================================
// Modal de lead (crear y editar)
// ============================================================================

function LeadModal({
  editingLead,
  currentUser,
  closers,
  onClose,
  onSaved,
  onConvert,
}: {
  editingLead: Lead | null;
  currentUser: { id: string; fullName: string; role: string; canEdit: boolean };
  closers: Pro[];
  onClose: () => void;
  onSaved: () => void;
  onConvert: (lead: Lead) => void;
}) {
  const isEdit = !!editingLead;
  const isCloserView = currentUser.role === "closer";

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
  const [status, setStatus] = useState(editingLead?.status ?? "scheduled");
  const [lostReason, setLostReason] = useState(editingLead?.lostReason ?? "precio");
  const [inFollowUp, setInFollowUp] = useState(editingLead?.inFollowUp ?? false);
  const [followUpNote, setFollowUpNote] = useState(editingLead?.followUpNote ?? "");
  const [followUpDate, setFollowUpDate] = useState(
    editingLead?.followUpDate ? new Date(editingLead.followUpDate).toISOString().slice(0, 10) : ""
  );

  const [saving, setSaving] = useState(false);

  async function save() {
    if (!fullName || !contactValue) return;
    setSaving(true);
    const payload: any = isCloserView
      ? { id: editingLead!.id, status, ...(status === "lost" && { lostReason }), inFollowUp, followUpNote, followUpDate: followUpDate || null }
      : {
          ...(isEdit && { id: editingLead!.id }),
          fullName,
          contactType,
          contactValue,
          aiSummary,
          callScheduledAt,
          closerId: closerId || null,
          ...(isEdit && { status, ...(status === "lost" && { lostReason }) }),
          inFollowUp,
          followUpNote: followUpNote || null,
          followUpDate: followUpDate || null,
        };
    await fetch("/api/leads", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    onSaved();
  }

  async function remove() {
    if (!editingLead) return;
    if (!confirm("¿Eliminar este lead?")) return;
    setSaving(true);
    await fetch(`/api/leads?id=${editingLead.id}`, { method: "DELETE" });
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">{isEdit ? "Editar lead" : "Nuevo lead"}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>

        <div className="space-y-3">
          {/* Setters y managers pueden editar todos los campos */}
          {!isCloserView && (
            <>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Nombre completo</label>
                <input className="input text-sm" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ej: María García" autoFocus />
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
                <label className="text-xs text-neutral-500 block mb-1">Resumen de la conversación (de la IA setter)</label>
                <textarea
                  className="input text-sm"
                  rows={3}
                  value={aiSummary}
                  onChange={(e) => setAiSummary(e.target.value)}
                  placeholder="Lo que la IA captó de la conversación. Punto de dolor, urgencia, objeciones..."
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
                      <option key={c.id} value={c.id}>{c.fullName} {c.role === "ceo" ? "(CEO)" : ""}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {/* Closer view: solo info en lectura + cambio de status */}
          {isCloserView && (
            <div className="bg-neutral-50 rounded-lg p-3 space-y-1.5 text-sm">
              <div><span className="text-neutral-500">Nombre: </span><span className="font-medium">{editingLead!.fullName}</span></div>
              <div><span className="text-neutral-500">Contacto: </span>{editingLead!.contactValue}</div>
              <div><span className="text-neutral-500">Llamada: </span>{formatCallDate(editingLead!.callScheduledAt)}</div>
              {editingLead!.aiSummary && (
                <div className="text-xs text-neutral-600 italic mt-2 pt-2 border-t border-neutral-200">
                  "{editingLead!.aiSummary}"
                </div>
              )}
            </div>
          )}

          {/* Cambiar estado (solo si edit) */}
          {isEdit && (
            <>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Resultado de la llamada</label>
                <div className="grid grid-cols-4 gap-1">
                  {STATUS_COLUMNS.map((col) => (
                    <button
                      key={col.key}
                      type="button"
                      onClick={() => setStatus(col.key)}
                      className={`px-2 py-2 text-[11px] rounded border font-medium ${
                        status === col.key ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200"
                      }`}
                    >
                      {col.label}
                    </button>
                  ))}
                </div>
              </div>

              {status === "lost" && (
                <div>
                  <label className="text-xs text-neutral-500 block mb-1">Razón</label>
                  <select className="input text-sm" value={lostReason} onChange={(e) => setLostReason(e.target.value)}>
                    {LOST_REASONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Follow-up flag */}
              <div className="border-t border-neutral-200 pt-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={inFollowUp}
                    onChange={(e) => setInFollowUp(e.target.checked)}
                  />
                  <span>Marcar para follow-up</span>
                </label>
                {inFollowUp && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className="text-xs text-neutral-500 block mb-1">Fecha follow-up</label>
                      <input type="date" className="input text-sm" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-neutral-500 block mb-1">Nota</label>
                      <input className="input text-sm" value={followUpNote} onChange={(e) => setFollowUpNote(e.target.value)} placeholder="Volver a llamar..." />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex justify-between items-center pt-2 gap-2">
            {isEdit && currentUser.canEdit && (
              <button onClick={remove} disabled={saving} className="text-xs text-red-600">
                🗑️ Eliminar
              </button>
            )}
            <div className="flex gap-2 ml-auto">
              {isEdit && status === "won" && !editingLead!.convertedPatient && (
                <button
                  onClick={() => onConvert(editingLead!)}
                  className="btn btn-accent text-sm"
                >
                  🏆 Convertir en paciente
                </button>
              )}
              <button
                onClick={save}
                disabled={(!fullName || !contactValue) && !isCloserView || saving}
                className="btn btn-primary text-sm"
              >
                {saving ? "Guardando..." : isEdit ? "Guardar" : "Registrar lead"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Modal de conversión: lead → paciente + transacción
// ============================================================================

function ConvertModal({
  lead,
  fisios,
  onClose,
  onSaved,
}: {
  lead: Lead;
  fisios: Pro[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [assignedProfessionalId, setAssignedProfessionalId] = useState("");
  // Si el lead vino por email, lo precargamos. Si vino por phone/instagram, queda vacío para que el closer lo rellene.
  const [email, setEmail] = useState(lead.contactType === "email" ? lead.contactValue : "");
  const [phone, setPhone] = useState(lead.contactType === "phone" ? lead.contactValue : "");
  const [amountPaid, setAmountPaid] = useState("");
  const [subscriptionPeriodMonths, setSubscriptionPeriodMonths] = useState("4");
  const [programType, setProgramType] = useState("RECUPERA");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    if (!email.trim()) {
      setError("El email es obligatorio para que el paciente pueda entrar a la app");
      return;
    }
    if (!amountPaid) {
      setError("Indica el importe pagado");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/leads/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id,
        assignedProfessionalId: assignedProfessionalId || null,
        amountPaid,
        subscriptionPeriodMonths,
        programType,
        email: email.trim(),
        phone: phone.trim() || null,
      }),
    });
    if (res.ok) {
      onSaved();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se ha podido convertir el lead");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[92vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-medium">🏆 Convertir en paciente</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          <strong>{lead.fullName}</strong> se dará de alta como paciente.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Email del paciente *</label>
            <input
              type="email"
              required
              className="input text-sm w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="atleta@email.com"
            />
            <p className="text-[10px] text-neutral-500 mt-1 italic">
              {lead.contactType === "email"
                ? "Precargado desde el lead. Puedes cambiarlo si te ha dado otro al cerrar."
                : `El lead llegó por ${lead.contactType === "phone" ? "teléfono" : "Instagram"}. Pídele su email para que pueda acceder a la app.`}
            </p>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Teléfono / WhatsApp</label>
            <input
              type="tel"
              className="input text-sm w-full"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+34 600 123 456"
            />
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Fisio asignado</label>
            <select className="input text-sm w-full" value={assignedProfessionalId} onChange={(e) => setAssignedProfessionalId(e.target.value)}>
              <option value="">— Sin asignar (lo asigna luego un manager) —</option>
              {fisios.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.role === "head_success" ? "⭐ " : "🩺 "}{f.fullName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Programa contratado</label>
            <div className="flex gap-1">
              {["RECUPERA", "CONSOLIDA", "ADVANCE"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProgramType(p)}
                  className={`flex-1 text-xs px-2 py-2 rounded border font-medium ${
                    programType === p ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Duración (meses)</label>
              <select className="input text-sm w-full" value={subscriptionPeriodMonths} onChange={(e) => setSubscriptionPeriodMonths(e.target.value)}>
                <option value="1">1 mes</option>
                <option value="2">2 meses</option>
                <option value="3">3 meses</option>
                <option value="4">4 meses</option>
                <option value="6">6 meses</option>
                <option value="12">12 meses</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Importe (€) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input text-sm w-full"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>

          <p className="text-[11px] text-neutral-500 italic">
            💰 Se registra como ingreso "Nueva alta" en Finanzas · 📧 El paciente recibirá un código al entrar a la app.
          </p>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            onClick={save}
            disabled={!amountPaid || !email.trim() || saving}
            className="btn btn-accent w-full disabled:opacity-50"
          >
            {saving ? "Procesando..." : "Confirmar conversión"}
          </button>
        </div>
      </div>
    </div>
  );
}
