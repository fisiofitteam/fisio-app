"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AD_STATUS_LABELS,
  AD_FORMAT_LABELS,
  AD_FORMATS,
  CAMPAIGN_STATUS_LABELS,
  type AdFormat,
  type AdStatus,
  type CampaignStatus,
} from "@/lib/ads";

type Ad = {
  id: string;
  name: string;
  format: AdFormat;
  status: AdStatus;
  hook: string | null;
  cta: string | null;
  finalFileUrl: string | null;
  metaAdId: string | null;
  createdAt: string;
};

type CampaignSummary = {
  id: string;
  name: string;
  status: CampaignStatus;
  objective: string;
  metaCampaignId: string | null;
  dailyBudget: number | null;
  notes: string | null;
};

// Colores y orden de estados (mismo patrón que ThisWeekView de Contenido).
const STATUS_COLOR: Record<AdStatus, string> = {
  idea: "bg-neutral-100 text-neutral-700 border-neutral-200",
  brief: "bg-blue-100 text-blue-800 border-blue-200",
  recording: "bg-amber-100 text-amber-800 border-amber-200",
  editing: "bg-purple-100 text-purple-800 border-purple-200",
  scheduled: "bg-indigo-100 text-indigo-800 border-indigo-200",
  active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  paused: "bg-orange-100 text-orange-800 border-orange-200",
  finished: "bg-neutral-200 text-neutral-600 border-neutral-300",
};

const FORMAT_ICON: Record<AdFormat, string> = {
  video: "🎥",
  image: "🖼️",
  carousel: "🖼️📚",
  story: "📱",
};

// Filtros disponibles arriba.
const STATUS_FILTERS: { value: AdStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "idea", label: "Idea" },
  { value: "brief", label: "Brief" },
  { value: "recording", label: "Grabación" },
  { value: "editing", label: "Edición" },
  { value: "scheduled", label: "Programado" },
  { value: "active", label: "Activo" },
  { value: "paused", label: "Pausado" },
  { value: "finished", label: "Finalizado" },
];

export function CampaignAdsView({ campaign, ads }: { campaign: CampaignSummary; ads: Ad[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<AdStatus | "all">("all");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFormat, setNewFormat] = useState<AdFormat>("video");

  const filtered = filter === "all" ? ads : ads.filter((a) => a.status === filter);

  // Resumen por estado.
  const stats = {
    total: ads.length,
    inProduction: ads.filter((a) => ["idea", "brief", "recording", "editing", "scheduled"].includes(a.status)).length,
    active: ads.filter((a) => a.status === "active").length,
    paused: ads.filter((a) => a.status === "paused").length,
    finished: ads.filter((a) => a.status === "finished").length,
  };

  async function createAd() {
    if (!newName.trim()) return;
    const res = await fetch("/api/ads/ads/create-in-campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: campaign.id, name: newName.trim(), format: newFormat }),
    });
    if (res.ok) {
      const { id } = await res.json();
      router.push(`/fisio/anuncios/ad/${id}`);
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data?.error ?? "No se pudo crear");
    }
  }

  return (
    <div>
      <header className="mt-2 mb-4">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded-full border ${STATUS_COLOR[campaign.status as unknown as AdStatus] ?? "bg-neutral-100 text-neutral-700"}`}>
            {CAMPAIGN_STATUS_LABELS[campaign.status]}
          </span>
          {campaign.metaCampaignId && (
            <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">🔗 Meta</span>
          )}
          {campaign.dailyBudget != null && (
            <span className="text-[10px] text-neutral-500">{campaign.dailyBudget}€/día</span>
          )}
        </div>
        <h1 className="text-xl font-semibold">{campaign.name}</h1>
        {campaign.notes && <p className="text-sm text-neutral-600 mt-1">{campaign.notes}</p>}
      </header>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
        <Stat label="Total" value={stats.total} />
        <Stat label="En producción" value={stats.inProduction} color="amber" />
        <Stat label="Activos" value={stats.active} color="emerald" />
        <Stat label="Pausados" value={stats.paused} color="orange" />
        <Stat label="Finalizados" value={stats.finished} color="neutral" />
      </section>

      <nav className="flex gap-1 mb-3 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`text-xs px-2.5 py-1 rounded-md border whitespace-nowrap ${
              filter === f.value ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </nav>

      {filtered.length === 0 && filter !== "all" ? (
        <p className="text-sm text-neutral-500 italic text-center py-8">Sin anuncios en este estado.</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-neutral-500 italic text-center py-8">Sin anuncios en esta campaña.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
          {filtered.map((a) => (
            <AdCard key={a.id} ad={a} />
          ))}
        </div>
      )}

      {/* Crear nuevo anuncio en la campaña */}
      {adding ? (
        <div className="card flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-neutral-500 block mb-1">Nombre del anuncio</label>
            <input
              className="input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ej: Reel testimonio Ana 30s"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && createAd()}
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Formato</label>
            <select className="input" value={newFormat} onChange={(e) => setNewFormat(e.target.value as AdFormat)}>
              {AD_FORMATS.map((f) => <option key={f} value={f}>{AD_FORMAT_LABELS[f]}</option>)}
            </select>
          </div>
          <button onClick={createAd} className="btn btn-primary text-xs">Crear y editar</button>
          <button onClick={() => { setAdding(false); setNewName(""); }} className="text-xs text-neutral-500">Cancelar</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="btn btn-primary text-xs">
          + Nuevo anuncio en esta campaña
        </button>
      )}
    </div>
  );
}

function AdCard({ ad }: { ad: Ad }) {
  const router = useRouter();

  async function deleteAd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`¿Borrar el anuncio "${ad.name}"?`)) return;
    const res = await fetch(`/api/ads/ads?id=${ad.id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  return (
    <Link
      href={`/fisio/anuncios/ad/${ad.id}`}
      className="card hover:border-neutral-400 hover:shadow-sm transition-all block group relative"
    >
      <button
        onClick={deleteAd}
        className="absolute top-2 right-2 text-neutral-300 hover:text-red-700 hover:bg-red-50 rounded p-1 text-xs leading-none transition-colors opacity-0 group-hover:opacity-100"
        title="Borrar anuncio"
      >
        🗑
      </button>

      <div className="mb-2 pr-6">
        <div className="flex items-center gap-2 justify-between mb-1">
          <span className="text-[10px] uppercase text-neutral-500 font-medium">{AD_FORMAT_LABELS[ad.format]}</span>
          <span className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded-full border ${STATUS_COLOR[ad.status]} whitespace-nowrap`}>
            {AD_STATUS_LABELS[ad.status]}
          </span>
        </div>
        <div className="font-semibold text-sm break-words">
          <span className="mr-1.5">{FORMAT_ICON[ad.format]}</span>
          <span>{ad.name}</span>
        </div>
      </div>

      {ad.hook && (
        <p className="text-xs text-neutral-700 italic line-clamp-2 mt-2">"{ad.hook}"</p>
      )}

      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {ad.finalFileUrl && (
          <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">🎬 Archivo</span>
        )}
        {ad.metaAdId && (
          <span className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">🔗 Meta</span>
        )}
      </div>
    </Link>
  );
}

function Stat({ label, value, color = "neutral" }: { label: string; value: number; color?: string }) {
  const bg =
    color === "amber" ? "bg-amber-50 text-amber-900"
    : color === "emerald" ? "bg-emerald-50 text-emerald-900"
    : color === "orange" ? "bg-orange-50 text-orange-900"
    : "bg-neutral-50 text-neutral-700";
  return (
    <div className={`rounded p-2 text-center ${bg}`}>
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
    </div>
  );
}
