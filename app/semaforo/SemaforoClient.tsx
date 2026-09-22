"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Barlow_Condensed, Archivo } from "next/font/google";
import {
  Q,
  FAMILIES,
  FAM_OPTS,
  TESTS,
  COPY,
  FAM_ADVICE,
  COLOR_NAME,
  type FamilyValue,
  type Question,
} from "@/lib/semaforo/questions";
import { evaluate, type RespuestasSemaforo } from "@/lib/semaforo/evaluate";
import { CONSENT_TEXT, IG_PARAM_NAME, CAMPAIGN_PARAM_NAME, PRIVACY_URL, sanitizeInstagram, sanitizeCampaign } from "@/lib/semaforo/config";

const display = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" });
const body = Archivo({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });

/**
 * Landing pública del test del Semáforo. Portada 1:1 del prototipo
 * semaforo-hombro.html. Toda la lógica de puntuación vive en
 * lib/semaforo/evaluate.ts — este componente solo maneja UI y
 * persistencia contra /api/semaforo.
 *
 * Flujo:
 *   - Intro: consentimiento obligatorio + botón "Empezar". Al pulsar,
 *     POST /api/semaforo → devuelve id, arranca el test.
 *   - Cada paso: PATCH con las respuestas acumuladas + ultimoPaso,
 *     sin bloquear la UI. Si falla, el test sigue.
 *   - Si la pregunta "seguridad" tiene banderas → cerrar como ALARMA
 *     y ir a la pantalla de alarma.
 *   - Al llegar al final: cerrar como COMPLETADO (el server recalcula
 *     el color) y pintar resultado.
 *   - Click en WhatsApp: sendBeacon a /api/semaforo/[id]/whatsapp
 *     antes de abrir wa.me.
 */

type Screen = "intro" | "quiz" | "alarma" | "result";

type Answers = RespuestasSemaforo;

