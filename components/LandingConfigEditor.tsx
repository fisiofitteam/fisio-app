"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUpload } from "@/components/ImageUpload";
import {
  applyVars,
  type RenewalLandingCopy,
  type ContractLandingCopy,
  type AgendaLandingCopy,
  type AgendaBlock,
  type AgendaGraciasCopy,
} from "@/lib/landing-content";

const SAMPLE = { nombre: "Marta", programa: "CONSOLIDA", meses: "4", importe: "199 €" };

// Hook de guardado por landing
function useSaver(key: string) {
  const router = useRouter();
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
        router.refresh();
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
  initialGracias,
}: {
  initialRenewal: RenewalLandingCopy;
  initialContract: ContractLandingCopy;
  initialAgenda: AgendaLandingCopy;
  initialGracias: AgendaGraciasCopy;
}) {
  const [tab, setTab] = useState<"renewal" | "contract" | "agenda" | "agenda_gracias">("renewal");

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-semibold text-lg">Landings</h2>
        <p className="text-xs text-neutral-500 mt-0.5">Textos de las páginas públicas. Los datos (nombre, importe…) y el diseño se inyectan solos.</p>
      </div>

      <div className="flex gap-1 mb-4 border-b border-neutral-200">
        {([["renewal", "💳 Renovación"], ["contract", "🧾 Contratar"], ["agenda", "📅 Agenda"], ["agenda_gracias", "✅ Confirmación"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === k ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "renewal" && <RenewalEditor initial={initialRenewal} />}
      {tab === "contract" && <ContractEditor initial={initialContract} />}
      {tab === "agenda" && <AgendaEditor initial={initialAgenda} />}
      {tab === "agenda_gracias" && <GraciasEditor initial={initialGracias} />}
    </div>
  );
}

// ── Confirmación de reserva ──
function GraciasEditor({ initial }: { initial: AgendaGraciasCopy }) {
  const [copy, setCopy] = useState(initial);
  const { save, saving, msg } = useSaver("agenda_gracias");
  function set<K extends keyof AgendaGraciasCopy>(k: K, val: AgendaGraciasCopy[K]) { setCopy((c) => ({ ...c, [k]: val })); }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => save(copy, (c) => c && setCopy(c))} disabled={saving} className="btn btn-primary text-sm">{saving ? "Guardando..." : "Guardar"}</button>
      </div>
      <Banner msg={msg} />
      <p className="text-[11px] text-neutral-500 bg-neutral-50 border border-neutral-200 rounded p-2 mb-4">
        Variables: <code>{"{nombre}"}</code> (nombre del lead) y <code>{"{fecha}"}</code> (fecha de la reserva).
      </p>
      <div className="space-y-4">
        <div className="card space-y-3">
          <h3 className="font-medium text-sm">Cabecera</h3>
          <Field label="Título con nombre"><input className="input text-sm" value={copy.heroTitleWithName} onChange={(e) => set("heroTitleWithName", e.target.value)} /></Field>
          <Field label="Título sin nombre"><input className="input text-sm" value={copy.heroTitleNoName} onChange={(e) => set("heroTitleNoName", e.target.value)} /></Field>
          <Field label="Línea de reserva (con fecha)"><input className="input text-sm" value={copy.reservedWithDate} onChange={(e) => set("reservedWithDate", e.target.value)} /></Field>
          <Field label="Línea de reserva (sin fecha)"><input className="input text-sm" value={copy.reservedNoDate} onChange={(e) => set("reservedNoDate", e.target.value)} /></Field>
        </div>
        <div className="card space-y-3">
          <h3 className="font-medium text-sm">Cómo será la videoconsulta</h3>
          <Field label="Título"><input className="input text-sm" value={copy.callTitle} onChange={(e) => set("callTitle", e.target.value)} /></Field>
          <Field label="Texto"><textarea className="input text-sm" rows={4} value={copy.callText} onChange={(e) => set("callText", e.target.value)} /></Field>
        </div>
        <div className="card space-y-3">
          <h3 className="font-medium text-sm">Vídeo pre-llamada</h3>
          <Field label="Etiqueta"><input className="input text-sm" value={copy.videoBadge} onChange={(e) => set("videoBadge", e.target.value)} /></Field>
          <Field label="Título"><input className="input text-sm" value={copy.videoTitle} onChange={(e) => set("videoTitle", e.target.value)} /></Field>
          <Field label="Intro"><textarea className="input text-sm" rows={2} value={copy.videoIntro} onChange={(e) => set("videoIntro", e.target.value)} /></Field>
          <Field label="ID de YouTube"><input className="input text-sm font-mono" value={copy.videoId} onChange={(e) => set("videoId", e.target.value)} placeholder="DnEAQXs09BI" /></Field>
          <BulletsEditor bullets={copy.videoBullets} onChange={(b) => set("videoBullets", b)} />
        </div>
        <div className="card space-y-3">
          <h3 className="font-medium text-sm">Cómo prepararte</h3>
          <Field label="Título"><input className="input text-sm" value={copy.prepTitle} onChange={(e) => set("prepTitle", e.target.value)} /></Field>
          <Field label="Texto"><textarea className="input text-sm" rows={3} value={copy.prepText} onChange={(e) => set("prepText", e.target.value)} /></Field>
        </div>
        <div className="card space-y-3">
          <h3 className="font-medium text-sm">Qué pasará antes (pasos)</h3>
          <Field label="Título"><input className="input text-sm" value={copy.stepsTitle} onChange={(e) => set("stepsTitle", e.target.value)} /></Field>
          <BulletsEditor bullets={copy.steps} onChange={(b) => set("steps", b)} />
        </div>
        <div className="card space-y-3">
          <h3 className="font-medium text-sm">Política de cancelación</h3>
          <Field label="Título"><input className="input text-sm" value={copy.policyTitle} onChange={(e) => set("policyTitle", e.target.value)} /></Field>
          <Field label="Texto"><textarea className="input text-sm" rows={4} value={copy.policyText} onChange={(e) => set("policyText", e.target.value)} /></Field>
          <Field label="Aviso importante (recuadro rojo)"><textarea className="input text-sm" rows={3} value={copy.policyWarning} onChange={(e) => set("policyWarning", e.target.value)} /></Field>
        </div>
        <div className="card space-y-3">
          <h3 className="font-medium text-sm">Contacto</h3>
          <Field label="Texto"><input className="input text-sm" value={copy.contactText} onChange={(e) => set("contactText", e.target.value)} /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="WhatsApp (número)"><input className="input text-sm" value={copy.whatsappNumber} onChange={(e) => set("whatsappNumber", e.target.value)} placeholder="+34..." /></Field>
            <Field label="Instagram (sin @)"><input className="input text-sm" value={copy.instagramHandle} onChange={(e) => set("instagramHandle", e.target.value)} placeholder="fisiofitcross" /></Field>
          </div>
        </div>
      </div>
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

// ── Contratar (con preview) ──
function ContractEditor({ initial }: { initial: ContractLandingCopy }) {
  const [copy, setCopy] = useState(initial);
  const [prev, setPrev] = useState<"RECUPERA" | "CONSOLIDA">("RECUPERA");
  const { save, saving, msg } = useSaver("contract");
  function setProg(prog: "RECUPERA" | "CONSOLIDA", patch: Partial<ContractLandingCopy["programs"]["RECUPERA"]>) {
    setCopy((c) => ({ ...c, programs: { ...c.programs, [prog]: { ...c.programs[prog], ...patch } } }));
  }
  const p = copy.programs[prev];

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => save(copy, (c) => c && setCopy(c))} disabled={saving} className="btn btn-primary text-sm">{saving ? "Guardando..." : "Guardar"}</button>
      </div>
      <Banner msg={msg} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
        {/* Preview */}
        <div className="lg:sticky lg:top-4 self-start">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-wide text-neutral-400 font-medium">Vista previa</span>
            <div className="flex gap-1">
              {(["RECUPERA", "CONSOLIDA"] as const).map((x) => (
                <button key={x} onClick={() => setPrev(x)} className={`text-[10px] px-2 py-0.5 rounded-full border ${prev === x ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200 text-neutral-500"}`}>{x}</button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl p-5" style={{ background: "#0A0A0A" }}>
            <div className="text-center mb-4">
              <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#737373" }}>Hola, Marta 👋</p>
              <h1 className="text-xl font-bold leading-tight" style={{ color: "#FAFAFA" }}>{copy.headline}</h1>
              <p className="text-xs mt-1" style={{ color: "#A3A3A3" }}>{copy.subheadline}</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: "rgba(20,20,20,0.85)", border: "1px solid #262626" }}>
              <div className="text-[9px] uppercase font-semibold mb-2" style={{ color: "#60A5FA" }}>{p.title}</div>
              <p className="text-xs mb-3" style={{ color: "#A3A3A3" }}>{p.subtitle}</p>
              <ul className="space-y-1.5 mb-4">
                {p.bullets.map((b, i) => (<li key={i} className="flex items-start gap-2 text-xs" style={{ color: "#D4D4D4" }}><span style={{ color: "#FFD400" }}>✓</span><span>{b}</span></li>))}
              </ul>
              <button className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: "#FFD400", color: "#0A0A0A" }} disabled>Pagar 299 € →</button>
            </div>
            <p className="text-[10px] text-center mt-3" style={{ color: "#525252" }}>{copy.footer}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Agenda (con imagen, bloques y preview) ──
function AgendaEditor({ initial }: { initial: AgendaLandingCopy }) {
  const [copy, setCopy] = useState(initial);
  const { save, saving, msg } = useSaver("agenda");
  function set<K extends keyof AgendaLandingCopy>(k: K, val: AgendaLandingCopy[K]) { setCopy((c) => ({ ...c, [k]: val })); }
  function setStat(i: number, patch: Partial<{ value: string; label: string }>) {
    setCopy((c) => ({ ...c, stats: c.stats.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));
  }
  function setBlock(i: number, patch: Partial<AgendaBlock>) {
    setCopy((c) => ({ ...c, blocks: c.blocks.map((b, k) => (k === i ? { ...b, ...patch } : b)) }));
  }
  function moveBlock(i: number, dir: -1 | 1) {
    setCopy((c) => {
      const next = [...c.blocks];
      const j = i + dir;
      if (j < 0 || j >= next.length) return c;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...c, blocks: next };
    });
  }
  function addBlock() {
    setCopy((c) => ({ ...c, blocks: [...c.blocks, { id: "b_" + Math.random().toString(36).slice(2, 8), title: "", text: "", imageUrl: "" }] }));
  }
  function removeBlock(i: number) {
    setCopy((c) => ({ ...c, blocks: c.blocks.filter((_, k) => k !== i) }));
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => save(copy, (c) => c && setCopy(c))} disabled={saving} className="btn btn-primary text-sm">{saving ? "Guardando..." : "Guardar"}</button>
      </div>
      <Banner msg={msg} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Editor */}
        <div className="space-y-4">
          <div className="card space-y-3">
            <h3 className="font-medium text-sm">Hero</h3>
            <Field label="Titular (línea 1)"><input className="input text-sm" value={copy.heroTitle1} onChange={(e) => set("heroTitle1", e.target.value)} /></Field>
            <Field label="Titular (línea 2, con degradado)"><input className="input text-sm" value={copy.heroTitle2} onChange={(e) => set("heroTitle2", e.target.value)} /></Field>
            <Field label="Subtítulo"><textarea className="input text-sm" rows={3} value={copy.heroSubtitle} onChange={(e) => set("heroSubtitle", e.target.value)} /></Field>
          </div>
          <div className="card space-y-3">
            <h3 className="font-medium text-sm">Prueba social</h3>
            <Field label="Foto de grupo del equipo">
              <ImageUpload value={copy.groupImageUrl} onChange={(url) => set("groupImageUrl", url)} hint="Recomendado: horizontal, ~1200×675 px (16:9). Máx 5 MB." />
            </Field>
            <Field label="Título"><input className="input text-sm" value={copy.authorityTitle} onChange={(e) => set("authorityTitle", e.target.value)} /></Field>
            <Field label="Texto"><textarea className="input text-sm" rows={3} value={copy.authorityText} onChange={(e) => set("authorityText", e.target.value)} /></Field>
            <div>
              <label className="text-xs text-neutral-500 block mb-1.5">Tarjetas de credenciales</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {copy.stats.map((s, i) => (
                  <div key={i} className="border border-neutral-200 rounded-lg p-2 space-y-2">
                    <input className="input text-sm font-bold" value={s.value} onChange={(e) => setStat(i, { value: e.target.value })} placeholder="+600" />
                    <input className="input text-sm" value={s.label} onChange={(e) => setStat(i, { label: e.target.value })} placeholder="atletas recuperados" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="card space-y-3">
            <h3 className="font-medium text-sm">Bloques libres (casos de éxito, etc.)</h3>
            {copy.blocks.map((b, i) => (
              <div key={b.id} className="border border-neutral-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase text-neutral-400 font-medium">Bloque {i + 1}</span>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => moveBlock(i, -1)} disabled={i === 0} className="w-6 h-6 rounded border border-neutral-200 text-neutral-500 disabled:opacity-30">↑</button>
                    <button type="button" onClick={() => moveBlock(i, 1)} disabled={i === copy.blocks.length - 1} className="w-6 h-6 rounded border border-neutral-200 text-neutral-500 disabled:opacity-30">↓</button>
                    <button type="button" onClick={() => removeBlock(i)} className="w-6 h-6 rounded border border-neutral-200 text-neutral-400 hover:text-red-600">✕</button>
                  </div>
                </div>
                <input className="input text-sm" value={b.title} onChange={(e) => setBlock(i, { title: e.target.value })} placeholder="Título del bloque" />
                <textarea className="input text-sm" rows={3} value={b.text} onChange={(e) => setBlock(i, { text: e.target.value })} placeholder="Texto" />
                <ImageUpload value={b.imageUrl} onChange={(url) => setBlock(i, { imageUrl: url })} hint="Opcional. Recomendado ~1200 px de ancho. Máx 5 MB." />
              </div>
            ))}
            <button onClick={addBlock} className="text-sm text-blue-600 hover:underline">+ Añadir bloque</button>
          </div>
        </div>

        {/* Preview */}
        <div className="lg:sticky lg:top-4 self-start">
          <div className="text-[10px] uppercase tracking-wide text-neutral-400 font-medium mb-1.5">Vista previa</div>
          <div className="rounded-2xl p-5" style={{ background: "#0A0A0A" }}>
            <div className="text-center mb-5">
              <h1 className="text-2xl font-bold leading-tight" style={{ color: "#FAFAFA", letterSpacing: "-0.03em" }}>
                {copy.heroTitle1} <span className="brand-gradient-text">{copy.heroTitle2}</span>
              </h1>
              <p className="text-xs mt-2 whitespace-pre-line" style={{ color: "#A3A3A3" }}>{copy.heroSubtitle}</p>
            </div>
            <div className="rounded-xl p-4 mb-3" style={{ background: "rgba(20,20,20,0.85)", border: "1px solid #262626" }}>
              {copy.groupImageUrl ? (
                <img src={copy.groupImageUrl} alt="" className="w-full rounded-lg mb-3" />
              ) : (
                <div className="rounded-lg mb-3 flex items-center justify-center text-xs" style={{ aspectRatio: "16/9", background: "rgba(31,31,31,0.6)", border: "1px dashed #404040", color: "#525252" }}>[Equipo FisioFit]</div>
              )}
              <h2 className="text-sm font-semibold mb-1" style={{ color: "#FAFAFA" }}>{copy.authorityTitle}</h2>
              <p className="text-xs whitespace-pre-line" style={{ color: "#A3A3A3" }}>{copy.authorityText}</p>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {copy.stats.map((s, i) => (
                  <div key={i} className="rounded-lg p-2 text-center" style={{ background: "rgba(31,31,31,0.7)", border: "1px solid #262626" }}>
                    <div className="text-base font-bold" style={{ color: "#FCD34D" }}>{s.value}</div>
                    <div className="text-[9px] uppercase" style={{ color: "#A3A3A3" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
            {copy.blocks.map((b) => (
              <div key={b.id} className="rounded-xl p-4 mb-3" style={{ background: "rgba(20,20,20,0.85)", border: "1px solid #262626" }}>
                {b.imageUrl && <img src={b.imageUrl} alt="" className="w-full rounded-lg mb-2" />}
                {b.title && <h2 className="text-sm font-semibold mb-1" style={{ color: "#FAFAFA" }}>{b.title}</h2>}
                {b.text && <p className="text-xs whitespace-pre-line" style={{ color: "#A3A3A3" }}>{b.text}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
