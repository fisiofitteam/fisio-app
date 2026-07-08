"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PREVENTION_LANDING_DEFAULTS,
  type PreventionLandingCopy,
  type PreventionValueCard,
  type PreventionFaqItem,
} from "@/lib/landing-content";

/**
 * Editor de la landing pública de Prevention (prevention.fisiofitteam.com).
 * Guarda el copy en LandingConfig(id="prevention") vía PUT /api/landing-config.
 * Los precios y bullets de plan NO se editan aquí — vienen de
 * PREVENTION_PLAN_CONFIG (para no divergir con Stripe).
 *
 * Placeholders soportados en cualquier campo de texto:
 *   {trialDays}  → nº de días de prueba (por defecto 4)
 *   {year}       → año actual
 *   {plan}       → nombre del plan (solo dentro de ctaPlanTemplate)
 */
export function PreventionLandingEditor({
  initialCopy,
}: {
  initialCopy: PreventionLandingCopy;
}) {
  const router = useRouter();
  const [copy, setCopy] = useState<PreventionLandingCopy>(initialCopy);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function update<K extends keyof PreventionLandingCopy>(key: K, value: PreventionLandingCopy[K]) {
    setCopy((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/landing-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "prevention", content: copy }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCopy(data.content);
        setMsg({ kind: "ok", text: "Guardado. La landing ya refleja los cambios." });
        router.refresh();
      } else {
        setMsg({ kind: "err", text: data.error || "No se pudo guardar" });
      }
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || "Error de red" });
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 6000);
    }
  }

  function resetDefaults() {
    if (!confirm("¿Volver a los textos por defecto? Perderás los cambios sin guardar.")) return;
    setCopy(PREVENTION_LANDING_DEFAULTS);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 p-4">
        <div className="flex justify-between items-start gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold text-emerald-900">Editar landing pública</div>
            <div className="text-xs text-emerald-700/80 mt-0.5">
              Los cambios se aplican inmediatamente en{" "}
              <a
                href="/prevention"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium"
              >
                prevention.fisiofitteam.com
              </a>
              . Placeholders:{" "}
              <code className="bg-white px-1.5 py-0.5 rounded text-[11px]">{"{trialDays}"}</code>{" "}
              <code className="bg-white px-1.5 py-0.5 rounded text-[11px]">{"{year}"}</code>{" "}
              <code className="bg-white px-1.5 py-0.5 rounded text-[11px]">{"{plan}"}</code>{" "}
              (solo en CTA plan).
            </div>
          </div>
        </div>
      </div>

      {/* Colores */}
      <Section title="🎨 Colores del brand">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ColorField
            label="Primary"
            value={copy.brandPrimary}
            onChange={(v) => update("brandPrimary", v)}
          />
          <ColorField
            label="Primary dark (gradient)"
            value={copy.brandPrimaryDark}
            onChange={(v) => update("brandPrimaryDark", v)}
          />
          <ColorField
            label="Accent suave (fondos)"
            value={copy.brandAccentSoft}
            onChange={(v) => update("brandAccentSoft", v)}
          />
        </div>
      </Section>

      {/* Cabecera */}
      <Section title="🏷 Cabecera">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <TextField label="Nombre marca" value={copy.brandName} onChange={(v) => update("brandName", v)} />
          <TextField label="Sufijo destacado" value={copy.brandSuffix} onChange={(v) => update("brandSuffix", v)} />
          <TextField label="Texto CTA cabecera" value={copy.headerCtaLabel} onChange={(v) => update("headerCtaLabel", v)} />
        </div>
      </Section>

      {/* Hero */}
      <Section title="🚀 Hero (portada)">
        <div className="space-y-3">
          <TextField label="Badge (uppercase)" value={copy.heroBadge} onChange={(v) => update("heroBadge", v)} />
          <TextField label="Título grande" value={copy.heroTitle} onChange={(v) => update("heroTitle", v)} />
          <TextArea label="Subtítulo" value={copy.heroSubtitle} onChange={(v) => update("heroSubtitle", v)} rows={3} />
          <TextField label="Línea del trial (pequeña)" value={copy.heroTrialLine} onChange={(v) => update("heroTrialLine", v)} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TextField label="CTA principal" value={copy.heroCtaPrimary} onChange={(v) => update("heroCtaPrimary", v)} />
            <TextField label="CTA secundario" value={copy.heroCtaSecondary} onChange={(v) => update("heroCtaSecondary", v)} />
          </div>
        </div>
      </Section>

      {/* Value cards */}
      <Section title="⭐ Tarjetas de valor">
        <ValueCardsEditor
          cards={copy.valueCards}
          onChange={(cards) => update("valueCards", cards)}
        />
      </Section>

      {/* Cabecera de la sección de planes */}
      <Section title="💳 Sección de planes">
        <div className="space-y-3">
          <TextField label="Título" value={copy.planesTitle} onChange={(v) => update("planesTitle", v)} />
          <TextArea label="Subtítulo" value={copy.planesSubtitle} onChange={(v) => update("planesSubtitle", v)} rows={2} />
          <BulletsEditor
            label="Bullets comunes de las 3 cards"
            bullets={copy.planBullets}
            onChange={(bullets) => update("planBullets", bullets)}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TextField label="Badge del plan destacado" value={copy.highlightBadgeLabel} onChange={(v) => update("highlightBadgeLabel", v)} />
            <TextField label="CTA de plan (usa {plan})" value={copy.ctaPlanTemplate} onChange={(v) => update("ctaPlanTemplate", v)} />
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section title="❓ Preguntas frecuentes">
        <TextField label="Título FAQ" value={copy.faqTitle} onChange={(v) => update("faqTitle", v)} />
        <div className="mt-3">
          <FaqEditor items={copy.faqItems} onChange={(items) => update("faqItems", items)} />
        </div>
      </Section>

      {/* Footer */}
      <Section title="📄 Pie de página">
        <TextField label="Copyright" value={copy.footerCopyright} onChange={(v) => update("footerCopyright", v)} />
      </Section>

      {/* Sticky save bar */}
      <div className="sticky bottom-4 z-10">
        <div className="rounded-2xl bg-white shadow-lg border border-neutral-200 p-3 flex items-center gap-3 flex-wrap justify-between">
          <div className="text-xs text-neutral-500">
            {msg ? (
              <span className={msg.kind === "ok" ? "text-emerald-700" : "text-red-600"}>
                {msg.kind === "ok" ? "✓ " : "✗ "}
                {msg.text}
              </span>
            ) : (
              "Los cambios se aplican al guardar."
            )}
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/prevention"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium px-3 py-2 rounded-lg border border-neutral-200 hover:border-neutral-400 hover:bg-neutral-50"
            >
              ↗ Ver landing
            </a>
            <button
              onClick={resetDefaults}
              className="text-xs font-medium px-3 py-2 rounded-lg border border-neutral-200 hover:border-neutral-400 hover:bg-neutral-50"
            >
              ↺ Restaurar por defecto
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="text-sm font-semibold px-4 py-2 rounded-lg text-white"
              style={{
                background: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
                opacity: saving ? 0.5 : 1,
                cursor: saving ? "wait" : "pointer",
              }}
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── UI helpers ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      {children}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-neutral-500 block mb-1">{label}</label>
      <input
        type="text"
        className="input text-sm w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <label className="text-xs text-neutral-500 block mb-1">{label}</label>
      <textarea
        className="input text-sm w-full"
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-neutral-500 block mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-9 w-12 border border-neutral-200 rounded cursor-pointer"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="text"
          className="input text-sm flex-1 font-mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

function BulletsEditor({
  label,
  bullets,
  onChange,
}: {
  label: string;
  bullets: string[];
  onChange: (b: string[]) => void;
}) {
  return (
    <div>
      <label className="text-xs text-neutral-500 block mb-1.5">{label}</label>
      <div className="space-y-2">
        {bullets.map((b, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="text-sm text-neutral-400 w-4 text-center">✓</span>
            <input
              className="input text-sm flex-1"
              value={b}
              onChange={(e) => onChange(bullets.map((x, k) => (k === i ? e.target.value : x)))}
            />
            <button
              type="button"
              onClick={() => onChange(bullets.filter((_, k) => k !== i))}
              className="w-7 h-7 rounded border border-neutral-200 text-neutral-400 hover:text-red-600 flex-shrink-0"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button onClick={() => onChange([...bullets, ""])} className="mt-2 text-sm text-blue-600 hover:underline">
        + Añadir bullet
      </button>
    </div>
  );
}

function ValueCardsEditor({
  cards,
  onChange,
}: {
  cards: PreventionValueCard[];
  onChange: (cards: PreventionValueCard[]) => void;
}) {
  function updateAt(i: number, patch: Partial<PreventionValueCard>) {
    onChange(cards.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  }
  return (
    <div className="space-y-3">
      {cards.map((c, i) => (
        <div key={i} className="grid grid-cols-[60px_1fr_2fr_auto] gap-2 items-start">
          <input
            type="text"
            className="input text-2xl text-center h-10"
            value={c.emoji}
            onChange={(e) => updateAt(i, { emoji: e.target.value })}
            maxLength={4}
          />
          <input
            type="text"
            className="input text-sm h-10"
            value={c.title}
            placeholder="Título"
            onChange={(e) => updateAt(i, { title: e.target.value })}
          />
          <textarea
            className="input text-sm"
            value={c.body}
            placeholder="Descripción"
            rows={2}
            onChange={(e) => updateAt(i, { body: e.target.value })}
          />
          <button
            type="button"
            onClick={() => onChange(cards.filter((_, k) => k !== i))}
            className="w-9 h-9 rounded border border-neutral-200 text-neutral-400 hover:text-red-600 flex-shrink-0"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...cards, { emoji: "✨", title: "", body: "" }])}
        className="text-sm text-blue-600 hover:underline"
      >
        + Añadir tarjeta
      </button>
    </div>
  );
}

function FaqEditor({
  items,
  onChange,
}: {
  items: PreventionFaqItem[];
  onChange: (items: PreventionFaqItem[]) => void;
}) {
  function updateAt(i: number, patch: Partial<PreventionFaqItem>) {
    onChange(items.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  }
  return (
    <div className="space-y-3">
      {items.map((f, i) => (
        <div key={i} className="rounded-lg border border-neutral-200 p-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Pregunta {i + 1}
            </span>
            <button
              type="button"
              onClick={() => onChange(items.filter((_, k) => k !== i))}
              className="text-xs text-neutral-400 hover:text-red-600"
            >
              Eliminar
            </button>
          </div>
          <input
            type="text"
            className="input text-sm w-full mb-2"
            value={f.q}
            placeholder="Pregunta"
            onChange={(e) => updateAt(i, { q: e.target.value })}
          />
          <textarea
            className="input text-sm w-full"
            value={f.a}
            placeholder="Respuesta"
            rows={2}
            onChange={(e) => updateAt(i, { a: e.target.value })}
          />
        </div>
      ))}
      <button
        onClick={() => onChange([...items, { q: "", a: "" }])}
        className="text-sm text-blue-600 hover:underline"
      >
        + Añadir pregunta
      </button>
    </div>
  );
}
