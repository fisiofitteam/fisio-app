"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Barlow_Condensed, Archivo } from "next/font/google";
import {
  Q,
  FAMILIES,
  FAMILY_GROUPS,
  FAM_OPTS,
  TESTS,
  COPY,
  FAM_ADVICE,
  COLOR_NAME,
  type FamilyValue,
  type Question,
} from "@/lib/semaforo/questions";
import { evaluate, type RespuestasSemaforo } from "@/lib/semaforo/evaluate";
import { IG_PARAM_NAME, CAMPAIGN_PARAM_NAME, sanitizeInstagram, sanitizeCampaign } from "@/lib/semaforo/config";
import { COUNTRIES, DEFAULT_COUNTRY, countryFlag, findCountry } from "@/lib/countries";

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

type Screen = "intro" | "quiz" | "alarma" | "result" | "funnel-thanks";

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
  /* Blur suave para que la foto no compita con el copy, pero sin bajar
   * mucho el brillo — queremos mantener el ambiente del box visible. */
  filter:blur(2px) saturate(0.85) brightness(0.8);
  transform:scale(1.02); /* compensa el blur en los bordes */
}
.sf-bg-overlay{
  position:fixed;inset:0;z-index:0;
  /* Gradiente muy ligero: apenas oscurece arriba, un pelín más abajo
   * donde están las cards. Mantiene el branding visible. */
  background:linear-gradient(180deg, rgba(10,10,10,0.30) 0%, rgba(10,10,10,0.50) 55%, rgba(10,10,10,0.60) 100%);
}
.sf-scope{
  position:relative;z-index:1;
  min-height:100vh;
  color:var(--ink);
  font-family:var(--font-body),system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  font-size:17px;line-height:1.55;-webkit-font-smoothing:antialiased;
}
.sf-scope *,.sf-scope *::before,.sf-scope *::after{box-sizing:border-box}
/* position:relative + z-index:1 obligatorio: los divs .sf-bg y
 * .sf-bg-overlay son fixed con z-index:0 y se pintan en la capa 6 del
 * contexto del scope. Como .sf-card lleva backdrop-filter, entra también
 * en la capa 6 y se pinta encima de esos overlays (porque va después en
 * el DOM). Pero .sf-hero (header sin position ni background) sigue en la
 * capa 3 y los overlays fixed lo tapan → hero invisible. Al forzar
 * position:relative;z-index:1 en el wrap, todo el main entra en capa 7
 * (>0) y se garantiza que quede encima de los overlays. */
