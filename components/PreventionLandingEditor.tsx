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

  const isHtmlMode = copy.mode === "html";

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

      {/* Selector de modo */}
      <div className="rounded-2xl bg-white border border-neutral-200 p-4">
        <div className="text-xs text-neutral-500 uppercase tracking-wider font-medium mb-2">
          Modo de edición
        </div>
        <div className="flex gap-1 p-1 rounded-lg bg-neutral-100">
          <button
            onClick={() => update("mode", "structured")}
            className={`flex-1 text-xs font-medium py-2 rounded ${
              !isHtmlMode ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500"
            }`}
          >
            📝 Estructurado (campos guiados)
          </button>
          <button
            onClick={() => update("mode", "html")}
            className={`flex-1 text-xs font-medium py-2 rounded ${
              isHtmlMode ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500"
            }`}
          >
            💻 HTML libre (control total)
          </button>
        </div>
        <p className="text-[11px] text-neutral-500 mt-2">
          {isHtmlMode
            ? "Escribes HTML puro. Se sanitiza en servidor contra XSS. El bloque interactivo de planes se inserta donde pongas [[PLANS]] (o al final)."
            : "Rellenas los campos y la landing se monta con el layout de siempre."}
        </p>
      </div>

      {isHtmlMode ? (
        <HtmlEditor
          htmlContent={copy.htmlContent}
          onChange={(v) => update("htmlContent", v)}
          brandPrimary={copy.brandPrimary}
          brandPrimaryDark={copy.brandPrimaryDark}
        />
      ) : (
        <StructuredEditor copy={copy} update={update} />
      )}

      {/* En cualquier modo el bloque de planes reusa estos campos —
          los mostramos siempre porque afectan al render tanto en HTML
          libre (dentro de [[PLANS]]) como estructurado. */}
      <Section title="💳 Bloque interactivo de planes (usado en ambos modos)">
        <p className="text-[11px] text-neutral-500 mb-3">
          Se pinta en el placeholder{" "}
          <code className="bg-neutral-100 px-1 rounded">[[PLANS]]</code> del HTML libre,
          o dentro de la sección de planes en modo estructurado. Los precios vienen de
          Stripe — solo editas copy.
        </p>
        <div className="space-y-3">
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

      {/* Guardar */}
      {renderSaveBar()}
    </div>
  );

  function renderSaveBar() {
    return (
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
    );
  }
}

// ─── Editor HTML libre ──────────────────────────────────────────────────────

const HTML_STARTER = `<!--
  Landing personalizada de FisioFit Prevention.
  Placeholders soportados: {trialDays}, {year}
  El bloque interactivo de planes se insertará donde pongas [[PLANS]].
-->

<header style="max-width:1024px;margin:0 auto;padding:16px 24px;display:flex;justify-content:space-between;align-items:center">
  <div style="font-weight:700">🛡 FisioFit <span style="color:#10B981">Prevention</span></div>
  <a href="#planes" style="background:linear-gradient(135deg,#10B981,#059669);color:white;padding:6px 14px;border-radius:9999px;font-size:12px;font-weight:600;text-decoration:none">Ver planes →</a>
</header>

<section style="max-width:720px;margin:0 auto;padding:40px 24px;text-align:center">
  <div style="display:inline-block;background:#ECFDF5;color:#065F46;padding:4px 12px;border-radius:9999px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:16px">
    Desde 17 €/mes
  </div>
  <h1 style="font-size:48px;font-weight:800;letter-spacing:-0.03em;line-height:1.1;margin:0 0 16px">
    Cuídate en 15 minutos al día.
  </h1>
  <p style="font-size:18px;color:#525252;line-height:1.6">
    Rolling semanal de movilidad, técnica y activación para atletas que ya están sanos.
  </p>
  <p style="font-size:13px;color:#737373;margin-top:12px">
    {trialDays} días gratis. Cancela cuando quieras.
  </p>
</section>

<section id="planes" style="max-width:1024px;margin:0 auto;padding:40px 24px">
  <h2 style="font-size:32px;font-weight:800;text-align:center;letter-spacing:-0.02em">Elige tu plan</h2>
  <p style="text-align:center;color:#737373;margin-bottom:32px">Puedes cancelar cuando quieras.</p>
  [[PLANS]]
</section>

<footer style="max-width:1024px;margin:0 auto;padding:40px 24px;text-align:center;color:#a3a3a3;font-size:12px;border-top:1px solid #f5f5f5">
  © {year} FisioFit Team · fisiofitteam.com
</footer>
`;