// ─── CSS del prototipo, adaptado al look de la landing /agenda:
//     fondo con box.jpg + overlay negro, tarjetas oscuras translúcidas,
//     tipografía Barlow Condensed + Archivo, acento amarillo dorado.
//     Los colores del propio semáforo (g/a/r) se mantienen vivos porque
//     son la marca del test. ────────────────────────────────────────────
const STYLES = `
[data-scope="semaforo"] {
  --ink:#FAFAFA;
  --ink-strong:#FFFFFF;
  --muted:#A3A3A3;
  --muted-2:#737373;
  --line:#262626;
  --line-2:#404040;
  --surface:rgba(20,20,20,0.85);
  --surface-2:rgba(31,31,31,0.85);
  --surface-3:rgba(38,38,38,0.75);
  --paper:#0A0A0A;
  --housing:#0A0A0A;
  --off:#1F1F1F;
  --green:#22C55E;
  --amber:#F59E0B;
  --red:#EF4444;
  --grey:#9AA2AC;
  --gold-1:#FCD34D;
  --gold-2:#F59E0B;
  --wa:#1FA855;
}
.sf-bg{
  position:fixed;inset:0;z-index:0;
  background-color:#0A0A0A;
  background-image:url('/box.jpg');
  background-size:cover;background-position:center;background-attachment:fixed;
}
.sf-bg-overlay{
  position:fixed;inset:0;z-index:0;
  background:rgba(10,10,10,0.72);
}
.sf-scope{
  position:relative;z-index:1;
  min-height:100vh;
  color:var(--ink);
  font-family:var(--font-body),system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  font-size:17px;line-height:1.55;-webkit-font-smoothing:antialiased;
}
.sf-scope *,.sf-scope *::before,.sf-scope *::after{box-sizing:border-box}
.sf-wrap{max-width:640px;margin:0 auto;padding:32px 20px 56px}
.sf-brand{
  font-family:var(--font-display);font-weight:800;font-size:15px;
  letter-spacing:.14em;text-transform:uppercase;color:var(--muted-2);
  margin:0 0 28px;
}
.sf-brand-accent{
  background:linear-gradient(135deg,var(--gold-1) 0%,var(--gold-2) 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
}
.sf-scope h1,.sf-scope h2,.sf-scope h3{font-family:var(--font-display);line-height:1.02;margin:0;color:var(--ink-strong)}
.sf-scope h1{font-size:clamp(40px,11vw,64px);font-weight:800;letter-spacing:-.03em}
.sf-scope h2{font-size:clamp(28px,7.5vw,38px);font-weight:700;letter-spacing:-.02em}
.sf-scope h3{font-size:22px;font-weight:700}
.sf-scope p{margin:0 0 14px}
.sf-lead{font-size:18px;color:var(--muted);max-width:36ch}
.sf-small{font-size:13px;color:var(--muted-2)}
.sf-scope button{font:inherit;color:inherit;cursor:pointer}
.sf-scope :focus-visible{outline:3px solid var(--gold-1);outline-offset:3px;border-radius:6px}

/* Traffic light */
.sf-light{background:#0A0A0A;border-radius:28px;padding:14px;display:inline-flex;flex-direction:column;gap:12px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06),0 10px 40px rgba(0,0,0,.45)}
.sf-light.row{flex-direction:row}
.sf-bulb{width:46px;height:46px;border-radius:50%;background:var(--off);transition:background .35s,box-shadow .35s}
.sf-light.big .sf-bulb{width:78px;height:78px}
.sf-bulb.on.g{background:var(--green);box-shadow:0 0 0 4px rgba(34,197,94,.22),0 0 42px rgba(34,197,94,.65)}
.sf-bulb.on.a{background:var(--amber);box-shadow:0 0 0 4px rgba(245,158,11,.22),0 0 42px rgba(245,158,11,.65)}
.sf-bulb.on.r{background:var(--red);box-shadow:0 0 0 4px rgba(239,68,68,.22),0 0 42px rgba(239,68,68,.65)}

/* Intro */
.sf-intro{display:grid;grid-template-columns:1fr auto;gap:22px;align-items:start;margin-bottom:8px}
.sf-intro .sf-light{margin-top:6px}
.sf-need{
  margin:26px 0 6px;padding:16px 18px;border-radius:12px;
  background:var(--surface);border:1px solid var(--line);backdrop-filter:blur(8px);
  color:var(--ink);
}
.sf-need p{margin:0}
.sf-consent{
  margin:20px 0 22px;padding:14px 16px;border-radius:12px;
  background:var(--surface);border:1px solid var(--line);backdrop-filter:blur(8px);
  display:flex;gap:12px;align-items:flex-start;font-size:14px;color:var(--ink);line-height:1.45;
}
.sf-consent input{margin-top:3px;flex:none;width:20px;height:20px;accent-color:var(--gold-1);cursor:pointer}
.sf-consent a{color:var(--gold-1);text-decoration:underline}
.sf-btn{
  display:inline-flex;align-items:center;justify-content:center;gap:10px;
  border:0;border-radius:14px;padding:17px 24px;font-weight:700;font-size:17px;
  background:#FAFAFA;color:#0A0A0A;text-decoration:none;width:100%;font-family:var(--font-body);
  transition:transform .12s ease,opacity .12s ease;
}
.sf-btn:not(:disabled):hover{transform:translateY(-1px)}
.sf-btn:disabled{opacity:.35;cursor:not-allowed;background:#404040;color:#A3A3A3}
.sf-btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line-2)}
.sf-btn.wa{background:var(--wa);color:#fff}
.sf-btn.wa:disabled{background:#1F1F1F;color:#737373}
.sf-disclaimer{margin-top:18px;color:var(--muted-2)}

/* Quiz */
.sf-top{display:flex;align-items:center;gap:14px;margin-bottom:26px}
.sf-back{background:none;border:0;padding:8px 4px;color:var(--muted);font-weight:600}
.sf-back.hidden{visibility:hidden}
.sf-progress{flex:1;height:6px;border-radius:6px;background:var(--line);overflow:hidden}
.sf-progress span{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--gold-1),var(--gold-2));transition:width .3s}
.sf-count{font-size:13px;color:var(--muted-2);font-variant-numeric:tabular-nums;min-width:52px;text-align:right;letter-spacing:.02em}
.sf-section{font-weight:700;color:var(--gold-1);font-size:12px;text-transform:uppercase;letter-spacing:.14em;margin-bottom:10px}
.sf-qtitle{margin-bottom:14px}
.sf-help{color:var(--muted);margin-bottom:18px}
.sf-howto{
  background:var(--surface);border:1px solid var(--line);border-radius:14px;
  padding:16px 18px;margin:0 0 20px;backdrop-filter:blur(8px);color:var(--ink);
}
.sf-howto ol{margin:0;padding-left:20px}
.sf-howto li{margin:0 0 6px}
.sf-warn{margin:10px 0 0;font-size:13px;color:var(--gold-1)}
.sf-opts{display:grid;gap:10px}
.sf-opt{
  display:flex;gap:14px;align-items:center;text-align:left;
  background:var(--surface);border:1px solid var(--line);border-radius:14px;
  padding:16px 16px;width:100%;color:var(--ink);backdrop-filter:blur(8px);
  transition:border-color .15s,background .15s,transform .1s;
}
.sf-opt:hover{border-color:var(--line-2);background:var(--surface-2)}
.sf-opt[aria-pressed="true"]{border-color:var(--gold-1);background:var(--surface-2);box-shadow:0 0 0 2px rgba(252,211,77,.15)}
.sf-opt .sf-dot{flex:none;width:14px;height:14px;border-radius:50%;background:var(--line-2)}
.sf-opt[aria-pressed="true"] .sf-dot{background:var(--gold-1)}
.sf-opt .sf-dot.g{background:var(--green)}.sf-opt .sf-dot.a{background:var(--amber)}.sf-opt .sf-dot.r{background:var(--red)}
.sf-matrix{display:grid;gap:14px}
.sf-fam{
  background:var(--surface);border:1px solid var(--line);border-radius:14px;
  padding:16px;backdrop-filter:blur(8px);
}
.sf-fam strong{display:block;font-size:16px;color:var(--ink-strong)}
.sf-fam .sf-ex{font-size:13px;color:var(--muted);margin-bottom:12px}
.sf-seg{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.sf-seg button{
  border:1px solid var(--line);background:rgba(10,10,10,0.5);border-radius:10px;
  padding:10px 10px;font-size:14px;font-weight:500;display:flex;align-items:center;
  gap:8px;text-align:left;font-family:var(--font-body);color:var(--ink);
  transition:border-color .12s,background .12s;
}
.sf-seg button:hover{border-color:var(--line-2)}
.sf-seg button[aria-pressed="true"]{border-color:var(--gold-1);background:rgba(252,211,77,.08);font-weight:700}
.sf-seg .sf-dot{flex:none;width:10px;height:10px;border-radius:50%}
.sf-field{
  width:100%;font:inherit;font-size:16px;padding:15px 16px;border-radius:12px;
  border:1px solid var(--line);background:rgba(10,10,10,0.5);color:var(--ink);
  font-family:var(--font-body);
}
.sf-field:focus{outline:none;border-color:var(--gold-1);background:rgba(10,10,10,0.7)}
.sf-field::placeholder{color:var(--muted-2)}
.sf-next{margin-top:22px}

/* Result */
.sf-res-head{display:grid;grid-template-columns:auto 1fr;gap:22px;align-items:center;margin-bottom:26px}
.sf-verdict{font-family:var(--font-display);font-weight:800;font-size:20px;margin-bottom:6px;letter-spacing:.02em;text-transform:uppercase}
.sf-verdict.g{color:var(--green)}.sf-verdict.a{color:var(--amber)}.sf-verdict.r{color:var(--red)}
.sf-res-head h2{font-size:clamp(28px,7.5vw,40px)}
.sf-alert{
  border-radius:14px;padding:16px 18px;margin:0 0 26px;
  background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.4);color:#FCA5A5;
}
.sf-alert p:last-child{margin:0}
.sf-alert strong{color:#FCA5A5}
.sf-block{margin:0 0 30px}
.sf-block h3{margin-bottom:12px}
.sf-why{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.sf-why li{
  padding:12px 14px 12px 16px;border-radius:12px;
  background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--line-2);
  backdrop-filter:blur(8px);color:var(--ink);
}
.sf-why li.neg{border-left-color:var(--red)}.sf-why li.mid{border-left-color:var(--amber)}.sf-why li.pos{border-left-color:var(--green)}
.sf-map{display:grid;gap:8px}
.sf-mrow{
  display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:start;
  padding:14px;border-radius:12px;background:var(--surface);border:1px solid var(--line);
  backdrop-filter:blur(8px);
}
.sf-mrow .sf-dot{width:16px;height:16px;border-radius:50%;margin-top:4px}
.sf-mrow strong{display:block;color:var(--ink-strong)}
.sf-mrow span{font-size:14px;color:var(--muted)}
.sf-g-bg{background:var(--green)}.sf-a-bg{background:var(--amber)}.sf-r-bg{background:var(--red)}.sf-n-bg{background:var(--grey)}
.sf-video{
  position:relative;aspect-ratio:9/16;max-height:560px;width:100%;
  border-radius:16px;overflow:hidden;background:#000;
  display:grid;place-items:center;color:#FAFAFA;text-align:center;
  border:1px solid var(--line);
}
.sf-video iframe,.sf-video video{position:absolute;inset:0;width:100%;height:100%;border:0}
.sf-video .sf-ph{padding:24px;max-width:30ch}
.sf-video .sf-play{width:64px;height:64px;border-radius:50%;border:3px solid currentColor;display:grid;place-items:center;margin:0 auto 14px}
.sf-video .sf-play::after{content:"";border-left:18px solid currentColor;border-top:11px solid transparent;border-bottom:11px solid transparent;margin-left:5px}
.sf-tips{margin:0;padding-left:20px}
.sf-tips li{margin-bottom:10px;color:var(--ink)}
.sf-cta{
  background:var(--surface);border:1px solid var(--gold-1);border-radius:18px;
  padding:22px 20px;backdrop-filter:blur(8px);
  box-shadow:0 0 0 4px rgba(252,211,77,.06);
}
.sf-cta h3{margin-bottom:8px}
.sf-cta .sf-btn{margin-top:10px}
.sf-again{margin-top:14px}
.sf-screen.sf-enter{animation:sf-in .28s ease-out}
@keyframes sf-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.sf-screen.sf-enter{animation:none}}
@media (max-width:380px){.sf-bulb{width:38px;height:38px}.sf-light.big .sf-bulb{width:62px;height:62px}.sf-seg{grid-template-columns:1fr}}
`;

