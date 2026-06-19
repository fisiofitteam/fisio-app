"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AD_FORMAT_LABELS,
  AD_STATUS_COLOR,
  AD_STATUS_LABELS,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUSES,
  OBJECTIVE_LABELS,
  OBJECTIVES,
  utmSlug,
  type AdFormat,
  type AdObjective,
  type AdStatus,
  type CampaignStatus,
} from "@/lib/ads";

type AdItem = {
  id: string;
  name: string;
  format: AdFormat;
  status: AdStatus;
  hook: string | null;
  finalFileUrl: string | null;
  metaAdId: string | null;
  ctaUrl: string | null;
};

type AdSetItem = {
  id: string;
  name: string;
  status: CampaignStatus;
  metaAdsetId: string | null;
  dailyBudget: number | null;
  startDate: string | null;
  endDate: string | null;
  ads: AdItem[];
};

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
  adSets: AdSetItem[];
};

export function CampaignsTree({ campaigns }: { campaigns: CampaignItem[] }) {
  const router = useRouter();
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<CampaignItem | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deleteCampaign(id: string) {
    if (!confirm("¿Eliminar esta campaña? Se borrarán también sus AdSets y Ads.")) return;
    await fetch(`/api/ads/campaigns?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm text-neutral-500">
          {campaigns.length} campaña{campaigns.length !== 1 && "s"}
        </p>
        <button onClick={() => setShowNewCampaign(true)} className="btn btn-primary text-xs">
          + Nueva campaña
        </button>
      </div>

      {campaigns.length === 0 ? (
        <p className="text-sm text-neutral-500 text-center py-12 italic">
          Aún no hay campañas. Crea la primera.
        </p>
      ) : (
        <div className="space-y-2">
          {campaigns.map((c) => {
            const isOpen = expanded.has(c.id);
            const totalAds = c.adSets.reduce((acc, s) => acc + s.ads.length, 0);
            return (
              <section key={c.id} className="card !p-0 overflow-hidden">
                <header className="px-3 py-2 flex items-center gap-2 border-b border-neutral-100">
                  <button onClick={() => toggle(c.id)} className="text-neutral-400 text-xs w-5">
                    {isOpen ? "▼" : "▶"}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{c.name}</span>
                      <StatusBadge status={c.status} kind="campaign" />
                      <span className="text-[10px] text-neutral-400">
                        {OBJECTIVE_LABELS[c.objective as AdObjective] ?? c.objective}
                      </span>
                      {c.metaCampaignId && (
                        <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                          🔗 Meta
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500 mt-0.5">
                      {c.adSets.length} adset{c.adSets.length !== 1 && "s"} · {totalAds} anuncio{totalAds !== 1 && "s"}
                      {c.dailyBudget && ` · ${c.dailyBudget}€/día`}
                    </div>
                  </div>
                  <button onClick={() => setEditingCampaign(c)} className="text-xs text-neutral-500">Editar</button>
                  <button onClick={() => deleteCampaign(c.id)} className="text-xs text-red-600">Borrar</button>
                </header>

                {isOpen && (
                  <div className="px-3 py-2 space-y-2 bg-neutral-50">
                    {c.adSets.map((s) => (
                      <AdSetRow key={s.id} campaign={c} adset={s} />
                    ))}
                    <NewAdSetForm campaignId={c.id} />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {(showNewCampaign || editingCampaign) && (
        <CampaignModal
          item={editingCampaign}
          onClose={() => { setShowNewCampaign(false); setEditingCampaign(null); }}
          onSaved={() => { setShowNewCampaign(false); setEditingCampaign(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status, kind }: { status: AdStatus | CampaignStatus; kind: "campaign" | "ad" }) {
  const labels = kind === "campaign" ? CAMPAIGN_STATUS_LABELS : AD_STATUS_LABELS;
  const color = AD_STATUS_COLOR[status as AdStatus] ?? "bg-neutral-100 text-neutral-700";
  return (
    <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${color}`}>
      {labels[status as keyof typeof labels] ?? status}
    </span>
  );
}

