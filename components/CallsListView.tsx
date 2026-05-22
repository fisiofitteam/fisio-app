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
  decidedAt: string | null;
};

const STATUS_TABS = [
  { key: "scheduled", label: "📅 Agendadas" },
  { key: "won", label: "🏆 Vendidas" },
  { key: "lost", label: "❌ Perdidas" },
  { key: "cancelled", label: "🚫 Canceladas" },
  { key: "no_show", label: "👻 No acude" },
] as const;

const LOST_REASONS = [
  { value: "precio", label: "Precio" },
  { value: "no_encaja", label: "No encaja" },
  { value: "ghosting", label: "Ghosting" },
  { value: "otro", label: "Otro" },
];

const CONTACT_ICON: Record<string, string> = {
  phone: "📞",
  instagram: "📷",
  email: "✉️",
};

function formatCallDateTime(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const dateStr = d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return `${dateStr} · ${time}`;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}

function isThisWeek(iso: string): boolean {
  if (isToday(iso)) return false;
  const d = new Date(iso);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  // Lunes de esta semana
  const dow = t.getDay() === 0 ? 7 : t.getDay();
  const monday = new Date(t);
  monday.setDate(t.getDate() - (dow - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return d >= monday && d <= sunday;
}

export function CallsListView({
  activeStatus,
  activeCloserId,
  currentUser,
  closers,
  leads,
  fisios,
  counts,
}: {
  activeStatus: string;
  activeCloserId: string;
  currentUser: { id: string; fullName: string; role: string };
  closers: Pro[];
  leads: Lead[];
  fisios: Pro[];
  counts: { scheduled: number; won: number; lost: number; cancelled: number; no_show: number };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Lead | null>(null);
  const [converting, setConverting] = useState<Lead | null>(null);
  const [creating, setCreating] = useState(false);

  function switchStatus(key: string) {
    const url = new URL(window.location.href);
    if (key === "scheduled") url.searchParams.delete("status");
    else url.searchParams.set("status", key);
    router.push(url.pathname + url.search);
    router.refresh();
  }

  function switchCloser(closerId: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("closer", closerId);
    router.push(url.pathname + url.search);
    router.refresh();
  }

  // Si estamos en Agendadas, agrupar por Hoy / Esta semana / Próximas
  const showGrouped = activeStatus === "scheduled" && leads.length > 0;
  const today = leads.filter((l) => isToday(l.callScheduledAt));
  const thisWeek = leads.filter((l) => isThisWeek(l.callScheduledAt));
  const future = leads.filter((l) => !isToday(l.callScheduledAt) && !isThisWeek(l.callScheduledAt));

  return (
    <main>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Llamadas</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            {currentUser.role === "closer" ? "Tus llamadas asignadas" : "Llamadas del equipo"}
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="text-xs font-medium px-3 py-2 rounded-lg shrink-0"
          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
        >
          + Añadir llamada
        </button>
      </header>

      {/* Tabs de closer (solo para CEO) */}
      {currentUser.role === "ceo" && closers.length > 1 && (
        <div className="flex gap-1 mb-3 border-b border-neutral-200">
          {closers.map((c) => {
            const isActive = activeCloserId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => switchCloser(c.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  isActive ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"
                }`}
              >
                {c.role === "ceo" ? "👑 " : "📞 "}{c.fullName.split(" ")[0]}
                {c.id === currentUser.id && <span className="text-[10px] text-neutral-400 ml-1">(tú)</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Tabs de estado */}
      <div className="flex gap-1 overflow-x-auto pb-1 mb-4">
        {STATUS_TABS.map((tab) => {
          const count = counts[tab.key as keyof typeof counts];
          const isActive = activeStatus === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => switchStatus(tab.key)}
              className={`px-3 py-2 text-xs rounded-lg whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                isActive ? "bg-neutral-900 text-white" : "bg-white border border-neutral-200 hover:bg-neutral-50"
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 rounded-full ${isActive ? "bg-white/20" : "bg-neutral-100"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {leads.length === 0 ? (
        <section className="card">
          <p className="text-sm text-neutral-400 text-center py-12 italic">
            No hay llamadas en este estado.
          </p>
        </section>
      ) : showGrouped ? (
        <div className="space-y-4">
          {today.length > 0 && (
            <CallsGroup label="Hoy" badge="amber" leads={today} currentUser={currentUser} onClick={setEditing} />
          )}
          {thisWeek.length > 0 && (
            <CallsGroup label="Esta semana" badge="blue" leads={thisWeek} currentUser={currentUser} onClick={setEditing} />
          )}
          {future.length > 0 && (
            <CallsGroup label="Próximas" badge="neutral" leads={future} currentUser={currentUser} onClick={setEditing} />
          )}
        </div>
      ) : (
        <section className="card">
          <div className="divide-y divide-neutral-100">
            {leads.map((lead) => (
              <CallRow key={lead.id} lead={lead} currentUser={currentUser} onClick={() => setEditing(lead)} />
            ))}
          </div>
        </section>
      )}

      {editing && (
        <CallEditModal
          lead={editing}
          currentUser={currentUser}
          closers={closers}
          onClose={() => setEditing(null)}
          onSaved={() => {
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

      {creating && (
        <AddCallModal
          currentUser={currentUser}
          closers={closers}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

function CallsGroup({
  label,
  badge,
  leads,
  currentUser,
  onClick,
}: {
  label: string;
  badge: "amber" | "blue" | "neutral";
  leads: Lead[];
  currentUser: { id: string; fullName: string; role: string };
  onClick: (lead: Lead) => void;
}) {
  const badgeClass =
    badge === "amber" ? "bg-amber-100 text-amber-800 border-amber-200"
    : badge === "blue" ? "bg-blue-100 text-blue-800 border-blue-200"
    : "bg-neutral-100 text-neutral-700 border-neutral-200";
  return (
    <section className="card">
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-[10px] uppercase font-semibold tracking-wide px-2 py-0.5 rounded-full border ${badgeClass}`}>
          {label}
        </span>
        <span className="text-xs text-neutral-500">{leads.length}</span>
      </div>
      <div className="divide-y divide-neutral-100">
        {leads.map((lead) => (
          <CallRow key={lead.id} lead={lead} currentUser={currentUser} onClick={() => onClick(lead)} />
        ))}
      </div>
    </section>
  );
}

function CallRow({
  lead,
  currentUser,
  onClick,
}: {
  lead: Lead;
  currentUser: { id: string; fullName: string; role: string };
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="w-full text-left py-3 px-2 -mx-2 hover:bg-neutral-50 rounded transition-colors">
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{lead.fullName}</span>
            <span className="text-xs text-neutral-500">
              {CONTACT_ICON[lead.contactType] ?? "·"} {lead.contactValue}
            </span>
          </div>
          {lead.aiSummary && (
            <p className="text-xs text-neutral-600 italic mt-1 line-clamp-2">"{lead.aiSummary}"</p>
          )}
          {lead.status === "lost" && lead.lostReason && (
            <div className="text-[11px] text-red-600 mt-1">Razón: {lead.lostReason}</div>
          )}
          {lead.convertedPatient && (
            <Link
              href={`/fisio/paciente/${lead.convertedPatient.id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-[11px] text-emerald-700 mt-1 inline-block hover:underline"
            >
              → Ver ficha de {lead.convertedPatient.fullName}
            </Link>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xs font-medium text-blue-700 whitespace-nowrap">
            📅 {formatCallDateTime(lead.callScheduledAt)}
          </div>
        </div>
      </div>
    </button>
  );
}

// ============================================================================
// Modal de edición: datos del lead + resultado
// ============================================================================

function CallEditModal({
  lead,
  currentUser,
  closers,
  onClose,
  onSaved,
  onConvert,
}: {
  lead: Lead;
  currentUser: { id: string; fullName: string; role: string };
  closers: Pro[];
  onClose: () => void;
  onSaved: () => void;
  onConvert: (lead: Lead) => void;
}) {
  // Datos editables del lead (closer ya puede editar todo)
  const [fullName, setFullName] = useState(lead.fullName);
  const [contactType, setContactType] = useState(lead.contactType);
  const [contactValue, setContactValue] = useState(lead.contactValue);
  const [aiSummary, setAiSummary] = useState(lead.aiSummary ?? "");
  const [callScheduledAt, setCallScheduledAt] = useState(
    new Date(lead.callScheduledAt).toISOString().slice(0, 16)
  );
  const [closerId, setCloserId] = useState(lead.closer?.id ?? "");

  // Resultado
  const [status, setStatus] = useState(lead.status);
  const [lostReason, setLostReason] = useState(lead.lostReason ?? "precio");
  const [inFollowUp, setInFollowUp] = useState(lead.inFollowUp);

  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: lead.id,
        fullName,
        contactType,
        contactValue,
        aiSummary,
        callScheduledAt,
        closerId: closerId || null,
        status,
        ...(status === "lost" && { lostReason }),
        inFollowUp,
      }),
    });
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">Llamada · {lead.fullName}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>

        <div className="space-y-3">
          {/* Datos del lead - editables */}
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Nombre completo</label>
            <input className="input text-sm" value={fullName} onChange={(e) => setFullName(e.target.value)} />
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
              <input className="input text-sm" value={contactValue} onChange={(e) => setContactValue(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Resumen de la conversación</label>
            <textarea className="input text-sm" rows={3} value={aiSummary} onChange={(e) => setAiSummary(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Fecha y hora de llamada</label>
              <input type="datetime-local" className="input text-sm" value={callScheduledAt} onChange={(e) => setCallScheduledAt(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Closer asignado</label>
              <select className="input text-sm" value={closerId} onChange={(e) => setCloserId(e.target.value)}>
                <option value="">— Sin asignar —</option>
                {closers.map((c) => (
                  <option key={c.id} value={c.id}>{c.fullName}{c.role === "ceo" ? " (CEO)" : ""}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Resultado */}
          <div className="pt-3 border-t border-neutral-200">
            <label className="text-xs text-neutral-500 block mb-1">Resultado</label>
            <div className="grid grid-cols-1 gap-1">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatus(tab.key)}
                  className={`px-3 py-2 text-xs rounded border font-medium text-left ${
                    status === tab.key ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200 hover:bg-neutral-50"
                  }`}
                >
                  {tab.label}
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

          <div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={inFollowUp} onChange={(e) => setInFollowUp(e.target.checked)} />
              <span>Marcar para follow-up</span>
            </label>
            {inFollowUp && !lead.inFollowUp && (
              <p className="text-[11px] text-neutral-500 mt-1 italic">
                Se generarán automáticamente fechas de seguimiento a 24h, 48-72h, 30d y 90d desde ahora.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            {status === "won" && !lead.convertedPatient && (
              <button onClick={() => onConvert(lead)} className="btn btn-accent text-sm">
                🏆 Convertir en paciente
              </button>
            )}
            <button onClick={save} disabled={saving} className="btn btn-primary text-sm">
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const [amountPaid, setAmountPaid] = useState("");
  const [subscriptionPeriodMonths, setSubscriptionPeriodMonths] = useState("4");
  const [programType, setProgramType] = useState("RECUPERA");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!amountPaid) return;
    setSaving(true);
    await fetch("/api/leads/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id,
        assignedProfessionalId: assignedProfessionalId || null,
        amountPaid,
        subscriptionPeriodMonths,
        programType,
      }),
    });
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-medium">🏆 Convertir en paciente</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">{lead.fullName} se dará de alta como paciente.</p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Fisio asignado</label>
            <select className="input text-sm" value={assignedProfessionalId} onChange={(e) => setAssignedProfessionalId(e.target.value)}>
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
              <select className="input text-sm" value={subscriptionPeriodMonths} onChange={(e) => setSubscriptionPeriodMonths(e.target.value)}>
                <option value="1">1 mes</option><option value="2">2 meses</option><option value="3">3 meses</option>
                <option value="4">4 meses</option><option value="6">6 meses</option><option value="12">12 meses</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Importe (€)</label>
              <input type="number" step="0.01" min="0" className="input text-sm" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="0,00" />
            </div>
          </div>

          <p className="text-[11px] text-neutral-500 italic">
            💡 Se registra automáticamente como ingreso "Nueva alta" en Finanzas.
          </p>

          <button onClick={save} disabled={!amountPaid || saving} className="btn btn-accent w-full">
            {saving ? "Procesando..." : "Confirmar conversión"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddCallModal({
  currentUser,
  closers,
  onClose,
  onSaved,
}: {
  currentUser: { id: string; fullName: string; role: string };
  closers: Pro[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [contactType, setContactType] = useState<"phone" | "instagram" | "email">("phone");
  const [contactValue, setContactValue] = useState("");
  const [aiSummary, setAiSummary] = useState("");
  const [callScheduledAt, setCallScheduledAt] = useState(() => {
    // Por defecto: dentro de 1h
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d.toISOString().slice(0, 16);
  });
  const [closerId, setCloserId] = useState(currentUser.role === "closer" ? currentUser.id : currentUser.id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    if (!fullName.trim() || !contactValue.trim() || !callScheduledAt) {
      setError("Nombre, contacto y fecha son obligatorios");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: fullName.trim(),
        contactType,
        contactValue: contactValue.trim(),
        aiSummary: aiSummary.trim() || null,
        callScheduledAt: new Date(callScheduledAt).toISOString(),
        closerId: closerId || null,
      }),
    });
    if (res.ok) {
      onSaved();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se pudo crear");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-semibold">+ Nueva llamada</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Programa una nueva llamada de cierre. El lead se creará automáticamente.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Nombre completo *</label>
            <input
              type="text"
              autoFocus
              className="input text-sm w-full"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ej. Juan Pérez"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Contacto</label>
              <select
                className="input text-sm w-full"
                value={contactType}
                onChange={(e) => setContactType(e.target.value as any)}
              >
                <option value="phone">📞 Tel</option>
                <option value="instagram">📷 IG</option>
                <option value="email">✉️ Email</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-neutral-500 block mb-1">Valor *</label>
              <input
                type="text"
                className="input text-sm w-full"
                value={contactValue}
                onChange={(e) => setContactValue(e.target.value)}
                placeholder={contactType === "phone" ? "+34 600000000" : contactType === "instagram" ? "@usuario" : "email@ejemplo.com"}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Fecha y hora de la llamada *</label>
            <input
              type="datetime-local"
              className="input text-sm w-full"
              value={callScheduledAt}
              onChange={(e) => setCallScheduledAt(e.target.value)}
            />
          </div>

          {/* Selector de closer solo para CEO (la closer queda fija a sí misma) */}
          {currentUser.role === "ceo" && closers.length > 1 && (
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Asignada a (closer)</label>
              <select
                className="input text-sm w-full"
                value={closerId}
                onChange={(e) => setCloserId(e.target.value)}
              >
                {closers.map((c) => (
                  <option key={c.id} value={c.id}>{c.fullName}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Resumen IA / Notas (opcional)</label>
            <textarea
              className="input text-sm w-full"
              value={aiSummary}
              onChange={(e) => setAiSummary(e.target.value)}
              rows={3}
              placeholder="Qué le duele, qué espera, info relevante..."
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={save}
            disabled={saving}
            className="w-full text-sm font-medium"
            style={{
              background: "#0A0A0A",
              color: "#FAFAFA",
              padding: 11,
              borderRadius: 10,
              border: "none",
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? "Guardando..." : "Crear llamada"}
          </button>
        </div>
      </div>
    </div>
  );
}