function TrafficLight({ on, big = false }: { on: "g" | "a" | "r" | null; big?: boolean }) {
  return (
    <div className={"sf-light" + (big ? " big" : "")} role="img" aria-label={on ? `Semáforo en ${COLOR_NAME[on]}` : "Semáforo"}>
      {(["r", "a", "g"] as const).map((c) => (
        <div key={c} className={"sf-bulb " + c + (on === c ? " on" : "")} />
      ))}
    </div>
  );
}

function IntroLightAnimated() {
  const [phase, setPhase] = useState<"" | "r" | "a" | "g">("");
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("g");
      return;
    }
    const t1 = setTimeout(() => setPhase("r"), 250);
    const t2 = setTimeout(() => setPhase("a"), 250 + 380);
    const t3 = setTimeout(() => setPhase("g"), 250 + 380 * 2);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);
  return <TrafficLight on={phase || null} />;
}

function VideoBlock({ url, label }: { url: string; label: string }) {
  if (!url) {
    return (
      <div className="sf-video">
        <div className="sf-ph">
          <div className="sf-play" />
          <p>{label}</p>
        </div>
      </div>
    );
  }
  const isMp4 = /\.mp4($|\?)/.test(url);
  return (
    <div className="sf-video">
      {isMp4 ? (
        <video src={url} controls playsInline preload="metadata" />
      ) : (
        <iframe src={url} title={label} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      )}
    </div>
  );
}

