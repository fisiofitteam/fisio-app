"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, MessageCircle } from "lucide-react";
import type { Section } from "@/lib/metodo/content";
import {
  NOTHING_TRIED, PHONE_PREFIXES, REQUEST_DURATIONS, REQUEST_IMPACTS, REQUEST_SPORTS, REQUEST_TRIED, REQUEST_ZONES,
  validateRequest, type RequestDraft, type RequestZone,
} from "@/lib/metodo/request";
import type { Track } from "./useMetodoAnalytics";
import "./metodo-request.css";

const STEPS = ["¿Dónde te duele?", "¿Cuánto tiempo llevas con dolor?", "Cuéntanos sobre tu entrenamiento", "¿Cómo te contactamos?"];

function Choice({ label, selected, onSelect, multi = false }: { label: string; selected: boolean; onSelect: () => void; multi?: boolean }) {
  return <button type="button" className="mfr-choice" aria-pressed={selected} onClick={onSelect}>
    <span className={`mfr-mark${multi ? " mfr-mark-multi" : ""}`} aria-hidden="true">{selected && <Check size={14} strokeWidth={3} />}</span>{label}
  </button>;
}

/**
 * Four quick steps → the request is stored with explicit consent and WhatsApp opens with
 * the case already written. Answers never enter analytics: only the step number does.
 */