.sf-wrap{position:relative;z-index:1;max-width:640px;margin:0 auto;padding:40px 20px 56px}
.sf-hero{margin:0 0 24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:16px}
.sf-hero.left{text-align:left;align-items:flex-start}
.sf-card{
  border-radius:20px;padding:22px 20px;
  background:var(--surface);border:1px solid var(--line);
  backdrop-filter:blur(8px);
  box-shadow:0 20px 60px rgba(0,0,0,.35);
}
.sf-card + .sf-card{margin-top:16px}
.sf-footer{
  margin-top:28px;text-align:center;color:var(--muted-2);
  font-size:12px;letter-spacing:.08em;text-transform:uppercase;
}
.sf-footer a{color:var(--gold-1);text-decoration:none;font-weight:700}
.sf-brand{
  font-family:var(--font-display);font-weight:800;font-size:14px;
  letter-spacing:.14em;text-transform:uppercase;color:var(--muted-2);
  margin:0 0 16px;
}
.sf-brand-accent{
  background:linear-gradient(135deg,var(--gold-1) 0%,var(--gold-2) 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
  /* Text-shadow del h1 padre "sangra" a este span y apaga el gradiente
   * dorado. Lo anulamos aquí para que el color vivo brille. */
  text-shadow:none;
  filter:drop-shadow(0 2px 12px rgba(0,0,0,0.6));
}
.sf-scope h1,.sf-scope h2,.sf-scope h3{font-family:var(--font-display);line-height:1.08;margin:0;color:var(--ink-strong)}
.sf-scope h1{line-height:0.98}
/* Título más grande y con más presencia — ocupa el mismo ancho que la
 * card de abajo (max-width del .sf-wrap = 640px). Text-shadow suave
 * para separar del fondo aunque tenga blur. */
.sf-scope h1{
  font-size:clamp(56px,11vw,88px);
  font-weight:800;letter-spacing:-.035em;
  text-shadow:0 2px 24px rgba(0,0,0,0.55);
  max-width:9ch;
}
.sf-scope h2{font-size:clamp(28px,7.5vw,38px);font-weight:700;letter-spacing:-.02em}
.sf-scope h3{font-size:22px;font-weight:700}
.sf-scope p{margin:0 0 14px}
.sf-lead{
  font-size:17px;line-height:1.5;
  color:var(--muted);max-width:48ch;margin:0;
  text-shadow:0 1px 12px rgba(0,0,0,0.5);
}
.sf-hero .sf-lead{margin:0 auto}
.sf-small{font-size:13px;color:var(--muted-2)}
.sf-scope button{font:inherit;cursor:pointer}
.sf-scope :focus-visible{outline:3px solid var(--gold-1);outline-offset:3px;border-radius:6px}

/* Traffic light */
.sf-light{background:#0A0A0A;border-radius:28px;padding:14px;display:inline-flex;flex-direction:column;gap:12px;border:2px solid rgba(255,255,255,0.85);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 0 0 4px rgba(255,255,255,0.08),0 10px 40px rgba(0,0,0,.45)}
.sf-light.row{flex-direction:row}
.sf-bulb{width:46px;height:46px;border-radius:50%;background:var(--off);transition:background .35s,box-shadow .35s}
.sf-light.big .sf-bulb{width:78px;height:78px}
.sf-bulb.on.g{background:var(--green);box-shadow:0 0 0 4px rgba(34,197,94,.22),0 0 42px rgba(34,197,94,.65)}
.sf-bulb.on.a{background:var(--amber);box-shadow:0 0 0 4px rgba(245,158,11,.22),0 0 42px rgba(245,158,11,.65)}
.sf-bulb.on.r{background:var(--red);box-shadow:0 0 0 4px rgba(239,68,68,.22),0 0 42px rgba(239,68,68,.65)}

/* Intro */
.sf-need{
  margin:0 0 16px;padding:14px 16px;border-radius:12px;
  background:#1F1F1F;border:1px solid var(--line);color:var(--ink);
}
.sf-need p{margin:0}
.sf-btn{
  display:inline-flex;align-items:center;justify-content:center;gap:10px;
  border:0;border-radius:14px;padding:17px 24px;font-weight:700;font-size:17px;
  background:#FAFAFA;color:#0A0A0A;text-decoration:none;width:100%;font-family:var(--font-body);
  transition:transform .12s ease,opacity .12s ease;
}
.sf-btn:not(:disabled):hover{transform:translateY(-1px)}
.sf-btn:disabled{cursor:not-allowed;background:rgba(250,250,250,0.14);color:#A3A3A3;border:1px solid var(--line)}
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
.sf-section{font-weight:700;color:var(--gold-1);font-size:12px;text-transform:uppercase;letter-spacing:.14em;margin-bottom:12px}
.sf-qtitle{margin-bottom:22px;padding-bottom:2px}
.sf-help{color:var(--muted);margin-bottom:22px;margin-top:-10px}
.sf-howto{
  background:#1F1F1F;border:1px solid var(--line);border-radius:12px;
  padding:14px 16px;margin:0 0 18px;color:var(--ink);
}
.sf-howto ol{margin:0;padding-left:20px}
.sf-howto li{margin:0 0 6px}
.sf-warn{margin:10px 0 0;font-size:13px;color:var(--gold-1)}
.sf-opts{display:grid;gap:10px}
.sf-opt{
  display:flex;gap:14px;align-items:center;text-align:left;
  background:#1F1F1F;border:1px solid var(--line);border-radius:12px;
  padding:15px 16px;width:100%;color:var(--ink);
  transition:border-color .15s,background .15s,transform .1s;
}
.sf-opt:hover{border-color:var(--line-2);background:#262626}
.sf-opt[aria-pressed="true"]{border-color:var(--gold-1);background:rgba(252,211,77,0.08);box-shadow:0 0 0 2px rgba(252,211,77,.15)}
.sf-opt .sf-dot{flex:none;width:14px;height:14px;border-radius:50%;background:var(--line-2)}
.sf-opt[aria-pressed="true"] .sf-dot{background:var(--gold-1)}
.sf-opt .sf-dot.g{background:var(--green)}.sf-opt .sf-dot.a{background:var(--amber)}.sf-opt .sf-dot.r{background:var(--red)}
.sf-matrix{display:grid;gap:18px}
.sf-group{display:grid;gap:8px}
.sf-group-label{
  font-weight:700;color:var(--gold-1);
  font-size:11px;text-transform:uppercase;letter-spacing:.16em;
  padding:0 4px 2px;
}
.sf-fam{
  background:#1F1F1F;border:1px solid var(--line);border-radius:12px;
  padding:14px;
}
.sf-fam strong{display:block;font-size:15px;color:var(--ink-strong);margin-bottom:10px}
.sf-seg{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.sf-seg button{
  border:1px solid var(--line);background:#0F0F0F;border-radius:10px;
  padding:10px 10px;font-size:14px;font-weight:500;display:flex;align-items:center;
  gap:8px;text-align:left;font-family:var(--font-body);color:var(--ink);
  transition:border-color .12s,background .12s;
}
.sf-seg button:hover{border-color:var(--line-2)}
.sf-seg button[aria-pressed="true"]{border-color:var(--gold-1);background:rgba(252,211,77,.08);font-weight:700}
.sf-seg .sf-dot{flex:none;width:10px;height:10px;border-radius:50%}
.sf-field{
  width:100%;font:inherit;font-size:16px;padding:14px 16px;border-radius:12px;
  border:1px solid var(--line-2);background:#1F1F1F;color:var(--ink);
  font-family:var(--font-body);
}
.sf-field:focus{outline:none;border-color:var(--gold-1);background:#262626}
.sf-country-select select{
  height:100%;padding:14px 12px;border-radius:12px;
  border:1px solid var(--line-2);background:#1F1F1F;color:var(--ink);
  font-family:var(--font-body);font-size:16px;min-width:140px;
  appearance:none;
  background-image:linear-gradient(45deg,transparent 50%,#A3A3A3 50%),linear-gradient(-45deg,transparent 50%,#A3A3A3 50%);
  background-position:calc(100% - 15px) 50%,calc(100% - 10px) 50%;
  background-size:5px 5px,5px 5px;background-repeat:no-repeat;
  padding-right:32px;
}
.sf-country-select select:focus{outline:none;border-color:var(--gold-1);background-color:#262626}
@media (max-width:480px){.sf-country-select select{min-width:110px;font-size:14px}}
.sf-field::placeholder{color:var(--muted-2)}
.sf-next{margin-top:22px}

/* Result */
.sf-res-head{display:grid;grid-template-columns:auto 1fr;gap:22px;align-items:center;margin-bottom:26px}
.sf-verdict{font-family:var(--font-display);font-weight:800;font-size:20px;margin-bottom:6px;letter-spacing:.02em;text-transform:uppercase}
.sf-verdict.g{color:var(--green)}.sf-verdict.a{color:var(--amber)}.sf-verdict.r{color:var(--red)}
.sf-res-head h2{font-size:clamp(28px,7.5vw,40px)}
.sf-alert{
  background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.35);color:#FCA5A5;
}
.sf-alert p{color:#FCA5A5}
.sf-alert strong{color:#FECACA}
.sf-block{margin:0 0 30px}
.sf-block h3{margin-bottom:12px}
.sf-why{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.sf-why li{
  padding:12px 14px 12px 16px;border-radius:12px;
  background:#1F1F1F;border:1px solid var(--line);border-left:3px solid var(--line-2);
  color:var(--ink);
}
.sf-why li.neg{border-left-color:var(--red)}.sf-why li.mid{border-left-color:var(--amber)}.sf-why li.pos{border-left-color:var(--green)}
.sf-map{display:grid;gap:8px}
.sf-map-group{margin-bottom:16px}
.sf-map-group:last-child{margin-bottom:0}
.sf-map-group-label{
  font-weight:700;color:var(--gold-1);
  font-size:11px;text-transform:uppercase;letter-spacing:.16em;
  padding:0 4px 8px;
}
.sf-mrow{
  display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:start;
  padding:14px;border-radius:12px;background:#1F1F1F;border:1px solid var(--line);
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
  border-color:rgba(252,211,77,0.5);
  box-shadow:0 0 0 3px rgba(252,211,77,.06),0 20px 60px rgba(0,0,0,.35);
}
.sf-cta h3{margin-bottom:8px}
.sf-cta .sf-btn{margin-top:12px}
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
  quizFunnelMode = false,
}: {
  whatsappNumber: string;
  videoUrls: Record<"verde" | "ambar" | "rojo" | "alarma", string>;
  legalRevisado: boolean;
  quizFunnelMode?: boolean;
}) {
  // ─── Estado principal ──
  const [screen, setScreen] = useState<Screen>("intro");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
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

  // ─── Datos del paso final ──
  // Los tres campos se piden en el paso final independientemente del modo:
  //   · Modo default: nombre + instagram obligatorios (finalContact vacío).
  //   · Modo quiz funnel: nombre + instagram + teléfono con selector país
  //     obligatorios (finalContact = número, finalCountryLabel = país).
  const [finalName, setFinalName] = useState("");
  const [finalInstagram, setFinalInstagram] = useState("");
  const [finalContact, setFinalContact] = useState("");
  const [finalCountryLabel, setFinalCountryLabel] = useState<string>(DEFAULT_COUNTRY.label);
  // Legacy: firma antigua del componente FinalTextStep — teléfono es
  // el tipo por defecto en modo funnel.
  const [finalContactType] = useState<"instagram" | "telefono">("telefono");
  const setFinalContactType = (_t: "instagram" | "telefono") => {};

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
    if (starting) return;
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
        cerrar: "completado",
      });
      // En modo funnel no mostramos el resultado — pantalla de "gracias"
      // y la setter contactará por WhatsApp con el mensaje predefinido.
      setScreen(quizFunnelMode ? "funnel-thanks" : "result");
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
          <IntroScreen start={start} starting={starting} />
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
            quizFunnelMode={quizFunnelMode}
            finalName={finalName}
            setFinalName={setFinalName}
            finalInstagram={finalInstagram}
            setFinalInstagram={setFinalInstagram}
            finalContact={finalContact}
            setFinalContact={setFinalContact}
            finalCountryLabel={finalCountryLabel}
            setFinalCountryLabel={setFinalCountryLabel}
            finalContactType={finalContactType}
            setFinalContactType={setFinalContactType}
            onFinalContactSaved={(name, instagram, phone, countryLabel) => {
              // Persistimos el contacto justo antes de cerrar.
              const country = findCountry(countryLabel);
              const fullPhone = phone.trim()
                ? `${country?.dialCode ?? ""} ${phone.trim()}`.trim()
                : null;
              patchProgress({
                nombre: name || null,
                instagram: instagram?.trim().replace(/^@+/, "") || null,
                telefono: quizFunnelMode ? fullPhone : null,
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
            }}
            trackWhatsappClick={trackWhatsappClick}
          />
        )}
        {screen === "funnel-thanks" && (
          <FunnelThanksScreen
            name={answers.nombre ?? ""}
            onRestart={() => {
              setAnswers({});
              setResponseId(null);
              setStep(0);
              setScreen("intro");
            }}
          />
        )}
      </main>
    </div>
  );
}

// ═══════════ Intro ═══════════

function IntroScreen({
  start, starting,
}: {
  start: () => void; starting: boolean;
}) {
  return (
    <>
      <header className="sf-hero">
        <div className="sf-brand"><span className="sf-brand-accent">FisioFitCross</span></div>
        <h1>
          El Semáforo<br />
          <span className="sf-brand-accent">del Hombro</span>
        </h1>
        <p className="sf-lead">
          Descubre qué movimientos del WOD puedes seguir haciendo, cuáles adaptar y cuáles parar. Sin quitar ejercicios a ciegas.
        </p>
        <IntroLightAnimated />
      </header>
      <section className="sf-card">
        <div className="sf-need">
          <p>
            <strong>3 minutos. </strong>
            Unas preguntas rápidas para saber cómo está tu hombro antes de tu próximo WOD.
          </p>
        </div>
        <button className="sf-btn" onClick={start} disabled={starting}>
          {starting ? "Cargando…" : "Empezar el test →"}
        </button>
        <p className="sf-small sf-disclaimer">
          Este test te orienta, pero no sustituye una valoración profesional. Si algo te duele mucho durante una prueba, para.
        </p>
      </section>
      <footer className="sf-footer">
        <a href="https://instagram.com/fisiofitteam" target="_blank" rel="noopener">@fisiofitteam</a>
      </footer>
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
  quizFunnelMode: boolean;
  finalName: string;
  setFinalName: (s: string) => void;
  finalInstagram: string;
  setFinalInstagram: (s: string) => void;
  finalContact: string;
  setFinalContact: (s: string) => void;
  finalCountryLabel: string;
  setFinalCountryLabel: (s: string) => void;
  finalContactType: "instagram" | "telefono";
  setFinalContactType: (t: "instagram" | "telefono") => void;
  onFinalContactSaved: (name: string, instagram: string, phone: string, countryLabel: string) => void;
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
      <section className="sf-card">
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
            quizFunnelMode={props.quizFunnelMode}
            finalName={props.finalName}
            setFinalName={props.setFinalName}
            finalInstagram={props.finalInstagram}
            setFinalInstagram={props.setFinalInstagram}
            finalContact={props.finalContact}
            setFinalContact={props.setFinalContact}
            finalCountryLabel={props.finalCountryLabel}
            setFinalCountryLabel={props.setFinalCountryLabel}
            onNext={() => {
              // Persistimos contacto justo antes de avanzar (que cierra
              // el registro y salta a result o funnel-thanks).
              props.onFinalContactSaved(
                props.finalName,
                props.finalInstagram,
                props.finalContact,
                props.finalCountryLabel,
              );
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
        {FAMILY_GROUPS.map((g) => {
          const items = FAMILIES.filter((f) => f.group === g.id);
          return (
            <div key={g.id} className="sf-group">
              <div className="sf-group-label">{g.label}</div>
              {items.map((f) => (
                <div key={f.id} className="sf-fam">
                  <strong>{f.name}</strong>
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
          );
        })}
      </div>
      <button className="sf-btn sf-next" disabled={!complete} onClick={onNext}>Continuar</button>
    </>
  );
}

function FinalTextStep({
  answers, setAnswers, quizFunnelMode,
  finalName, setFinalName,
  finalInstagram, setFinalInstagram,
  finalContact, setFinalContact,
  finalCountryLabel, setFinalCountryLabel,
  onNext,
}: {
  answers: Answers; setAnswers: (u: (prev: Answers) => Answers) => void;
  quizFunnelMode: boolean;
  finalName: string; setFinalName: (s: string) => void;
  finalInstagram: string; setFinalInstagram: (s: string) => void;
  finalContact: string; setFinalContact: (s: string) => void;
  finalCountryLabel: string; setFinalCountryLabel: (s: string) => void;
  onNext: () => void;
}) {
  useEffect(() => {
    if (finalName && answers.nombre !== finalName) {
      setAnswers((prev) => ({ ...prev, nombre: finalName }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalName]);

  const country = findCountry(finalCountryLabel);
  const canContinue = quizFunnelMode
    ? Boolean(finalName.trim() && finalInstagram.trim() && finalContact.trim())
    : Boolean(finalName.trim() && finalInstagram.trim());

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
      <input
        className="sf-field"
        style={{ marginTop: 12 }}
        type="text"
        autoComplete="username"
        placeholder="@tu_usuario_instagram"
        value={finalInstagram}
        onChange={(e) => setFinalInstagram(e.target.value)}
        maxLength={40}
      />
      {quizFunnelMode && (
        <>
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "auto 1fr", gap: 8 }}>
            <div className="sf-country-select">
              <select
                value={finalCountryLabel}
                onChange={(e) => setFinalCountryLabel(e.target.value)}
                aria-label="País"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.iso2 || c.label} value={c.label}>
                    {countryFlag(c.iso2)} {c.label} {c.dialCode}
                  </option>
                ))}
              </select>
            </div>
            <input
              className="sf-field"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder={`${country?.dialCode ?? "+34"} 600 000 000`}
              value={finalContact}
              onChange={(e) => setFinalContact(e.target.value)}
              maxLength={40}
              style={{ marginTop: 0 }}
            />
          </div>
          <p className="sf-small" style={{ marginTop: 8 }}>
            Tu WhatsApp: te escribo yo con tu resultado personalizado. Nada de listas ni spam.
          </p>
        </>
      )}
      <button className="sf-btn sf-next" disabled={!canContinue} onClick={onNext}>
        {quizFunnelMode ? "Enviar" : "Ver mi resultado"}
      </button>
    </>
  );
}

// ═══════════ Funnel Thanks ═══════════

function FunnelThanksScreen({
  name, onRestart,
}: {
  name: string; onRestart: () => void;
}) {
  const firstName = name.trim().split(" ")[0] || "";
  return (
    <>
      <header className="sf-hero">
        <div className="sf-brand"><span className="sf-brand-accent">FisioFitCross</span></div>
        <div className="sf-res-head">
          <TrafficLight on="g" big />
          <div>
            <div className="sf-verdict g" style={{ color: "var(--gold-1)" }}>¡Recibido!</div>
            <h2>{firstName ? `${firstName}, tu resultado va de camino` : "Tu resultado va de camino"}</h2>
          </div>
        </div>
      </header>
      <section className="sf-card">
        <p>
          Hemos guardado tus respuestas. <strong>Ales te escribirá personalmente por WhatsApp</strong> para
          explicarte qué significa tu resultado y darte los siguientes pasos concretos para tu hombro.
        </p>
        <p style={{ marginBottom: 0 }}>
          Normalmente respondemos en 24 horas.
        </p>
      </section>
      <button className="sf-btn ghost sf-again" onClick={onRestart}>Volver al inicio</button>
      <footer className="sf-footer">
        <a href="https://instagram.com/fisiofitteam" target="_blank" rel="noopener">@fisiofitteam</a>
      </footer>
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
      <header className="sf-hero">
        <div className="sf-brand"><span className="sf-brand-accent">FisioFitCross</span></div>
        <div className="sf-res-head">
          <TrafficLight on="r" big />
          <div>
            <div className="sf-verdict r">Para aquí un momento</div>
            <h2>Lo que has marcado necesita que lo veamos contigo</h2>
          </div>
        </div>
      </header>
      <section className="sf-card">
        <p style={{ marginTop: 0 }}>Con estas señales no tiene sentido que sigas con las pruebas: podrían empeorar lo que te pasa. Antes de nada, mira este vídeo.</p>
        <div className="sf-block" style={{ margin: "18px 0 0" }}>
          <VideoBlock url={videoUrl} label="Vídeo de Ales: qué hacer si has marcado alguna de estas señales" />
        </div>
      </section>
      <section className="sf-card sf-cta">
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
      </section>
      <button className="sf-btn ghost sf-again" onClick={onRestart}>Me he equivocado al marcar</button>
      <footer className="sf-footer">
        <a href="https://instagram.com/fisiofitteam" target="_blank" rel="noopener">@fisiofitteam</a>
      </footer>
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

  // Para el WhatsApp, solo listamos los movimientos que le duelen o le
  // molestan — con 13 patrones no tiene sentido soltar el listado entero
  // en el mensaje, cargaría de ruido lo importante.
  const movDestacados = FAMILIES
    .map((f) => ({ f, v: r.mov[f.id] as FamilyValue | undefined }))
    .filter((x) => x.v === "duele" || x.v === "leve");
  const movLine = movDestacados.length > 0
    ? "Me molestan: " + movDestacados
        .map((x) => `${x.f.name} (${COLOR_NAME[FAM_ADVICE[x.v as FamilyValue].c]})`)
        .join(", ")
    : "Los movimientos del box los llevo bien de momento.";
  const msg = `¡Hola! ${name ? `Soy ${name}. ` : ""}He hecho el Semáforo del Hombro y me ha salido ${k.verdict.toUpperCase()}.\n${movLine}\n${k.waLine}`;
  const wa = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(msg)}`;

  return (
    <>
      <header className="sf-hero">
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
      </header>

      {r.flags.length > 0 && (
        <section className="sf-card sf-alert">
          <p><strong>Antes de nada: </strong>por lo que has marcado, lo primero es que te vea un médico en persona para descartar algo que necesite otro tipo de atención.</p>
          <p style={{ margin: 0 }}>Cuando te hayan valorado, este resultado te sirve para planificar la vuelta al box.</p>
        </section>
      )}

      <section className="sf-card">
        <div className="sf-block">
          <h3>Por qué te ha salido este color</h3>
          <ul className="sf-why">
            {r.why.map((w, i) => <li key={i} className={w.k}>{w.t}</li>)}
          </ul>
        </div>

        <div className="sf-block">
          <h3>Tu mapa de movimientos</h3>
          {FAMILY_GROUPS.map((g) => {
            // Solo pintamos movimientos que el usuario practica ("na" = no lo
            // hago se oculta para que el mapa no ocupe pantalla entera con
            // cosas irrelevantes). El grupo entero se oculta si no queda nada.
            const items = FAMILIES
              .filter((f) => f.group === g.id)
              .filter((f) => {
                const v = r.mov[f.id] as FamilyValue | undefined;
                return v && v !== "na";
              });
            if (items.length === 0) return null;
            return (
              <div key={g.id} className="sf-map-group">
                <div className="sf-map-group-label">{g.label}</div>
                <div className="sf-map">
                  {items.map((f) => {
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
            );
          })}
        </div>

        <div className="sf-block">
          <h3>Te lo explico en 1 minuto</h3>
          <VideoBlock
            url={videoUrls[r.color]}
            label={`Vídeo: por qué te ha salido ${k.verdict.toLowerCase()} y qué tener en cuenta`}
          />
        </div>

        <div className="sf-block" style={{ marginBottom: 0 }}>
          <h3>Qué tener en cuenta desde hoy</h3>
          <ul className="sf-tips">
            {k.tips.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      </section>

      <section className="sf-card sf-cta">
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
      </section>

      <button className="sf-btn ghost sf-again" onClick={onRestart}>Repetir el test</button>
      <footer className="sf-footer">
        <a href="https://instagram.com/fisiofitteam" target="_blank" rel="noopener">@fisiofitteam</a>
      </footer>
    </>
  );
}