export function SemaforoClient({
  whatsappNumber,
  videoUrls,
  legalRevisado, // eslint-disable-line @typescript-eslint/no-unused-vars
}: {
  whatsappNumber: string;
  videoUrls: Record<"verde" | "ambar" | "rojo" | "alarma", string>;
  legalRevisado: boolean;
}) {
  // ─── Estado principal ──
  const [screen, setScreen] = useState<Screen>("intro");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [consent, setConsent] = useState(false);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // ─── Identificación desde querystring (?ig, ?c) ──
  const igFromUrl = useRef<string | null>(null);
  const campaignFromUrl = useRef<string | null>(null);
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      igFromUrl.current = sanitizeInstagram(params.get(IG_PARAM_NAME));
      campaignFromUrl.current = sanitizeCampaign(params.get(CAMPAIGN_PARAM_NAME));
    } catch { /* SSR safety */ }
  }, []);

  // ─── Datos del paso final si no llegó ig por URL ──
  const [finalName, setFinalName] = useState("");
  const [finalContact, setFinalContact] = useState("");
  const [finalContactType, setFinalContactType] = useState<"instagram" | "telefono">("instagram");

  // ─── Persistencia de respuestas ─────────────────────────────────
  async function patchProgress(patch: Record<string, unknown>) {
    if (!responseId) return;
    try {
      await fetch(`/api/semaforo/${responseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
        keepalive: true,
      });
    } catch { /* silencioso — no bloquear UI */ }
  }

  // ─── Iniciar test ──
  async function start() {
    if (!consent || starting) return;
    setStarting(true);
    try {
      const res = await fetch("/api/semaforo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instagram: igFromUrl.current,
          campana: campaignFromUrl.current,
          consentimiento: true,
          website: "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.id) {
        setResponseId(data.id);
        setScreen("quiz");
        setStep(0);
      } else {
        alert(data?.error ?? "No se pudo iniciar el test");
      }
    } finally {
      setStarting(false);
    }
  }

  // ─── Avance / retroceso ──
  function goBack() {
    if (step === 0) { setScreen("intro"); return; }
    setStep(step - 1);
  }

  function next() {
    const q = Q[step];
    // Bandera roja en la primera pregunta → cortar a alarma.
    if (q.id === "seguridad") {
      const banderas = (answers.seguridad ?? []).filter((v) => v !== "ninguna");
      if (banderas.length > 0) {
        patchProgress({
          respuestas: answers as Record<string, unknown>,
          ultimoPaso: step,
          cerrar: "alarma",
          banderas,
        });
        setScreen("alarma");
        return;
      }
    }
    const nextStep = step + 1;
    if (nextStep >= Q.length) {
      // Cierre a COMPLETADO — el server recalcula el color.
      patchProgress({
        respuestas: answers as Record<string, unknown>,
        ultimoPaso: step,
        nombre: answers.nombre ?? null,
        // Si no había ig por URL y el paso final es nombre, no tenemos
        // aún el contacto — se persiste en el resultado si el usuario
        // lo introduce después. Aquí ya cerramos.
        cerrar: "completado",
      });
      setScreen("result");
      return;
    }
    // Guardar progreso normal.
    patchProgress({
      respuestas: answers as Record<string, unknown>,
      ultimoPaso: nextStep,
    });
    setStep(nextStep);
  }

  // ─── WhatsApp click ─────────────────────────────────────────────
  function trackWhatsappClick() {
    if (!responseId) return;
    try {
      const url = `/api/semaforo/${responseId}/whatsapp`;
      if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
        navigator.sendBeacon(url, new Blob([], { type: "application/json" }));
      } else {
        fetch(url, { method: "POST", keepalive: true }).catch(() => {});
      }
    } catch {}
  }

  // ─── Render por pantalla ────────────────────────────────────────
  return (
    <div data-scope="semaforo" className={`sf-scope ${display.variable} ${body.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div className="sf-bg" aria-hidden />
      <div className="sf-bg-overlay" aria-hidden />
      <main className="sf-wrap sf-screen sf-enter" key={screen + "-" + step} aria-live="polite">
        {screen === "intro" && (
          <IntroScreen consent={consent} setConsent={setConsent} start={start} starting={starting} />
        )}
        {screen === "quiz" && (
          <QuizScreen
            step={step}
            question={Q[step]}
            answers={answers}
            setAnswers={setAnswers}
            onNext={next}
            onBack={goBack}
            total={Q.length}
            requireContactFinal={!igFromUrl.current}
            finalName={finalName}
            setFinalName={setFinalName}
            finalContact={finalContact}
            setFinalContact={setFinalContact}
            finalContactType={finalContactType}
            setFinalContactType={setFinalContactType}
            onFinalContactSaved={(name, contact, type) => {
              // Persistimos el contacto justo antes de cerrar.
              patchProgress({
                nombre: name || null,
                ...(type === "instagram"
                  ? { instagram: contact || null, telefono: null }
                  : { telefono: contact || null, instagram: null }),
              });
            }}
          />
        )}
        {screen === "alarma" && (
          <AlarmScreen
            answers={answers}
            whatsappNumber={whatsappNumber}
            videoUrl={videoUrls.alarma}
            onRestart={() => {
              setAnswers({});
              setResponseId(null);
              setStep(0);
              setScreen("intro");
              setConsent(false);
            }}
            trackWhatsappClick={trackWhatsappClick}
          />
        )}
        {screen === "result" && (
          <ResultScreen
            answers={answers}
            whatsappNumber={whatsappNumber}
            videoUrls={videoUrls}
            onRestart={() => {
              setAnswers({});
              setResponseId(null);
              setStep(0);
              setScreen("intro");
              setConsent(false);
            }}
            trackWhatsappClick={trackWhatsappClick}
          />
        )}
      </main>
    </div>
  );
}

// ═══════════ Intro ═══════════

function IntroScreen({
  consent, setConsent, start, starting,
}: {
  consent: boolean; setConsent: (v: boolean) => void; start: () => void; starting: boolean;
}) {
  return (
    <>
      <div className="sf-brand"><span className="sf-brand-accent">FisioFitCross</span></div>
      <div className="sf-intro">
        <div>
          <h1>El Semáforo del Hombro</h1>
          <p className="sf-lead" style={{ marginTop: 18 }}>
            Descubre qué movimientos del WOD puedes seguir haciendo, cuáles adaptar y cuáles parar. Sin quitar ejercicios a ciegas.
          </p>
        </div>
        <IntroLightAnimated />
      </div>
      <div className="sf-need">
        <p>
          <strong>10 minutos. </strong>
          Unas preguntas y 4 pruebas sencillas en casa. Necesitas una pared, el marco de una puerta y una barra de dominadas.
        </p>
      </div>
      <label className="sf-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          {CONSENT_TEXT}{" "}
          <a href={PRIVACY_URL} target="_blank" rel="noopener">Política de privacidad</a>.
        </span>
      </label>
      <button className="sf-btn" onClick={start} disabled={!consent || starting}>
        {starting ? "Cargando…" : "Empezar el test"}
      </button>
      <p className="sf-small sf-disclaimer">
        Este test te orienta, pero no sustituye una valoración profesional. Si algo te duele mucho durante una prueba, para.
      </p>
    </>
  );
}

// ═══════════ Quiz ═══════════

function QuizScreen(props: {
  step: number;
  question: Question;
  answers: Answers;
  setAnswers: (u: Answers | ((prev: Answers) => Answers)) => void;
  onNext: () => void;
  onBack: () => void;
  total: number;
  requireContactFinal: boolean;
  finalName: string;
  setFinalName: (s: string) => void;
  finalContact: string;
  setFinalContact: (s: string) => void;
  finalContactType: "instagram" | "telefono";
  setFinalContactType: (t: "instagram" | "telefono") => void;
  onFinalContactSaved: (name: string, contact: string, type: "instagram" | "telefono") => void;
}) {
  const { step, question: q, answers, setAnswers, onNext, onBack, total } = props;
  const progressPct = (step / total) * 100;

  return (
    <>
      <div className="sf-top">
        <button className="sf-back" onClick={onBack}>‹ Atrás</button>
        <div className="sf-progress" aria-hidden><span style={{ width: `${progressPct}%` }} /></div>
        <div className="sf-count">{step + 1} / {total}</div>
      </div>
      <section>
        <div className="sf-section">{q.section}</div>
        <h2 className="sf-qtitle">{q.title}</h2>
        {q.help && <p className="sf-help">{q.help}</p>}
        {q.howto && (
          <div className="sf-howto">
            <ol>{q.howto.map((t, i) => <li key={i}>{t}</li>)}</ol>
            {q.warn && <p className="sf-warn">{q.warn}</p>}
          </div>
        )}
        {q.type === "single" && (
          <SingleOptions
            question={q}
            current={(answers as Record<string, { v: unknown } | undefined>)[q.id]?.v}
            onPick={(v, score) => {
              setAnswers((prev) => ({ ...prev, [q.id]: { v, score } as unknown as never }));
              setTimeout(onNext, 220);
            }}
          />
        )}
        {q.type === "multi" && (
          <MultiOptions
            question={q}
            current={(answers[q.id as keyof Answers] as string[] | undefined) ?? []}
            onChange={(vals) => setAnswers((prev) => ({ ...prev, [q.id]: vals } as unknown as Answers))}
            onNext={onNext}
          />
        )}
        {q.type === "matrix" && (
          <MatrixOptions
            current={(answers.movimientos ?? {}) as Partial<Record<string, FamilyValue>>}
            onChange={(v) => setAnswers((prev) => ({ ...prev, movimientos: v }))}
            onNext={onNext}
          />
        )}
        {q.type === "text" && (
          <FinalTextStep
            answers={answers}
            setAnswers={setAnswers}
            requireContact={props.requireContactFinal}
            finalName={props.finalName}
            setFinalName={props.setFinalName}
            finalContact={props.finalContact}
            setFinalContact={props.setFinalContact}
            finalContactType={props.finalContactType}
            setFinalContactType={props.setFinalContactType}
            onNext={() => {
              // Al confirmar el paso final, primero persistimos contacto,
              // luego avanzamos (que a su vez cierra el registro).
              props.onFinalContactSaved(props.finalName, props.finalContact, props.finalContactType);
              onNext();
            }}
          />
        )}
      </section>
    </>
  );
}

function SingleOptions({
  question, current, onPick,
}: {
  question: Extract<Question, { type: "single" }>;
  current: unknown;
  onPick: (v: string | number, score: number) => void;
}) {
  return (
    <div className="sf-opts">
      {question.options.map((o) => (
        <button
          key={String(o.v)}
          className="sf-opt"
          aria-pressed={current === o.v}
          onClick={() => onPick(o.v, o.score)}
        >
          <span className={"sf-dot" + (o.c ? " " + o.c : "")} />
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function MultiOptions({
  question, current, onChange, onNext,
}: {
  question: Extract<Question, { type: "multi" }>;
  current: string[];
  onChange: (vals: string[]) => void;
  onNext: () => void;
}) {
  function toggle(v: string) {
    const sel = new Set(current);
    const opt = question.options.find((o) => o.v === v);
    if (sel.has(v)) sel.delete(v);
    else {
      if (opt?.exclusive) sel.clear();
      else question.options.filter((x) => x.exclusive).forEach((x) => sel.delete(x.v));
      sel.add(v);
    }
    onChange([...sel]);
  }
  return (
    <>
      <div className="sf-opts">
        {question.options.map((o) => (
          <button
            key={o.v}
            className="sf-opt"
            aria-pressed={current.includes(o.v)}
            onClick={() => toggle(o.v)}
          >
            <span className="sf-dot" />
            <span>{o.label}</span>
          </button>
        ))}
      </div>
      <button className="sf-btn sf-next" disabled={current.length === 0} onClick={onNext}>Continuar</button>
    </>
  );
}

function MatrixOptions({
  current, onChange, onNext,
}: {
  current: Partial<Record<string, FamilyValue>>;
  onChange: (v: Partial<Record<string, FamilyValue>>) => void;
  onNext: () => void;
}) {
  const complete = FAMILIES.every((f) => current[f.id]);
  return (
    <>
      <div className="sf-matrix">
        {FAMILIES.map((f) => (
          <div key={f.id} className="sf-fam">
            <strong>{f.name}</strong>
            <div className="sf-ex">{f.ex}</div>
            <div className="sf-seg" role="group" aria-label={f.name}>
              {FAM_OPTS.map((o) => (
                <button
                  key={o.v}
                  aria-pressed={current[f.id] === o.v}
                  onClick={() => onChange({ ...current, [f.id]: o.v })}
                >
                  <span className={"sf-dot sf-" + o.c + "-bg"} />
                  <span>{o.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button className="sf-btn sf-next" disabled={!complete} onClick={onNext}>Continuar</button>
    </>
  );
}

function FinalTextStep({
  answers, setAnswers, requireContact,
  finalName, setFinalName, finalContact, setFinalContact,
  finalContactType, setFinalContactType,
  onNext,
}: {
  answers: Answers; setAnswers: (u: (prev: Answers) => Answers) => void;
  requireContact: boolean;
  finalName: string; setFinalName: (s: string) => void;
  finalContact: string; setFinalContact: (s: string) => void;
  finalContactType: "instagram" | "telefono"; setFinalContactType: (t: "instagram" | "telefono") => void;
  onNext: () => void;
}) {
  useEffect(() => {
    if (finalName && answers.nombre !== finalName) {
      setAnswers((prev) => ({ ...prev, nombre: finalName }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalName]);

  const canContinue = requireContact
    ? Boolean(finalName.trim() && finalContact.trim())
    : true;

  return (
    <>
      <input
        className="sf-field"
        type="text"
        autoComplete="given-name"
        placeholder="Tu nombre"
        value={finalName || (answers.nombre ?? "")}
        onChange={(e) => setFinalName(e.target.value)}
        maxLength={80}
      />
      {requireContact && (
        <>
          <div className="sf-seg" style={{ marginTop: 12 }}>
            <button
              aria-pressed={finalContactType === "instagram"}
              onClick={() => setFinalContactType("instagram")}
            >
              <span className="sf-dot" />
              Instagram
            </button>
            <button
              aria-pressed={finalContactType === "telefono"}
              onClick={() => setFinalContactType("telefono")}
            >
              <span className="sf-dot" />
              Teléfono
            </button>
          </div>
          <input
            className="sf-field"
            style={{ marginTop: 10 }}
            type={finalContactType === "telefono" ? "tel" : "text"}
            placeholder={finalContactType === "instagram" ? "@tu_usuario" : "+34 600 000 000"}
            value={finalContact}
            onChange={(e) => setFinalContact(e.target.value)}
            maxLength={40}
          />
          <p className="sf-small" style={{ marginTop: 8 }}>
            Nombre + Instagram o teléfono son obligatorios para darte el resultado.
          </p>
        </>
      )}
      <button className="sf-btn sf-next" disabled={!canContinue} onClick={onNext}>
        Ver mi resultado
      </button>
    </>
  );
}

// ═══════════ Alarma ═══════════

function AlarmScreen({
  answers, whatsappNumber, videoUrl, onRestart, trackWhatsappClick,
}: {
  answers: Answers; whatsappNumber: string; videoUrl: string;
  onRestart: () => void; trackWhatsappClick: () => void;
}) {
  const q = Q.find((x) => x.id === "seguridad") as Extract<Question, { type: "multi" }>;
  const marked = q.options
    .filter((o) => (answers.seguridad ?? []).includes(o.v) && !o.exclusive)
    .map((o) => o.label);
  const msg = `¡Hola Ales! He empezado el Semáforo del Hombro y he marcado:\n- ${marked.join("\n- ")}\nMe gustaría hablar contigo.`;
  const wa = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`;

  return (
    <>
      <div className="sf-brand"><span className="sf-brand-accent">FisioFitCross</span></div>
      <div className="sf-res-head">
        <TrafficLight on="r" big />
        <div>
          <div className="sf-verdict r">Para aquí un momento</div>
          <h2>Lo que has marcado necesita que lo veamos contigo</h2>
        </div>
      </div>
      <p>Con estas señales no tiene sentido que sigas con las pruebas: podrían empeorar lo que te pasa. Antes de nada, mira este vídeo.</p>
      <div className="sf-block">
        <VideoBlock url={videoUrl} label="Vídeo de Ales: qué hacer si has marcado alguna de estas señales" />
      </div>
      <div className="sf-cta">
        <h3>Háblalo directamente conmigo</h3>
        <p style={{ margin: 0 }}>Te digo cuál es el siguiente paso en tu caso, incluido si antes te tiene que ver un médico.</p>
        <a
          className="sf-btn wa"
          href={wa}
          target="_blank"
          rel="noopener"
          onClick={() => trackWhatsappClick()}
        >
          Hablar con Ales por WhatsApp
        </a>
        <p className="sf-small" style={{ margin: "10px 0 0" }}>Se abre WhatsApp con lo que has marcado ya escrito.</p>
      </div>
      <button className="sf-btn ghost sf-again" onClick={onRestart}>Me he equivocado al marcar</button>
    </>
  );
}

// ═══════════ Resultado ═══════════

function ResultScreen({
  answers, whatsappNumber, videoUrls, onRestart, trackWhatsappClick,
}: {
  answers: Answers; whatsappNumber: string;
  videoUrls: Record<"verde" | "ambar" | "rojo" | "alarma", string>;
  onRestart: () => void; trackWhatsappClick: () => void;
}) {
  const r = useMemo(() => evaluate(answers), [answers]);
  const k = COPY[r.color];
  const name = answers.nombre ?? "";

  const movLine = FAMILIES
    .map((f) => `${f.name}: ${COLOR_NAME[FAM_ADVICE[(r.mov[f.id] as FamilyValue) || "na"].c]}`)
    .join(" · ");
  const msg = `¡Hola! ${name ? `Soy ${name}. ` : ""}He hecho el Semáforo del Hombro y me ha salido ${k.verdict.toUpperCase()}.\n${movLine}\n${k.waLine}`;
  const wa = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`;

  return (
    <>
      <div className="sf-brand"><span className="sf-brand-accent">FisioFitCross</span> · Tu resultado</div>
      <div className="sf-res-head">
        <TrafficLight on={k.c} big />
        <div>
          <div className={"sf-verdict " + k.c}>
            {name ? `${name}, tu hombro está en ${k.verdict.toLowerCase()}` : k.verdict}
          </div>
          <h2>{k.title}</h2>
        </div>
      </div>

      {r.flags.length > 0 && (
        <div className="sf-alert">
          <p><strong>Antes de nada: </strong>por lo que has marcado, lo primero es que te vea un médico en persona para descartar algo que necesite otro tipo de atención.</p>
          <p>Cuando te hayan valorado, este resultado te sirve para planificar la vuelta al box.</p>
        </div>
      )}

      <div className="sf-block">
        <h3>Por qué te ha salido este color</h3>
        <ul className="sf-why">
          {r.why.map((w, i) => <li key={i} className={w.k}>{w.t}</li>)}
        </ul>
      </div>

      <div className="sf-block">
        <h3>Tu mapa de movimientos</h3>
        <div className="sf-map">
          {FAMILIES.map((f) => {
            const a = FAM_ADVICE[(r.mov[f.id] as FamilyValue) || "na"];
            return (
              <div key={f.id} className="sf-mrow">
                <div className={"sf-dot sf-" + a.c + "-bg"} aria-label={COLOR_NAME[a.c]} />
                <div>
                  <strong>{f.name} · {COLOR_NAME[a.c]}</strong>
                  <span>{a.t}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="sf-block">
        <h3>Te lo explico en 1 minuto</h3>
        <VideoBlock
          url={videoUrls[r.color]}
          label={`Vídeo: por qué te ha salido ${k.verdict.toLowerCase()} y qué tener en cuenta`}
        />
      </div>

      <div className="sf-block">
        <h3>Qué tener en cuenta desde hoy</h3>
        <ul className="sf-tips">
          {k.tips.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      </div>

      <div className="sf-cta">
        <h3>{k.ctaTitle}</h3>
        <p style={{ margin: 0 }}>{k.ctaText}</p>
        <a
          className="sf-btn wa"
          href={wa}
          target="_blank"
          rel="noopener"
          onClick={() => trackWhatsappClick()}
        >
          {k.ctaBtn}
        </a>
        <p className="sf-small" style={{ margin: "10px 0 0" }}>Se abre WhatsApp con tu resultado ya escrito. Solo tienes que enviarlo.</p>
      </div>

      <button className="sf-btn ghost sf-again" onClick={onRestart}>Repetir el test</button>
    </>
  );
}
