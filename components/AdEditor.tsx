"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AD_FORMATS,
  AD_FORMAT_LABELS,
  AD_STATUSES,
  AD_STATUS_LABELS,
  type AdFormat,
  type AdStatus,
} from "@/lib/ads";

type AdState = {
  id: string;
  name: string;
  format: AdFormat;
  status: AdStatus;
  hook: string | null;
  script: string | null;
  cta: string | null;
  ctaUrl: string | null;
  finalFileUrl: string | null;
  editorNotes: string | null;
  recordingLocation: string | null;
  recordingOutfit: string | null;
  recordingMaterial: string | null;
  consentSigned: boolean;
  metaAdId: string | null;
};

export function AdEditor({
  ad: initial,
  breadcrumb,
}: {
  ad: AdState;
  breadcrumb: { adsetName: string; campaignName: string; campaignId: string };
}) {
  const router = useRouter();
  const [ad, setAd] = useState<AdState>(initial);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const debouncerRef = useRef<NodeJS.Timeout | null>(null);

  // Autosave debounced (1s sin tocar nada → PATCH).
  function update<K extends keyof AdState>(key: K, value: AdState[K]) {
    setAd((prev) => ({ ...prev, [key]: value }));
    if (debouncerRef.current) clearTimeout(debouncerRef.current);
    debouncerRef.current = setTimeout(() => persist({ ...ad, [key]: value }), 1000);
  }

  async function persist(state: AdState) {
    setSaving(true);
    await fetch("/api/ads/ads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: state.id,
        name: state.name,
        format: state.format,
        status: state.status,
        hook: state.hook ?? "",
        script: state.script ?? "",
        cta: state.cta ?? "",
        ctaUrl: state.ctaUrl ?? "",
        finalFileUrl: state.finalFileUrl ?? "",
        editorNotes: state.editorNotes ?? "",
        recordingLocation: state.recordingLocation ?? "",
        recordingOutfit: state.recordingOutfit ?? "",
        recordingMaterial: state.recordingMaterial ?? "",
        consentSigned: state.consentSigned,
        metaAdId: state.metaAdId ?? "",
      }),
    });
    setSaving(false);
    setSavedAt(new Date());
  }

  // Cleanup timer al desmontar
  useEffect(() => () => { if (debouncerRef.current) clearTimeout(debouncerRef.current); }, []);

  async function remove() {
    if (!confirm("¿Eliminar este anuncio?")) return;
    await fetch(`/api/ads/ads?id=${ad.id}`, { method: "DELETE" });
    router.push(`/fisio/anuncios/campanas`);
  }

  return (
    <div>
      <Link href="/fisio/anuncios/campanas" className="text-xs text-neutral-500 hover:text-neutral-900">
        ← Volver a campañas
      </Link>
      <div className="mt-2 mb-3">
        <p className="text-xs text-neutral-500">
          {breadcrumb.campaignName} · {breadcrumb.adsetName}
        </p>
        <input
          className="text-xl font-semibold mt-1 w-full focus:outline-none bg-transparent"
          value={ad.name}
          onChange={(e) => update("name", e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select
          className="input text-xs !w-auto"
          value={ad.status}
          onChange={(e) => update("status", e.target.value as AdStatus)}
        >
          {AD_STATUSES.map((s) => (
            <option key={s} value={s}>{AD_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select
          className="input text-xs !w-auto"
          value={ad.format}
          onChange={(e) => update("format", e.target.value as AdFormat)}
        >
          {AD_FORMATS.map((f) => (
            <option key={f} value={f}>{AD_FORMAT_LABELS[f]}</option>
          ))}
        </select>
        <span className="flex-1" />
        <span className="text-[10px] text-neutral-400">
          {saving ? "Guardando…" : savedAt ? `Guardado ${savedAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}` : ""}
        </span>
        <button onClick={remove} className="text-xs text-red-600">Eliminar</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="card lg:col-span-2 space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">🎣 Hook</label>
            <input
              className="input"
              value={ad.hook ?? ""}
              onChange={(e) => update("hook", e.target.value)}
              placeholder="El gancho del anuncio: la frase de los primeros 3 segundos"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">📝 Guion / Copy</label>
            <textarea
              className="input"
              rows={10}
              value={ad.script ?? ""}
              onChange={(e) => update("script", e.target.value)}
              placeholder="Guion completo del anuncio (texto del vídeo + caption + estructura)"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">CTA (texto)</label>
              <input
                className="input"
                value={ad.cta ?? ""}
                onChange={(e) => update("cta", e.target.value)}
                placeholder="Reserva tu videoconsulta"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">URL del CTA (con UTMs)</label>
              <input
                className="input"
                value={ad.ctaUrl ?? ""}
                onChange={(e) => update("ctaUrl", e.target.value)}
                placeholder="https://fisiofitteam.com/agenda?utm_campaign=…"
              />
            </div>
          </div>
        </section>

        <aside className="card space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">🎬 Archivo final</label>
            <input
              className="input"
              value={ad.finalFileUrl ?? ""}
              onChange={(e) => update("finalFileUrl", e.target.value)}
              placeholder="URL del vídeo/imagen final"
            />
            {ad.finalFileUrl && (
              <a href={ad.finalFileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                Abrir →
              </a>
            )}
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">🔗 ID Meta Ad</label>
            <input
              className="input"
              value={ad.metaAdId ?? ""}
              onChange={(e) => update("metaAdId", e.target.value)}
              placeholder="234567890123456"
            />
            <p className="text-[11px] text-neutral-400 mt-1">
              Pega el ID del anuncio en Meta cuando lo publiques. Habilita sincronización de estado y métricas.
            </p>
          </div>
        </aside>

        <section className="card lg:col-span-2 space-y-3">
          <h3 className="font-medium text-sm">🎥 Producción</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Ubicación</label>
              <input className="input" value={ad.recordingLocation ?? ""} onChange={(e) => update("recordingLocation", e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Vestuario</label>
              <input className="input" value={ad.recordingOutfit ?? ""} onChange={(e) => update("recordingOutfit", e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Material</label>
              <input className="input" value={ad.recordingMaterial ?? ""} onChange={(e) => update("recordingMaterial", e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={ad.consentSigned} onChange={(e) => update("consentSigned", e.target.checked)} />
            Consentimiento firmado (cesión de imagen)
          </label>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">📓 Notas para el editor</label>
            <textarea className="input" rows={4} value={ad.editorNotes ?? ""} onChange={(e) => update("editorNotes", e.target.value)} />
          </div>
        </section>
      </div>
    </div>
  );
}