export function MetodoRequestForm({ section, origin, initialZone, preview, track, directHref, directLabel }: {
  section: Section; origin: string | null; initialZone?: RequestZone; preview: boolean; track: Track; directHref: string; directLabel: string;
}) {
  const [step, setStep] = useState(initialZone ? 2 : 1);
  const [draft, setDraft] = useState<RequestDraft & { tried: string[] }>({ zone: initialZone, tried: [], prefix: "34", phone: "", name: "", detail: "", consent: false, origin });
  const [error, setError] = useState(""), [sending, setSending] = useState(false), [opened, setOpened] = useState(""), [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null), touched = useRef(false), advance = useRef<number>();
  useEffect(() => () => window.clearTimeout(advance.current), []);
  useEffect(() => {
    const h = heading.current;
    if (!touched.current || !h) return;
    h.focus({ preventScroll: true });
    // Keep the new question below the sticky header, without jumping if it is already in view.
    const top = h.getBoundingClientRect().top;
    if (top < 100 || top > window.innerHeight * 0.6) window.scrollBy({ top: top - 110, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [step, opened]);

  const set = (patch: Partial<typeof draft>) => { touched.current = true; setError(""); setDraft(d => ({ ...d, ...patch })); };
  const next = (from: number, value?: Partial<typeof draft>) => {
    const candidate = { ...draft, ...value };
    const check = validateRequest(candidate, from);
    if (!check.ok) { setError(check.error); setStep(check.step); return; }
    // A zone pre-selected by the ad link counts as step 1 once the athlete moves on.
    if (from === 2 && initialZone) track("form_step", "form", 1);
    track("form_step", "form", from);
    setStep(from + 1);
  };
  const pickAndAdvance = (from: number, patch: Partial<typeof draft>) => {
    set(patch);
    window.clearTimeout(advance.current);
    advance.current = window.setTimeout(() => next(from, patch), 160);
  };
  const toggleTried = (option: string) => {
    const has = draft.tried.includes(option);
    const tried = option === NOTHING_TRIED ? (has ? [] : [NOTHING_TRIED]) : has ? draft.tried.filter(t => t !== option) : [...draft.tried.filter(t => t !== NOTHING_TRIED), option];
    set({ tried });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const check = validateRequest(draft, 4);
    if (!check.ok) { setError(check.error); setStep(check.step); return; }
    if (preview) { setNotice("Vista previa: en la página pública aquí se guarda la solicitud y se abre WhatsApp."); return; }
    setSending(true); setError("");
    try {
      const res = await fetch("/api/metodo/solicitud", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.url !== "string") {
        if (typeof data.step === "number") setStep(data.step);
        throw new Error(typeof data.error === "string" ? data.error : "No hemos podido enviar tu caso. Inténtalo de nuevo.");
      }
      track("form_step", "form", 4);
      setOpened(data.url);
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No hemos podido enviar tu caso. Inténtalo de nuevo.");
    } finally { setSending(false); }
  }

  const progress = opened ? 4 : step;
  return <section id="valoracion" className="mf-request" aria-labelledby="valoracion-title" data-mf-reveal>
    <div className="mf-request-inner">
      <div className="mf-request-copy">
        {section.eyebrow && <p className="mf-eyebrow">{section.eyebrow}</p>}
        <h2 id="valoracion-title">{section.title}</h2>
        {section.body && <p className="mf-description">{section.body}</p>}
        <ol className="mf-request-promise">
          <li><span>1</span>Respondes cuatro preguntas.</li>
          <li><span>2</span>Se abre WhatsApp con tu caso escrito.</li>
          <li><span>3</span>Lo envías y el equipo lo revisa contigo.</li>
        </ol>
      </div>
      <form className="mfr-card" onSubmit={submit} noValidate>
        <div className="mfr-progress" aria-hidden="true">{[1, 2, 3, 4].map(n => <span key={n} data-done={n <= progress} />)}</div>
        <p className="mfr-count">{opened ? "Listo" : `Paso ${step} de 4`}{draft.zone && step > 1 && !opened && <> · {draft.zone}</>}</p>

        {opened ? <div className="mfr-step">
          <h3 ref={heading} tabIndex={-1}>Abriendo WhatsApp…</h3>
          <p className="mfr-help">Tu caso ya está escrito en el mensaje. Solo tienes que pulsar enviar.</p>
          <a className="mf-button mf-button-yellow mfr-submit" href={opened}><MessageCircle size={18} aria-hidden="true" />Abrir WhatsApp</a>
        </div> : <div className="mfr-step" key={step}>
          <h3 ref={heading} tabIndex={-1}>{STEPS[step - 1]}</h3>

          {step === 1 && <div className="mfr-grid" role="group" aria-label="Zona">{REQUEST_ZONES.map(z => <Choice key={z} label={z} selected={draft.zone === z} onSelect={() => pickAndAdvance(1, { zone: z })} />)}</div>}

          {step === 2 && <div className="mfr-grid mfr-grid-single" role="group" aria-label="Tiempo con dolor">{REQUEST_DURATIONS.map(v => <Choice key={v} label={v} selected={draft.duration === v} onSelect={() => pickAndAdvance(2, { duration: v })} />)}</div>}

          {step === 3 && <div className="mfr-groups">
            <fieldset><legend>¿Cómo afecta a tu entrenamiento?</legend><div className="mfr-grid mfr-grid-single">{REQUEST_IMPACTS.map(v => <Choice key={v} label={v} selected={draft.impact === v} onSelect={() => set({ impact: v })} />)}</div></fieldset>
            <fieldset><legend>¿Qué entrenas?</legend><div className="mfr-chips">{REQUEST_SPORTS.map(v => <Choice key={v} label={v} selected={draft.sport === v} onSelect={() => set({ sport: v })} />)}</div></fieldset>
            <fieldset><legend>¿Qué has probado ya? <span>Puedes marcar varias</span></legend><div className="mfr-chips">{REQUEST_TRIED.map(v => <Choice key={v} multi label={v} selected={draft.tried.includes(v)} onSelect={() => toggleTried(v)} />)}</div></fieldset>
          </div>}

          {step === 4 && <div className="mfr-fields">
            <label className="mfr-field"><span>Nombre</span><input name="name" autoComplete="given-name" maxLength={80} value={draft.name || ""} onChange={e => set({ name: e.target.value })} /></label>
            <div className="mfr-field"><span id="mfr-phone-label">Teléfono (WhatsApp)</span><div className="mfr-phone">
              <select aria-label="Prefijo" value={draft.prefix} onChange={e => set({ prefix: e.target.value })}>{PHONE_PREFIXES.map(p => <option key={p.code} value={p.code}>+{p.code} {p.label}</option>)}</select>
              <input aria-labelledby="mfr-phone-label" type="tel" inputMode="tel" autoComplete="tel-national" maxLength={24} placeholder="600 000 000" value={draft.phone || ""} onChange={e => set({ phone: e.target.value })} />
            </div></div>
            <label className="mfr-field"><span>¿Quieres contarnos algo más? <em>Opcional</em></span><textarea rows={3} maxLength={500} placeholder="Por ejemplo, qué movimiento te molesta más o qué te gustaría recuperar." value={draft.detail || ""} onChange={e => set({ detail: e.target.value })} /></label>
            <label className="mfr-consent"><input type="checkbox" checked={draft.consent === true} onChange={e => set({ consent: e.target.checked })} /><span>Acepto que FisioFitTeam trate la información sobre mi dolor y mis datos de contacto para valorar mi caso y escribirme por WhatsApp. <a href="/metodo/privacidad" target="_blank" rel="noopener noreferrer">Más información</a></span></label>
          </div>}

          <p className="mfr-error" role="alert" aria-live="assertive">{error}</p>
          {notice && <p className="mfr-help" role="status">{notice}</p>}

          <div className="mfr-actions">
            {step > 1 && <button type="button" className="mfr-back" onClick={() => { setError(""); setStep(step - 1); }}><ArrowLeft size={16} aria-hidden="true" />Atrás</button>}
            {step === 3 && <button type="button" className="mf-button mfr-next" onClick={() => next(3)}>Continuar<ArrowRight size={17} aria-hidden="true" /></button>}
            {step === 4 && <button type="submit" className="mf-button mf-button-yellow mfr-submit" disabled={sending}><MessageCircle size={18} aria-hidden="true" />{sending ? "Enviando…" : "Enviar y abrir WhatsApp"}</button>}
          </div>
          {step === 4 && <p className="mfr-help">Se abrirá WhatsApp con tu caso escrito. Solo se envía si tú pulsas enviar.</p>}
        </div>}
        <p className="mfr-direct">¿Prefieres escribirnos sin formulario? <a href={directHref}>{directLabel}</a></p>
      </form>
    </div>
  </section>;
}