function HtmlEditor({
  htmlContent,
  onChange,
  brandPrimary,
  brandPrimaryDark,
}: {
  htmlContent: string;
  onChange: (v: string) => void;
  brandPrimary: string;
  brandPrimaryDark: string;
}) {
  const loadStarter = () => {
    if (htmlContent.trim() && !confirm("Ya hay HTML. ¿Sobrescribir con la plantilla base?")) return;
    onChange(HTML_STARTER);
  };
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white border border-neutral-200 p-4">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div>
            <div className="text-sm font-semibold">HTML de la landing</div>
            <div className="text-[11px] text-neutral-500 mt-0.5">
              Etiquetas permitidas: encabezados, párrafos, divs, secciones, imágenes,
              enlaces, listas, tablas… Se bloquean{" "}
              <code className="bg-red-50 text-red-700 px-1 rounded">script</code>,{" "}
              <code className="bg-red-50 text-red-700 px-1 rounded">iframe</code> y atributos{" "}
              <code className="bg-red-50 text-red-700 px-1 rounded">onclick</code>.
              Los estilos <code className="bg-neutral-100 px-1 rounded">style="..."</code> y{" "}
              <code className="bg-neutral-100 px-1 rounded">class="..."</code> están permitidos.
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={loadStarter}
              className="text-xs font-medium px-3 py-1.5 rounded border border-neutral-200 hover:border-neutral-400 hover:bg-neutral-50"
            >
              📋 Cargar plantilla base
            </button>
          </div>
        </div>

        <textarea
          className="w-full p-3 border border-neutral-200 rounded-lg font-mono text-xs leading-relaxed"
          style={{ minHeight: 500, background: "#FAFAFA" }}
          value={htmlContent}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Pega o escribe el HTML de la landing aquí. Usa [[PLANS]] donde quieras que aparezcan los 3 cards con checkout."
        />

        <details className="mt-3 rounded-lg bg-blue-50 border border-blue-200 text-xs">
          <summary className="cursor-pointer px-3 py-2 font-semibold text-blue-900">
            💡 Snippets útiles
          </summary>
          <div className="px-3 pb-3 space-y-2 text-blue-900">
            <div>
              <div className="font-medium mb-0.5">Insertar el bloque de planes:</div>
              <code className="bg-white px-2 py-1 rounded block">[[PLANS]]</code>
            </div>
            <div>
              <div className="font-medium mb-0.5">Gradient del brand:</div>
              <code className="bg-white px-2 py-1 rounded block break-all">
                style="background:linear-gradient(135deg,{brandPrimary},{brandPrimaryDark});color:white"
              </code>
            </div>
            <div>
              <div className="font-medium mb-0.5">Anchor al bloque de planes:</div>
              <code className="bg-white px-2 py-1 rounded block">&lt;a href="#planes"&gt;Ver planes&lt;/a&gt;</code>
            </div>
            <div>
              <div className="font-medium mb-0.5">Insertar imagen alojada (ej. Cloudinary, S3):</div>
              <code className="bg-white px-2 py-1 rounded block">
                &lt;img src="https://…" alt="…" style="max-width:100%;border-radius:12px"&gt;
              </code>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

function StructuredEditor({
  copy,
  update,
}: {
  copy: PreventionLandingCopy;
  update: <K extends keyof PreventionLandingCopy>(key: K, value: PreventionLandingCopy[K]) => void;
}) {
  return (
    <>
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

      {/* Cabecera de la sección de planes (solo modo estructurado) */}
      <Section title="💳 Cabecera de la sección de planes">
        <div className="space-y-3">
          <TextField label="Título" value={copy.planesTitle} onChange={(v) => update("planesTitle", v)} />
          <TextArea label="Subtítulo" value={copy.planesSubtitle} onChange={(v) => update("planesSubtitle", v)} rows={2} />
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
    </>
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
