"use client";

import { useState } from "react";
import { applyVars, type RenewalLandingCopy } from "@/lib/landing-content";

const SAMPLE = { nombre: "Marta", programa: "CONSOLIDA", meses: "4", importe: "199 €" };

export function LandingConfigEditor({ initialRenewal }: { initialRenewal: RenewalLandingCopy }) {
  const [copy, setCopy] = useState<RenewalLandingCopy>(initialRenewal);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function set<K extends keyof RenewalLandingCopy>(key: K, value: RenewalLandingCopy[K]) {
    setCopy((c) => ({ ...c, [key]: value }));
  }
  function setBullet(i: number, value: string) {
    setCopy((c) => ({ ...c, bullets: c.bullets.map((b, k) => (k === i ? value : b)) }));
  }
  function moveBullet(i: number, dir: -1 | 1) {
    setCopy((c) => {
      const next = [...c.bullets];
      const j = i + dir;
      if (j < 0 || j >= next.length) return c;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...c, bullets: next };
    });
  }
  function removeBullet(i: number) {
    setCopy((c) => ({ ...c, bullets: c.bullets.filter((_, k) => k !== i) }));
  }
  function addBullet() {
    setCopy((c) => ({ ...c, bullets: [...c.bullets, ""] }));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/landing-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "renewal", content: copy }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.content) setCopy(data.content);
        setMsg({ kind: "ok", text: "Guardado. La landing de renovación ya muestra estos textos." });
      } else {
        setMsg({ kind: "err", text: data.error || "No se pudo guardar." });
      }
    } catch {
      setMsg({ kind: "err", text: "Error de red al guardar." });
    }
    setSaving(false);
  }

  const v = (t: string) => applyVars(t, SAMPLE);

  return (
    <div>
      <div className="flex justify-between items-start gap-3 flex-wrap mb-4">
        <div>
          <h2 className="font-semibold text-lg">Landings</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Textos de las páginas de pago. De momento: la de renovación. (Iremos añadiendo las demás aquí.)
          </p>
        </div>
        <button onClick={save} disabled={saving} className="btn btn-primary text-sm">
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>

      {msg && (
        <div
          className={`text-sm rounded-lg px-3 py-2 mb-4 ${
            msg.kind === "ok"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Editor */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-base">💳</span>
            <h3 className="font-medium">Landing de renovación</h3>
          </div>

          <p className="text-[11px] text-neutral-500 bg-neutral-50 border border-neutral-200 rounded p-2">
            Puedes usar estas variables y se sustituyen solas: <code>{"{nombre}"}</code> <code>{"{programa}"}</code> <code>{"{meses}"}</code> <code>{"{importe}"}</code>
          </p>

          <Field label="Titular">
            <input className="input text-sm" value={copy.headline} onChange={(e) => set("headline", e.target.value)} />
          </Field>

          <Field label="Subtítulo">
            <textarea className="input text-sm" rows={2} value={copy.subheadline} onChange={(e) => set("subheadline", e.target.value)} />
          </Field>

          <div>
            <label className="text-xs text-neutral-500 block mb-1.5">Mensajes (lo que consigue al renovar)</label>
            <div className="space-y-2">
              {copy.bullets.map((b, i) => (
                <div key={i} className="flex items-center gap-1">
                  <input className="input text-sm flex-1" value={b} onChange={(e) => setBullet(i, e.target.value)} placeholder="Mensaje..." />
                  <IconBtn label="Subir" disabled={i === 0} onClick={() => moveBullet(i, -1)}>↑</IconBtn>
                  <IconBtn label="Bajar" disabled={i === copy.bullets.length - 1} onClick={() => moveBullet(i, 1)}>↓</IconBtn>
                  <IconBtn label="Eliminar" danger onClick={() => removeBullet(i)}>✕</IconBtn>
                </div>
              ))}
            </div>
            <button onClick={addBullet} className="mt-2 text-sm text-blue-600 hover:underline">+ Añadir mensaje</button>
          </div>

          <Field label="Texto del botón">
            <input className="input text-sm" value={copy.ctaLabel} onChange={(e) => set("ctaLabel", e.target.value)} />
          </Field>

          <Field label="Texto tranquilizador (bajo el botón)">
            <input className="input text-sm" value={copy.reassurance} onChange={(e) => set("reassurance", e.target.value)} />
          </Field>
        </div>

        {/* Vista previa */}
        <div className="lg:sticky lg:top-4 self-start">
          <div className="text-[10px] uppercase tracking-wide text-neutral-400 font-medium mb-1.5">Vista previa (con datos de ejemplo)</div>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
            <div className="text-center mb-4">
              <div className="text-xl font-bold" style={{ letterSpacing: "-0.03em" }}>
                Fisio<span className="brand-gradient-text">Fit</span>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <h1 className="font-bold text-lg leading-tight mb-1">{v(copy.headline)}</h1>
              <p className="text-sm text-neutral-600 mb-3">{v(copy.subheadline)}</p>
              <ul className="space-y-1.5 mb-4">
                {copy.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-neutral-700">
                    <span className="text-emerald-500 mt-0.5">✓</span>
                    <span>{v(b)}</span>
                  </li>
                ))}
              </ul>
              <div className="bg-neutral-50 rounded-lg p-3 mb-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-neutral-500">Programa</span><span className="font-medium">{SAMPLE.programa}</span></div>
                <div className="flex justify-between"><span className="text-neutral-500">Duración</span><span className="font-medium">{SAMPLE.meses} meses</span></div>
                <div className="flex justify-between pt-1 border-t border-neutral-200"><span className="text-neutral-500">Total</span><span className="font-bold">{SAMPLE.importe}</span></div>
              </div>
              <button className="btn btn-primary w-full" disabled>{v(copy.ctaLabel)} · {SAMPLE.importe}</button>
              <p className="text-[11px] text-neutral-400 text-center mt-2">{v(copy.reassurance)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-neutral-500 block mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  disabled,
  danger,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`w-7 h-7 rounded border text-sm flex items-center justify-center flex-shrink-0 disabled:opacity-30 ${
        danger ? "border-neutral-200 text-neutral-400 hover:text-red-600 hover:border-red-300" : "border-neutral-200 text-neutral-500 hover:bg-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}
