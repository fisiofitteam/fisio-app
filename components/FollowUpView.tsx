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
  status: string;
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

const CONTACT_ICON: Record<string, string> = {
  phone: "📞",
  instagram: "📷",
  email: "✉️",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " +
         d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function isPast(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso) < new Date();
}

export function FollowUpView({
  activeCloserId,
  currentUser,
  closers,
  leads,
}: {
  activeCloserId: string;
  currentUser: { id: string; role: string };
  closers: Pro[];
  leads: Lead[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Lead | null>(null);

  function switchCloser(closerId: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("closer", closerId);
    router.push(url.pathname + url.search);
    router.refresh();
  }

  async function toggleCheck(leadId: string, field: string, value: boolean) {
    await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: leadId, [field]: value }),
    });
    router.refresh();
  }

  return (
    <main>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Follow-up</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          {leads.length} {leads.length === 1 ? "lead pendiente" : "leads pendientes"} de re-contactar
        </p>
      </header>

      {/* Tabs Ales/Alba para CEO */}
      {currentUser.role === "ceo" && closers.length > 1 && (
        <div className="flex gap-1 mb-4 border-b border-neutral-200">
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

      {leads.length === 0 ? (
        <section className="card">
          <p className="text-sm text-neutral-400 text-center py-12 italic">
            No hay leads en follow-up.
          </p>
        </section>
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
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="py-3 px-2 align-top">
                    <button onClick={() => setEditing(lead)} className="text-left">
                      <div className="font-medium">{lead.fullName}</div>
                      <div className="text-[11px] text-neutral-500 mt-0.5">
                        {CONTACT_ICON[lead.contactType] ?? "·"} {lead.contactValue}
                      </div>
                    </button>
                  </td>
                  <td className="py-3 px-2 align-top">
                    <div className="text-xs text-neutral-700 italic line-clamp-3">
                      {lead.aiSummary || "—"}
                    </div>
                  </td>
                  <CheckCell
                    date={lead.followUp24hDate}
                    done={lead.followUp24hDone}
                    onToggle={() => toggleCheck(lead.id, "followUp24hDone", !lead.followUp24hDone)}
                  />
                  <CheckCell
                    date={lead.followUp48hDate}
                    done={lead.followUp48hDone}
                    onToggle={() => toggleCheck(lead.id, "followUp48hDone", !lead.followUp48hDone)}
                  />
                  <CheckCell
                    date={lead.followUp30dDate}
                    done={lead.followUp30dDone}
                    onToggle={() => toggleCheck(lead.id, "followUp30dDone", !lead.followUp30dDone)}
                  />
                  <CheckCell
                    date={lead.followUp90dDate}
                    done={lead.followUp90dDone}
                    onToggle={() => toggleCheck(lead.id, "followUp90dDone", !lead.followUp90dDone)}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {editing && (
        <FollowUpEditModal
          lead={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

function CheckCell({
  date,
  done,
  onToggle,
}: {
  date: string | null;
  done: boolean;
  onToggle: () => void;
}) {
  const past = isPast(date);
  return (
    <td className="py-3 px-2 align-top text-center">
      <div className={`text-[11px] ${done ? "line-through text-neutral-400" : past ? "text-red-600 font-medium" : "text-blue-700"}`}>
        {formatDate(date)}
      </div>
      <input
        type="checkbox"
        checked={done}
        onChange={onToggle}
        className="mt-1.5 cursor-pointer w-4 h-4 accent-emerald-600"
      />
    </td>
  );
}

function FollowUpEditModal({
  lead,
  onClose,
  onSaved,
}: {
  lead: Lead;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [aiSummary, setAiSummary] = useState(lead.aiSummary ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lead.id, aiSummary }),
    });
    onSaved();
  }

  async function removeFromFollowUp() {
    if (!confirm("¿Quitar de follow-up?")) return;
    setSaving(true);
    await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lead.id, inFollowUp: false }),
    });
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">{lead.fullName}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>

        <div className="bg-neutral-50 rounded-lg p-3 mb-4 text-xs text-neutral-600">
          {CONTACT_ICON[lead.contactType] ?? "·"} {lead.contactValue}
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Situación / objeciones</label>
            <textarea
              className="input text-sm"
              rows={4}
              value={aiSummary}
              onChange={(e) => setAiSummary(e.target.value)}
              placeholder="¿Qué pasó en la llamada? ¿Qué objeciones tiene? ¿Qué necesita resolver para cerrar?"
            />
          </div>

          <button onClick={save} disabled={saving} className="btn btn-primary text-sm w-full">
            {saving ? "Guardando..." : "Guardar"}
          </button>

          <button onClick={removeFromFollowUp} disabled={saving} className="text-xs text-red-600 block mt-2 text-center w-full">
            Quitar de follow-up
          </button>
        </div>
      </div>
    </div>
  );
}
