"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABELS,
  OBJECTIVE_LABELS,
  OBJECTIVES,
  utmSlug,
  type AdObjective,
  type CampaignStatus,
} from "@/lib/ads";

type CampaignItem = {
  id: string;
  name: string;
  objective: string;
  status: CampaignStatus;
  metaCampaignId: string | null;
  startDate: string | null;
  endDate: string | null;
  dailyBudget: number | null;
  totalBudget: number | null;
  notes: string | null;
  adsCount: number;
  activeCount: number;
  inProductionCount: number;
};

const STATUS_COLOR: Record<CampaignStatus, string> = {
  idea: "bg-neutral-100 text-neutral-700 border-neutral-200",
  active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  paused: "bg-amber-100 text-amber-800 border-amber-200",
  finished: "bg-neutral-200 text-neutral-600 border-neutral-300",
};

function formatDateShort(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export function CampaignsList({ campaigns }: { campaigns: CampaignItem[] }) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<CampaignItem | null>(null);

  async function deleteCampaign(id: string) {
    if (!confirm("¿Eliminar esta campaña? Se borrarán también sus anuncios.")) return;
    const res = await fetch(`/api/ads/campaigns?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error ?? "No se pudo eliminar");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <p className="text-sm text-neutral-500">
          {campaigns.length} campaña{campaigns.length !== 1 && "s"}
        </p>
        <div className="flex items-center gap-2">
          <a
            href="/api/ads/export-scripts"
            download
            className="text-xs px-3 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 whitespace-nowrap"
            title="Descarga un .md con todos los guiones agrupados por campaña, adset y anuncio"
          >
            📥 Exportar guiones
          </a>
          <button onClick={() => setShowNew(true)} className="btn btn-primary text-xs">
            + Nueva campaña
          </button>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-12 italic">
          Aún no hay campañas. Crea la primera y a partir de ahí añades sus anuncios.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {campaigns.map((c) => (
            <article key={c.id} className="card hover:border-neutral-400 hover:shadow-sm transition-all group relative">
              <button
                onClick={() => deleteCampaign(c.id)}
                className="absolute top-2 right-2 text-neutral-300 hover:text-red-700 hover:bg-red-50 rounded p-1 text-xs leading-none transition-colors opacity-0 group-hover:opacity-100"
                title="Borrar campaña"
              >
                🗑
              </button>

              <header className="mb-3 pr-6">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded-full border ${STATUS_COLOR[c.status]}`}>
                    {CAMPAIGN_STATUS_LABELS[c.status]}
                  </span>
                  {c.metaCampaignId && (
                    <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">🔗 Meta</span>
                  )}
                </div>
                <h2 className="font-semibold text-sm break-words">{c.name}</h2>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  {OBJECTIVE_LABELS[c.objective as AdObjective] ?? c.objective}
                  {c.dailyBudget != null && ` · ${c.dailyBudget}€/día`}
                </p>
              </header>

              <div className="grid grid-cols-3 gap-1 text-center mb-3">
                <div className="bg-neutral-50 rounded p-1.5">
                  <div className="text-base font-semibold">{c.adsCount}</div>
                  <div className="text-[10px] text-neutral-500 uppercase">Total</div>
                </div>
                <div className="bg-amber-50 rounded p-1.5">
                  <div className="text-base font-semibold text-amber-800">{c.inProductionCount}</div>
                  <div className="text-[10px] text-amber-700 uppercase">Produc.</div>
                </div>
                <div className="bg-emerald-50 rounded p-1.5">
                  <div className="text-base font-semibold text-emerald-800">{c.activeCount}</div>
                  <div className="text-[10px] text-emerald-700 uppercase">Activos</div>
                </div>
              </div>

              {(c.startDate || c.endDate) && (
                <p className="text-[11px] text-neutral-400 mb-2">
                  {formatDateShort(c.startDate)} {c.endDate && `→ ${formatDateShort(c.endDate)}`}
                </p>
              )}

              <div className="flex gap-2 mt-2">
                <Link
                  href={`/fisio/anuncios/campanas/${c.id}`}
                  className="flex-1 text-center btn btn-primary text-xs"
                >
                  Ver anuncios →
                </Link>
                <button onClick={() => setEditing(c)} className="btn btn-ghost text-xs">Editar</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {(showNew || editing) && (
        <CampaignModal
          item={editing}
          onClose={() => { setShowNew(false); setEditing(null); }}
          onSaved={() => { setShowNew(false); setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function CampaignModal({
  item,
  onClose,
  onSaved,
}: {
  item: CampaignItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!item;
  const [name, setName] = useState(item?.name ?? "");
  const [objective, setObjective] = useState<AdObjective>((item?.objective as AdObjective) ?? "conversions");
  const [status, setStatus] = useState<CampaignStatus>(item?.status ?? "idea");
  const [metaCampaignId, setMetaCampaignId] = useState(item?.metaCampaignId ?? "");
  const [startDate, setStartDate] = useState(item?.startDate ? item.startDate.split("T")[0] : "");
  const [endDate, setEndDate] = useState(item?.endDate ? item.endDate.split("T")[0] : "");
  const [dailyBudget, setDailyBudget] = useState(item?.dailyBudget?.toString() ?? "");
  const [totalBudget, setTotalBudget] = useState(item?.totalBudget?.toString() ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    const payload = {
      ...(isEdit && { id: item!.id }),
      name, objective, status, metaCampaignId, notes,
      startDate: startDate || null, endDate: endDate || null,
      dailyBudget: dailyBudget || null, totalBudget: totalBudget || null,
    };
    await fetch("/api/ads/campaigns", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    onSaved();
  }

  const utmHint = name ? utmSlug(name) : "";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-medium">{isEdit ? "Editar campaña" : "Nueva campaña"}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Nombre</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Follow me ads junio 2026" />
            {utmHint && (
              <p className="text-[11px] text-neutral-400 mt-1">
                UTM autogenerado: <code className="bg-neutral-100 px-1 rounded">{utmHint}</code>
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Objetivo</label>
              <select className="input" value={objective} onChange={(e) => setObjective(e.target.value as AdObjective)}>
                {OBJECTIVES.map((o) => <option key={o} value={o}>{OBJECTIVE_LABELS[o]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Estado</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as CampaignStatus)}>
                {CAMPAIGN_STATUSES.map((s) => <option key={s} value={s}>{CAMPAIGN_STATUS_LABELS[s]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">ID Meta (opcional, para sync)</label>
            <input className="input" value={metaCampaignId} onChange={(e) => setMetaCampaignId(e.target.value)} placeholder="123456789012345" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Inicio</label>
              <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Fin</label>
              <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">€/día</label>
              <input type="number" className="input" value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">€ total</label>
              <input type="number" className="input" value={totalBudget} onChange={(e) => setTotalBudget(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Notas internas</label>
            <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <button onClick={save} disabled={!name.trim() || saving} className="btn btn-primary w-full">
            {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear campaña"}
          </button>
        </div>
      </div>
    </div>
  );
}
