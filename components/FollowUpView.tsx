"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { RescheduleLinkButton } from "@/components/RescheduleLinkButton";
import { CallSummaryBlock, type CallSummaryData } from "@/components/CallSummaryBlock";

type Pro = { id: string; fullName: string; role: string };

type Lead = {
  id: string;
  fullName: string;
  contactType: string;
  contactValue: string;
  phone: string | null;
  meetingUrl: string | null;
  aiSummary: string | null;
  followUpNote: string | null;
  callScheduledAt: string;
  status: string;
  lostReason: string | null;
  followUp24hDate: string | null;
  followUp24hDone: boolean;
  followUp48hDate: string | null;
  followUp48hDone: boolean;
  followUp30dDate: string | null;
  followUp30dDone: boolean;
  followUp90dDate: string | null;
  followUp90dDone: boolean;
  closer: Pro | null;
};

const CONTACT_ICON: Record<string, string> = { phone: "📞", instagram: "📷", email: "✉️" };
const LOST_REASONS = [
  { value: "precio", label: "Precio" },
  { value: "no_encaja", label: "No encaja" },
  { value: "ghosting", label: "Ghosting" },
  { value: "otro", label: "Otro" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " +
         d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}
function isPast(iso: string | null): boolean {
  return !!iso && new Date(iso) < new Date();
}
// ISO → valor para <input type="datetime-local"> (hora local)
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function FollowUpView({
  activeCloserId,
  currentUser,
  closers,
  leads,
  callSummaryByLeadId,
  embedded = false,
}: {
  activeCloserId: string;
  currentUser: { id: string; role: string };
  closers: Pro[];
  leads: Lead[];
  callSummaryByLeadId?: Record<string, CallSummaryData>;
  embedded?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Lead | null>(null);

  function switchCloser(closerId: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("closer", closerId);
    if (embedded) url.searchParams.set("view", "followup");
    router.push(url.pathname + url.search);
    router.refresh();
  }

  async function toggleCheck(leadId: string, field: string, value: boolean) {
    await fetch("/api/leads", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: leadId, [field]: value }),
    });
    router.refresh();
  }

  return (
    <main>
      {embedded ? (
        <div className="flex gap-1 mb-4 border-b border-neutral-200">
          <a href={`/fisio/llamadas-venta?closer=${activeCloserId}`} className="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-neutral-500 hover:text-neutral-900">📞 Llamadas</a>
          <span className="px-4 py-2 text-sm font-medium border-b-2 border-neutral-900 text-neutral-900">🔁 Follow-up</span>
        </div>
      ) : (
        <header className="mb-4">
          <h1 className="text-xl font-semibold">Follow-up</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            {leads.length} {leads.length === 1 ? "lead pendiente" : "leads pendientes"} de re-contactar
          </p>
        </header>
      )}

      {/* Tabs de closer para CEO */}
      {(currentUser.role === "ceo" || currentUser.role === "setter") && closers.length > 1 && (
        <div className="flex gap-1 mb-4 border-b border-neutral-200">
          {closers.map((c) => {
            const isActive = activeCloserId === c.id;
            return (
              <button key={c.id} onClick={() => switchCloser(c.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${isActive ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"}`}>
                {c.role === "ceo" ? "👑 " : "📞 "}{c.fullName.split(" ")[0]}
                {c.id === currentUser.id && <span className="text-[10px] text-neutral-400 ml-1">(tú)</span>}
              </button>
            );
          })}
        </div>
      )}

      {leads.length === 0 ? (
        <section className="card"><p className="text-sm text-neutral-400 text-center py-12 italic">No hay leads en follow-up.</p></section>
      ) : (
        <section className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-neutral-500 uppercase border-b border-neutral-200">
                <th className="text-left py-2 px-2 font-medium">Cliente</th>
                <th className="text-left py-2 px-2 font-medium min-w-[260px]">Situación / objeciones</th>
                <th className="text-center py-2 px-2 font-medium">Follow up 24h</th>
                <th className="text-center py-2 px-2 font-medium">Oferta 48-72h</th>
                <th className="text-center py-2 px-2 font-medium">30 días</th>
                <th className="text-center py-2 px-2 font-medium">90 días</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                // El teléfono canónico está en Lead.phone (nueva columna con
                // prefijo). Fallback: contactValue si contactType === "phone".
                const phoneForWa = lead.phone ?? (lead.contactType === "phone" ? lead.contactValue : null);
                const waHref = phoneForWa ? `https://wa.me/${phoneForWa.replace(/[^0-9+]/g, "")}` : null;
                const summary = callSummaryByLeadId?.[lead.id];
                return (
                <Fragment key={lead.id}>
                <tr className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="py-3 px-2 align-top">
                    <div className="flex flex-col">
                      {waHref ? (
                        <a
                          href={waHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-neutral-900 underline underline-offset-2 hover:text-neutral-700"
                          title="Abrir WhatsApp"
                        >
                          {lead.fullName}
                        </a>
                      ) : (
                        <span className="font-medium">{lead.fullName}</span>
                      )}
                      <div className="text-[11px] text-neutral-500 mt-0.5">{CONTACT_ICON[lead.contactType] ?? "·"} {lead.contactValue}</div>
                      <button
                        onClick={() => setEditing(lead)}
                        className="text-[11px] text-neutral-500 hover:text-neutral-900 underline underline-offset-2 mt-1 self-start"
                      >
                        ✏️ Editar
                      </button>
                    </div>
                  </td>
                  <td className="py-3 px-2 align-top">
                    <div className="text-xs text-neutral-700 line-clamp-3">{lead.followUpNote || lead.aiSummary || "—"}</div>
                  </td>
                  <CheckCell date={lead.followUp24hDate} done={lead.followUp24hDone} onToggle={() => toggleCheck(lead.id, "followUp24hDone", !lead.followUp24hDone)} />
                  <CheckCell date={lead.followUp48hDate} done={lead.followUp48hDone} onToggle={() => toggleCheck(lead.id, "followUp48hDone", !lead.followUp48hDone)} />
                  <CheckCell date={lead.followUp30dDate} done={lead.followUp30dDone} onToggle={() => toggleCheck(lead.id, "followUp30dDone", !lead.followUp30dDone)} />
                  <CheckCell date={lead.followUp90dDate} done={lead.followUp90dDone} onToggle={() => toggleCheck(lead.id, "followUp90dDone", !lead.followUp90dDone)} />
                </tr>
                {summary && (
                  <tr className="border-b border-neutral-100">
                    <td colSpan={6} className="px-2 pb-3">
                      <CallSummaryBlock summary={summary} outcomeOverride="followup" />
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {editing && (
        <FollowUpEditModal lead={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />
      )}
    </main>
  );
}

function CheckCell({ date, done, onToggle }: { date: string | null; done: boolean; onToggle: () => void }) {
  const past = isPast(date);
  return (
    <td className="py-3 px-2 align-top text-center">
      <div className={`text-[11px] ${done ? "line-through text-neutral-400" : past ? "text-red-600 font-medium" : "text-blue-700"}`}>{formatDate(date)}</div>
      <input type="checkbox" checked={done} onChange={onToggle} className="mt-1.5 cursor-pointer w-4 h-4 accent-emerald-600" />
    </td>
  );
}

function FollowUpEditModal({ lead, onClose, onSaved }: { lead: Lead; onClose: () => void; onSaved: () => void }) {
  const [note, setNote] = useState(lead.followUpNote ?? "");
  const [d24, setD24] = useState(toLocalInput(lead.followUp24hDate));
  const [d48, setD48] = useState(toLocalInput(lead.followUp48hDate));
  const [d30, setD30] = useState(toLocalInput(lead.followUp30dDate));
  const [d90, setD90] = useState(toLocalInput(lead.followUp90dDate));
  const [lostReason, setLostReason] = useState(lead.lostReason ?? "precio");
  const [saving, setSaving] = useState(false);
  // Editor del meetingUrl + regenerar resumen: mismo patrón que en el modal
  // de llamadas-venta. Útil cuando el summary quedó como "sin transcripción"
  // porque el cron corrió antes de que Meet publicase el transcript.
  const [meetingUrl, setMeetingUrl] = useState(lead.meetingUrl ?? "");
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateResult, setRegenerateResult] = useState<string | null>(null);

  async function patch(extra: any) {
    setSaving(true);
    await fetch("/api/leads", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lead.id, ...extra }),
    }).catch(() => {});
    onSaved();
  }

  function save() {
    patch({
      followUpNote: note,
      followUp24hDate: d24 ? new Date(d24).toISOString() : null,
      followUp48hDate: d48 ? new Date(d48).toISOString() : null,
      followUp30dDate: d30 ? new Date(d30).toISOString() : null,
      followUp90dDate: d90 ? new Date(d90).toISOString() : null,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-4 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-medium">{lead.fullName}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>

        <div className="bg-neutral-50 rounded-lg p-3 mb-3 text-xs text-neutral-600 space-y-1">
          <div>{CONTACT_ICON[lead.contactType] ?? "·"} {lead.contactValue}</div>
          <div>Llamada: {formatDate(lead.callScheduledAt)}</div>
          {lead.aiSummary && <div className="italic border-t border-neutral-200 pt-1 mt-1">Resumen IA: {lead.aiSummary}</div>}
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Situación / objeciones</label>
            <textarea className="input text-sm" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="¿Qué objeciones tiene? ¿Qué necesita para cerrar?" />
          </div>

          {/* Link de Meet + regenerar. Si el cron guardó "sin transcripción"
              antes de que Meet la publicase, pega el link (o vuelve a pegarlo)
              y pulsa "Regenerar resumen" — tarda 15-30s y aparece la card. */}
          <div>
            <label className="text-xs text-neutral-500 block mb-1 flex items-center justify-between">
              <span>🎥 Link de Google Meet</span>
              {meetingUrl && (
                <a href={meetingUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-medium underline text-emerald-700">
                  Abrir
                </a>
              )}
            </label>
            <input
              type="url"
              className="input text-sm"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              placeholder="https://meet.google.com/xxx-xxxx-xxx"
            />
            <div className="flex items-center gap-2 mt-1.5">
              <button
                type="button"
                disabled={!meetingUrl.includes("meet.google.com") || regenerating}
                onClick={async () => {
                  setRegenerating(true);
                  setRegenerateResult(null);
                  try {
                    const r = await fetch(`/api/admin/leads/${lead.id}/fix-meeting-url?url=${encodeURIComponent(meetingUrl.trim())}`, { method: "POST" });
                    const data = await r.json();
                    if (!r.ok) {
                      setRegenerateResult(`⚠ ${data?.error ?? "Error"}`);
                    } else if (data?.regenerated?.ok) {
                      setRegenerateResult("✓ Resumen generado. Cierra el modal y verás la card.");
                    } else if (data?.regenerated?.reason === "no_transcript") {
                      setRegenerateResult(data?.regenerated?.detail ?? "Meet aún no expone transcripción.");
                    } else if (data?.regenerated?.detail) {
                      setRegenerateResult(`⚠ ${data.regenerated.detail}`);
                    } else {
                      setRegenerateResult(`⚠ Estado: ${data?.regenerated?.reason ?? "desconocido"}`);
                    }
                  } catch (e: any) {
                    setRegenerateResult(`⚠ Error de red: ${e?.message ?? "?"}`);
                  } finally {
                    setRegenerating(false);
                  }
                }}
                className="text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-40"
                style={{ background: "#0A0A0A", color: "#FAFAFA" }}
              >
                {regenerating ? "Regenerando… (15-30s)" : "🔄 Regenerar resumen"}
              </button>
            </div>
            {regenerateResult && (
              <p
                className="text-[11px] mt-1.5 px-2 py-1 rounded"
                style={{
                  background: regenerateResult.startsWith("✓") ? "#DCFCE7" : "#FEF3C7",
                  color: regenerateResult.startsWith("✓") ? "#065F46" : "#78350F",
                }}
              >
                {regenerateResult}
              </p>
            )}
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Fechas de seguimiento (personalizables)</label>
            <div className="grid grid-cols-2 gap-2">
              <DateField label="24h" value={d24} onChange={setD24} />
              <DateField label="Oferta 48-72h" value={d48} onChange={setD48} />
              <DateField label="30 días" value={d30} onChange={setD30} />
              <DateField label="90 días" value={d90} onChange={setD90} />
            </div>
          </div>

          <button onClick={save} disabled={saving} className="btn btn-primary text-sm w-full">{saving ? "Guardando..." : "Guardar"}</button>

          <div className="pt-1">
            <RescheduleLinkButton leadId={lead.id} leadStatus={lead.status} />
          </div>

          {/* Resultado: marcar vendido / perdido (sale de follow-up) */}
          <div className="border-t border-neutral-100 pt-3">
            <label className="text-xs text-neutral-500 block mb-1.5">Resultado</label>
            <div className="flex flex-wrap gap-2 items-center">
              <button onClick={() => patch({ status: "won", inFollowUp: false })} disabled={saving} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100">🏆 Vendido</button>
              <button onClick={() => patch({ status: "lost", inFollowUp: false, lostReason })} disabled={saving} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-300 text-red-800 bg-red-50 hover:bg-red-100">❌ Perdido</button>
              <select className="input text-xs w-auto" value={lostReason} onChange={(e) => setLostReason(e.target.value)} title="Razón si se pierde">
                {LOST_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <button onClick={() => patch({ inFollowUp: false })} disabled={saving} className="text-xs text-neutral-500 hover:underline mt-3 block">Quitar de follow-up (volver a agendadas)</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-[11px] text-neutral-400 mb-0.5">{label}</div>
      <input type="datetime-local" className="input text-xs" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