function AdSetRow({ campaign, adset }: { campaign: CampaignItem; adset: AdSetItem }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  async function remove() {
    if (!confirm("¿Eliminar este adset y todos sus anuncios?")) return;
    await fetch(`/api/ads/adsets?id=${adset.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="bg-white rounded-lg border border-neutral-200">
      <header className="px-2.5 py-2 flex items-center gap-2 border-b border-neutral-100">
        <button onClick={() => setOpen(!open)} className="text-neutral-400 text-xs w-5">
          {open ? "▼" : "▶"}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">📂 {adset.name}</span>
            <StatusBadge status={adset.status} kind="campaign" />
            {adset.metaAdsetId && (
              <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">🔗 Meta</span>
            )}
          </div>
          <div className="text-xs text-neutral-400 mt-0.5">
            {adset.ads.length} anuncio{adset.ads.length !== 1 && "s"}
            {adset.dailyBudget && ` · ${adset.dailyBudget}€/día`}
          </div>
        </div>
        <button onClick={() => setEditing(true)} className="text-xs text-neutral-500">Editar</button>
        <button onClick={remove} className="text-xs text-red-600">Borrar</button>
      </header>

      {open && (
        <div className="px-2.5 py-2 space-y-1.5">
          {adset.ads.map((ad) => (
            <Link
              key={ad.id}
              href={`/fisio/anuncios/ad/${ad.id}`}
              className="flex items-center gap-2 p-2 rounded border border-neutral-100 hover:border-neutral-300 bg-neutral-50/50"
            >
              <span className="text-base">
                {ad.format === "video" ? "🎥" : ad.format === "image" ? "🖼️" : ad.format === "carousel" ? "🖼️📚" : "📱"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{ad.name}</div>
                {ad.hook && <div className="text-xs text-neutral-500 truncate">"{ad.hook}"</div>}
              </div>
              <StatusBadge status={ad.status} kind="ad" />
              {ad.metaAdId && <span className="text-[10px] text-blue-600">🔗</span>}
            </Link>
          ))}
          <NewAdForm adsetId={adset.id} campaignName={campaign.name} />
        </div>
      )}

      {editing && (
        <AdSetModal
          campaignName={campaign.name}
          item={adset}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

function NewAdSetForm({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  async function create() {
    if (!name.trim()) return;
    await fetch("/api/ads/adsets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId, name }),
    });
    setName(""); setOpen(false);
    router.refresh();
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-neutral-500 hover:text-neutral-900">
        + Nuevo AdSet
      </button>
    );
  }
  return (
    <div className="flex gap-2 items-center">
      <input
        className="input text-sm flex-1"
        autoFocus
        placeholder="Nombre del AdSet"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && create()}
      />
      <button onClick={create} className="btn btn-primary text-xs">Crear</button>
      <button onClick={() => { setName(""); setOpen(false); }} className="text-xs text-neutral-500">Cancelar</button>
    </div>
  );
}

function NewAdForm({ adsetId, campaignName }: { adsetId: string; campaignName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  async function create() {
    if (!name.trim()) return;
    const r = await fetch("/api/ads/ads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adsetId, name }),
    });
    if (r.ok) {
      const { id } = await r.json();
      router.push(`/fisio/anuncios/ad/${id}`);
    }
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-neutral-500 hover:text-neutral-900">
        + Nuevo anuncio
      </button>
    );
  }
  return (
    <div className="flex gap-2 items-center">
      <input
        className="input text-sm flex-1"
        autoFocus
        placeholder="Nombre del anuncio"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && create()}
      />
      <button onClick={create} className="btn btn-primary text-xs">Crear y editar</button>
      <button onClick={() => { setName(""); setOpen(false); }} className="text-xs text-neutral-500">Cancelar</button>
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
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Hombro Q3 2026" />
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
            <label className="text-xs text-neutral-500 block mb-1">ID de Meta (opcional, para sync)</label>
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
              <label className="text-xs text-neutral-500 block mb-1">Presupuesto diario (€)</label>
              <input type="number" className="input" value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Presupuesto total (€)</label>
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

function AdSetModal({
  campaignName,
  item,
  onClose,
  onSaved,
}: {
  campaignName: string;
  item: AdSetItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [status, setStatus] = useState<CampaignStatus>(item.status);
  const [metaAdsetId, setMetaAdsetId] = useState(item.metaAdsetId ?? "");
  const [dailyBudget, setDailyBudget] = useState(item.dailyBudget?.toString() ?? "");
  const [startDate, setStartDate] = useState(item.startDate ? item.startDate.split("T")[0] : "");
  const [endDate, setEndDate] = useState(item.endDate ? item.endDate.split("T")[0] : "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    await fetch("/api/ads/adsets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id, name, status, metaAdsetId,
        dailyBudget: dailyBudget || null,
        startDate: startDate || null, endDate: endDate || null,
      }),
    });
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-medium">Editar AdSet</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-3">Campaña: {campaignName}</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Nombre</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Estado</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as CampaignStatus)}>
                {CAMPAIGN_STATUSES.map((s) => <option key={s} value={s}>{CAMPAIGN_STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Presupuesto día (€)</label>
              <input type="number" className="input" value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">ID Meta AdSet (opcional)</label>
            <input className="input" value={metaAdsetId} onChange={(e) => setMetaAdsetId(e.target.value)} />
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
          <button onClick={save} disabled={!name.trim() || saving} className="btn btn-primary w-full">
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
