"use client";

import { useState } from "react";
import {
  applyVars,
  type RenewalLandingCopy,
  type ContractLandingCopy,
  type AgendaLandingCopy,
} from "@/lib/landing-content";

const SAMPLE = { nombre: "Marta", programa: "CONSOLIDA", meses: "4", importe: "199 €" };

// Hook de guardado por landing
function useSaver(key: string) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  async function save(content: unknown, onOk?: (c: any) => void) {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/landing-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, content }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onOk?.(data.content);
        setMsg({ kind: "ok", text: "Guardado." });
      } else setMsg({ kind: "err", text: data.error || "No se pudo guardar." });
    } catch {
      setMsg({ kind: "err", text: "Error de red al guardar." });
    }
    setSaving(false);
  }
  return { save, saving, msg };
}

function Banner({ msg }: { msg: { kind: "ok" | "err"; text: string } | null }) {
  if (!msg) return null;
  return (
    <div className={`text-sm rounded-lg px-3 py-2 mb-4 ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
      {msg.text}
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

function BulletsEditor({ bullets, onChange }: { bullets: string[]; onChange: (b: string[]) => void }) {
  return (
    <div>
      <label className="text-xs text-neutral-500 block mb-1.5">Beneficios / bullets</label>
      <div className="space-y-2">
        {bullets.map((b, i) => (
          <div key={i} className="flex items-center gap-1">
            <input className="input text-sm flex-1" value={b} onChange={(e) => onChange(bullets.map((x, k) => (k === i ? e.target.value : x)))} />
            <button type="button" onClick={() => onChange(bullets.filter((_, k) => k !== i))} className="w-7 h-7 rounded border border-neutral-200 text-neutral-400 hover:text-red-600 flex-shrink-0">✕</button>
          </div>
        ))}
      </div>
      <button onClick={() => onChange([...bullets, ""])} className="mt-2 text-sm text-blue-600 hover:underline">+ Añadir bullet</button>
    </div>
  );
}

export function LandingConfigEditor({
  initialRenewal,
  initialContract,
  initialAgenda,
}: {
  initialRenewal: RenewalLandingCopy;
  initialContract: ContractLandingCopy;
  initialAgenda: AgendaLandingCopy;
}) {
  const [tab, setTab] = useState<"renewal" | "contract" | "agenda">("renewal");

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-semibold text-lg">Landings</h2>
        <p className="text-xs text-neutral-500 mt-0.5">Textos de las páginas públicas. Los datos (nombre, importe…) y el diseño se inyectan solos.</p>
      </div>

      <div className="flex gap-1 mb-4 border-b border-neutral-200">
        {([["renewal", "💳 Renovación"], ["contract", "🧾 Contratar"], ["agenda", "📅 Agenda"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === k ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "renewal" && <RenewalEditor initial={initialRenewal} />}
      {tab === "contract" && <ContractEditor initial={initialContract} />}
      {tab === "agenda" && <AgendaEditor initial={initialAgenda} />}
    </div>
  );
}

// ── Renovación (con vista previa) ──
function RenewalEditor({ initial }: { initial: RenewalLandingCopy }) {
  const [copy, setCopy] = useState(initial);
  const { save, saving, msg } = useSaver("renewal");
  const v = (t: string) => applyVars(t, SAMPLE);
  function set<K extends keyof RenewalLandingCopy>(k: K, val: RenewalLandingCopy[K]) { setCopy((c) => ({ ...c, [k]: val })); }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => save(copy, (c) => c && setCopy(c))} disabled={saving} className="btn btn-primary text-sm">{saving ? "Guardando..." : "Guardar"}</button>
      </div>
      <Banner msg={msg} />
      <p className="text-[11px] text-neutral-500 bg-neutral-50 border border-neutral-200 rounded p-2 mb-4">
        Variables: <code>{"{nombre}"}</code> <code>{"{programa}"}</code> <code>{"{meses}"}</code> <code>{"{importe}"}</code>
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card space-y-4">
          <Field label="Titular"><input className="input text-sm" value={copy.headline} onChange={(e) => set("headline", e.target.value)} /></Field>
          <Field label="Subtítulo"><textarea className="input text-sm" rows={2} value={copy.subheadline} onChange={(e) => set("subheadline", e.target.value)} /></Field>
          <BulletsEditor bullets={copy.bullets} onChange={(b) => set("bullets", b)} />
          <Field label="Texto del botón"><input className="input text-sm" value={copy.ctaLabel} onChange={(e) => set("ctaLabel", e.target.value)} /></Field>
          <Field label="Texto bajo el botón"><input className="input text-sm" value={copy.reassurance} onChange={(e) => set("reassurance", e.target.value)} /></Field>
        </div>
        <div className="lg:sticky lg:top-4 self-start">
          <div className="text-[10px] uppercase tracking-wide text-neutral-400 font-medium mb-1.5">Vista previa</div>
          <div className="rounded-2xl p-5" style={{ background: "#0A0A0A" }}>
            <div className="text-center mb-5">
              <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: "#737373" }}>Tu renovación</p>
              <h1 className="text-xl font-bold leading-tight mb-1.5" style={{ color: "#FAFAFA" }}>{v(copy.headline)}</h1>
              <p className="text-xs" style={{ color: "#A3A3A3" }}>{v(copy.subheadline)}</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: "rgba(20,20,20,0.85)", border: "1px solid #262626" }}>
              <ul className="space-y-2 mb-4">
                {copy.bullets.map((b, i) => (<li key={i} className="flex items-start gap-2 text-xs" style={{ color: "#D4D4D4" }}><span style={{ color: "#FFD400" }}>✓</span><span>{v(b)}</span></li>))}
              </ul>
              <button className="w-full py-3 rounded-xl text-sm font-semibold" style={{ background: "#FFD400", color: "#0A0A0A" }} disabled>{v(copy.ctaLabel)} · {SAMPLE.importe} →</button>
              <p className="text-[10px] text-center mt-3" style={{ color: "#737373" }}>{v(copy.reassurance)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Contratar ──
function ContractEditor({ initial }: { initial: ContractLandingCopy }) {
  const [copy, setCopy] = useState(initial);
  const { save, saving, msg } = useSaver("contract");
  function setProg(prog: "RECUPERA" | "CONSOLIDA", patch: Partial<ContractLandingCopy["programs"]["RECUPERA"]>) {
    setCopy((c) => ({ ...c, programs: { ...c.programs, [prog]: { ...c.programs[prog], ...patch } } }));
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => save(copy, (c) => c && setCopy(c))} disabled={saving} className="btn btn-primary text-sm">{saving ? "Guardando..." : "Guardar"}</button>
      </div>
      <Banner msg={msg} />
      <div className="space-y-4">
        <div className="card space-y-3">
          <h3 className="font-medium text-sm">Encabezado</h3>
          <Field label="Titular"><input className="input text-sm" value={copy.headline} onChange={(e) => setCopy((c) => ({ ...c, headline: e.target.value }))} /></Field>
          <Field label="Subtítulo"><input className="input text-sm" value={copy.subheadline} onChange={(e) => setCopy((c) => ({ ...c, subheadline: e.target.value }))} /></Field>
          <Field label="Pie (texto pequeño abajo)"><input className="input text-sm" value={copy.footer} onChange={(e) => setCopy((c) => ({ ...c, footer: e.target.value }))} /></Field>
        </div>
        {(["RECUPERA", "CONSOLIDA"] as const).map((prog) => (
          <div key={prog} className="card space-y-3">
            <h3 className="font-medium text-sm">Programa {prog}</h3>
            <Field label="Título"><input className="input text-sm" value={copy.programs[prog].title} onChange={(e) => setProg(prog, { title: e.target.value })} /></Field>
            <Field label="Subtítulo"><input className="input text-sm" value={copy.programs[prog].subtitle} onChange={(e) => setProg(prog, { subtitle: e.target.value })} /></Field>
            <BulletsEditor bullets={copy.programs[prog].bullets} onChange={(b) => setProg(prog, { bullets: b })} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Agenda ──
function AgendaEditor({ initial }: { initial: AgendaLandingCopy }) {
  const [copy, setCopy] = useState(initial);
  const { save, saving, msg } = useSaver("agenda");
  function set<K extends keyof AgendaLandingCopy>(k: K, val: AgendaLandingCopy[K]) { setCopy((c) => ({ ...c, [k]: val })); }
  function setStat(i: number, patch: Partial<{ value: string; label: string }>) {
    setCopy((c) => ({ ...c, stats: c.stats.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => save(copy, (c) => c && setCopy(c))} disabled={saving} className="btn btn-primary text-sm">{saving ? "Guardando..." : "Guardar"}</button>
      </div>
      <Banner msg={msg} />
      <div className="space-y-4">
        <div className="card space-y-3">
          <h3 className="font-medium text-sm">Hero</h3>
          <Field label="Titular (línea 1)"><input className="input text-sm" value={copy.heroTitle1} onChange={(e) => set("heroTitle1", e.target.value)} /></Field>
          <Field label="Titular (línea 2, con degradado)"><input className="input text-sm" value={copy.heroTitle2} onChange={(e) => set("heroTitle2", e.target.value)} /></Field>
          <Field label="Subtítulo"><textarea className="input text-sm" rows={3} value={copy.heroSubtitle} onChange={(e) => set("heroSubtitle", e.target.value)} /></Field>
        </div>
        <div className="card space-y-3">
          <h3 className="font-medium text-sm">Bloque de autoridad</h3>
          <Field label="Título"><input className="input text-sm" value={copy.authorityTitle} onChange={(e) => set("authorityTitle", e.target.value)} /></Field>
          <Field label="Texto"><textarea className="input text-sm" rows={3} value={copy.authorityText} onChange={(e) => set("authorityText", e.target.value)} /></Field>
        </div>
        <div className="card space-y-3">
          <h3 className="font-medium text-sm">Tarjetas de credenciales</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {copy.stats.map((s, i) => (
              <div key={i} className="border border-neutral-200 rounded-lg p-2 space-y-2">
                <input className="input text-sm font-bold" value={s.value} onChange={(e) => setStat(i, { value: e.target.value })} placeholder="+600" />
                <input className="input text-sm" value={s.label} onChange={(e) => setStat(i, { label: e.target.value })} placeholder="atletas recuperados" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
