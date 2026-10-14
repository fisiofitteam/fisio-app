"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Barlow_Condensed, Archivo } from "next/font/google";
import { AREAS, levelFromScore, type AreaId } from "@/lib/autotest-hombro/areas";
import { Q, type Question } from "@/lib/autotest-hombro/preguntas";
import { evaluate, type Respuestas } from "@/lib/autotest-hombro/evaluate";
import { arquetipoById } from "@/lib/autotest-hombro/arquetipos";
import { youtubeEmbedUrl } from "@/lib/youtube";

const display = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" });
const body = Archivo({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });

/**
 * Landing pública del Autotest Funcional del Hombro para CrossFit.
 *
 * Flujo:
 *   Intro → consentimiento + "Empezar" → POST /api/autotest-hombro
 *     → 9 pasos (5 bloque A + 3 bloque B + nombre)
 *     → PATCH con cerrar=completado → se recalcula scores + arquetipo en server
 *     → pantalla resultado: 6 barras + arquetipo + CTA WhatsApp
 *
 * Toda la lógica de puntuación vive en lib/autotest-hombro/evaluate.ts
 * (compartida con el servidor). Este componente solo UI + persistencia.
 */

type Screen = "intro" | "quiz" | "result";

const WHATSAPP_NUMBER = "34640987765"; // mismo del Semáforo

const STYLES = `
[data-scope="autotest"] {
  --ink:#FAFAFA;
  --muted:#A3A3A3;
  --line:#262626;
  --surface:rgba(20,20,20,0.85);
  --surface-2:rgba(31,31,31,0.85);
  --paper:#0A0A0A;
  --gold-1:#FCD34D;
  --gold-2:#F59E0B;
  --green:#22C55E;
  --amber:#F59E0B;
  --red:#EF4444;
  --wa:#1FA855;
}
.at-bg{
  position:fixed;inset:0;z-index:0;
  background-color:#0A0A0A;
  background-image:url('/box.jpg');
  background-size:cover;background-position:center;background-attachment:fixed;
  filter:blur(2px) saturate(0.85) brightness(0.75);
  transform:scale(1.02);
}
.at-bg-overlay{
  position:fixed;inset:0;z-index:0;
  background:linear-gradient(180deg, rgba(10,10,10,0.78) 0%, rgba(10,10,10,0.92) 100%);
}
.at-wrap{position:relative;z-index:1;max-width:640px;margin:0 auto;padding:28px 18px 48px;}
.at-hero{text-align:center;margin-bottom:22px;color:var(--ink);}
.at-brand{font-family:var(--font-body);font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;}
.at-brand-accent{color:var(--gold-1);font-weight:700;}
.at-hero h1{font-family:var(--font-display);font-weight:800;font-size:40px;line-height:1.05;margin:0 0 10px;letter-spacing:-.02em;}
.at-lead{font-family:var(--font-body);color:var(--muted);font-size:14px;line-height:1.5;max-width:420px;margin:0 auto;}

.at-card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px;color:var(--ink);backdrop-filter:blur(8px);}
.at-section{font-family:var(--font-body);font-size:11px;letter-spacing:.25em;text-transform:uppercase;color:var(--gold-1);margin-bottom:8px;font-weight:700;}
.at-qtitle{font-family:var(--font-display);font-weight:700;font-size:22px;line-height:1.2;margin:0 0 10px;color:var(--ink);}
.at-help{font-family:var(--font-body);font-size:13px;color:var(--muted);line-height:1.5;margin:0 0 14px;}
.at-howto{background:rgba(0,0,0,0.35);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:0 0 14px;}
.at-howto ol{margin:0;padding-left:20px;font-family:var(--font-body);color:var(--ink);font-size:13px;line-height:1.5;}
.at-video{position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;margin:0 0 14px;border:1px solid var(--line);background:#000;}
.at-video iframe{position:absolute;inset:0;width:100%;height:100%;}
.at-video-missing{display:flex;align-items:center;justify-content:center;height:180px;background:rgba(0,0,0,0.4);border-radius:12px;border:1px dashed var(--line);color:var(--muted);font-family:var(--font-body);font-size:13px;margin-bottom:14px;text-align:center;padding:0 20px;}

.at-opts{display:flex;flex-direction:column;gap:8px;}
.at-opt{display:flex;align-items:center;gap:10px;background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:12px 14px;cursor:pointer;color:var(--ink);font-family:var(--font-body);font-size:14px;text-align:left;transition:background .15s,border-color .15s;}
.at-opt:hover{background:rgba(252,211,77,0.08);border-color:var(--gold-2);}
.at-opt[aria-pressed="true"]{background:rgba(252,211,77,0.15);border-color:var(--gold-1);}
.at-dot{width:10px;height:10px;border-radius:50%;background:#404040;flex-shrink:0;}
.at-opt[aria-pressed="true"] .at-dot{background:var(--gold-1);}

.at-btn{display:block;width:100%;background:var(--gold-1);color:#171717;font-family:var(--font-body);font-weight:700;font-size:15px;padding:14px;border-radius:12px;border:none;cursor:pointer;margin-top:14px;transition:background .15s;}
.at-btn:hover:not(:disabled){background:var(--gold-2);}
.at-btn:disabled{opacity:.4;cursor:not-allowed;}
.at-btn.wa{background:var(--wa);color:white;}
.at-btn.wa:hover{background:#178847;}
.at-btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line);}
.at-btn.ghost:hover{background:rgba(255,255,255,0.04);}

.at-top{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
.at-back{background:transparent;color:var(--muted);border:none;cursor:pointer;font-size:14px;font-family:var(--font-body);padding:6px 10px;}
.at-progress{flex:1;height:4px;background:var(--line);border-radius:2px;overflow:hidden;}
.at-progress span{display:block;height:100%;background:var(--gold-1);transition:width .25s;}
.at-count{font-family:var(--font-body);font-size:12px;color:var(--muted);min-width:40px;text-align:right;}

.at-input{width:100%;padding:12px 14px;border-radius:10px;background:var(--surface-2);border:1px solid var(--line);color:var(--ink);font-family:var(--font-body);font-size:14px;}
.at-input:focus{outline:none;border-color:var(--gold-1);}

/* Resultado */
.at-arq-head{text-align:center;color:var(--ink);margin-bottom:18px;}
.at-arq-emoji{font-size:56px;line-height:1;margin-bottom:6px;}
.at-arq-title{font-family:var(--font-display);font-weight:800;font-size:32px;line-height:1.1;color:var(--gold-1);margin:0 0 8px;letter-spacing:-.01em;}
.at-arq-summary{font-family:var(--font-body);color:var(--ink);font-size:14px;line-height:1.55;max-width:520px;margin:0 auto;}

.at-bars{display:flex;flex-direction:column;gap:12px;margin-top:4px;}
.at-bar{display:flex;flex-direction:column;gap:4px;}
.at-bar-head{display:flex;align-items:baseline;justify-content:space-between;font-family:var(--font-body);color:var(--ink);}
.at-bar-name{font-size:14px;font-weight:600;}
.at-bar-score{font-size:18px;font-weight:700;font-family:var(--font-display);letter-spacing:-.02em;}
.at-bar-track{height:10px;background:rgba(255,255,255,0.08);border-radius:999px;overflow:hidden;}
.at-bar-fill{height:100%;border-radius:999px;transition:width .4s;}
.at-bar-fill.green{background:linear-gradient(90deg,#16A34A,#22C55E);}
.at-bar-fill.amber{background:linear-gradient(90deg,#D97706,#F59E0B);}
.at-bar-fill.red{background:linear-gradient(90deg,#DC2626,#EF4444);}
.at-bar-hint{font-family:var(--font-body);font-size:12px;color:var(--muted);line-height:1.4;margin-top:2px;}
`;

export function AutotestHombroClient({
  videoUrls,
}: {
  videoUrls: { test1: string; test2: string; test3: string };
}) {
  const [screen, setScreen] = useState<Screen>("intro");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Respuestas>({});
  const [responseId, setResponseId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [consent, setConsent] = useState(false);

  const igFromUrl = useRef<string | null>(null);
  const campaignFromUrl = useRef<string | null>(null);
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      igFromUrl.current = u.searchParams.get("ig") || null;
      campaignFromUrl.current = u.searchParams.get("c") || null;
    } catch { /* noop */ }
  }, []);

  // ─── Persistencia best-effort ──
  async function patchProgress(patch: Record<string, unknown>) {
    if (!responseId) return;
    try {
      await fetch(`/api/autotest-hombro/${responseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
        keepalive: true,
      });
    } catch { /* silencioso */ }
  }

  // ─── Iniciar ──
  async function start() {
    if (starting) return;
    setStarting(true);
    try {
      const res = await fetch("/api/autotest-hombro", {
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

  // ─── Navegación ──
  function goBack() {
    if (step === 0) { setScreen("intro"); return; }
    setStep(step - 1);
  }

  async function next() {
    const nextStep = step + 1;
    patchProgress({
      respuestas: answers as Record<string, unknown>,
      ultimoPaso: Math.max(step, nextStep - 1),
      nombre: typeof answers.nombre === "string" ? answers.nombre : undefined,
    });
    if (nextStep >= Q.length) {
      // Cerrar
      await fetch(`/api/autotest-hombro/${responseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          respuestas: answers as Record<string, unknown>,
          nombre: typeof answers.nombre === "string" ? answers.nombre : undefined,
          cerrar: "completado",
        }),
      });
      setScreen("result");
      return;
    }
    setStep(nextStep);
  }

  function trackWhatsappClick() {
    if (!responseId) return;
    try {
      const url = `/api/autotest-hombro/${responseId}/whatsapp`;
      if ("sendBeacon" in navigator) {
        navigator.sendBeacon(url, new Blob(["{}"], { type: "application/json" }));
      } else {
        fetch(url, { method: "POST", keepalive: true });
      }
    } catch { /* noop */ }
  }

  return (
    <div data-scope="autotest" className={`${display.variable} ${body.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div className="at-bg" aria-hidden />
      <div className="at-bg-overlay" aria-hidden />
      <main className="at-wrap" aria-live="polite">
        {screen === "intro" && (
          <IntroScreen
            consent={consent}
            setConsent={setConsent}
            start={start}
            starting={starting}
          />
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
            videoUrls={videoUrls}
          />
        )}
        {screen === "result" && (
          <ResultScreen
            answers={answers}
            onRestart={() => {
              setAnswers({});
              setResponseId(null);
              setStep(0);
              setScreen("intro");
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
  consent: boolean;
  setConsent: (b: boolean) => void;
  start: () => void;
  starting: boolean;
}) {
  return (
    <>
      <header className="at-hero">
        <div className="at-brand"><span className="at-brand-accent">FisioFitCross</span></div>
        <h1>
          Autotest funcional del hombro
          <br />
          <span style={{ color: "var(--gold-1)" }}>para CrossFit</span>
        </h1>
        <p className="at-lead">
          Descubre tus 6 capacidades de hombro en 7 minutos, sin material. Al final te decimos a qué tipo de atleta perteneces y qué toca mejorar primero.
        </p>
      </header>
      <section className="at-card">
        <div className="at-section">Lo que vas a hacer</div>
        <ol style={{ paddingLeft: 18, margin: "0 0 14px", color: "var(--ink)", fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.55 }}>
          <li>5 preguntas rápidas sobre tu snatch, tus gymnastics y tus números.</li>
          <li>3 mini-tests en vídeo que haces en casa (sin barra, sin pullup bar).</li>
          <li>Tu resultado: 6 barras + tu arquetipo + siguiente paso.</li>
        </ol>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontFamily: "var(--font-body)", color: "var(--muted)", fontSize: 12, lineHeight: 1.5, marginBottom: 6 }}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            Acepto que FisioFitCross trate mis respuestas para darme el resultado y, si lo pido, contactar conmigo por WhatsApp. Puedo pedir eliminar mis datos escribiéndoles.
          </span>
        </label>
        <button className="at-btn" onClick={start} disabled={!consent || starting}>
          {starting ? "Cargando…" : "Empezar el autotest →"}
        </button>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--muted)", textAlign: "center", margin: "10px 0 0" }}>
          Este test te orienta, no sustituye una valoración profesional. Si algo te duele mucho mientras lo haces, para.
        </p>
      </section>
    </>
  );
}

// ═══════════ Quiz ═══════════

function QuizScreen({
  step, question: q, answers, setAnswers, onNext, onBack, total, videoUrls,
}: {
  step: number;
  question: Question;
  answers: Respuestas;
  setAnswers: (u: Respuestas | ((prev: Respuestas) => Respuestas)) => void;
  onNext: () => void;
  onBack: () => void;
  total: number;
  videoUrls: { test1: string; test2: string; test3: string };
}) {
  const progressPct = ((step + 1) / total) * 100;
  const videoUrl = q.type === "single" && q.videoKey
    ? videoUrls[`test${q.videoKey}` as "test1" | "test2" | "test3"]
    : null;
  const embed = useMemo(() => (videoUrl ? youtubeEmbedUrl(videoUrl) : null), [videoUrl]);

  const canContinue = q.type === "text"
    ? typeof answers.nombre === "string" && (answers.nombre as string).trim().length >= 2
    : !!(answers as any)[q.id];

  return (
    <>
      <div className="at-top">
        <button className="at-back" onClick={onBack}>‹ Atrás</button>
        <div className="at-progress" aria-hidden><span style={{ width: `${progressPct}%` }} /></div>
        <div className="at-count">{step + 1} / {total}</div>
      </div>
      <section className="at-card">
        <div className="at-section">{q.section}</div>
        <h2 className="at-qtitle">{q.title}</h2>
        {q.help && <p className="at-help">{q.help}</p>}

        {q.type === "single" && q.videoKey && (
          embed ? (
            <div className="at-video">
              <iframe src={embed} title={q.title} allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            </div>
          ) : (
            <div className="at-video-missing">
              Vídeo pendiente. Puedes elegir aún así según la descripción.
            </div>
          )
        )}

        {q.type === "single" && q.howto && (
          <div className="at-howto">
            <ol>{q.howto.map((t, i) => <li key={i}>{t}</li>)}</ol>
          </div>
        )}

        {q.type === "single" && (
          <div className="at-opts">
            {q.options.map((o) => {
              const picked = (answers as any)[q.id]?.v === o.v;
              return (
                <button
                  key={o.v}
                  className="at-opt"
                  aria-pressed={picked}
                  onClick={() => {
                    setAnswers((prev) => ({ ...prev, [q.id]: { v: o.v } }));
                  }}
                >
                  <span className="at-dot" />
                  <span>{o.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {q.type === "text" && (
          <input
            className="at-input"
            type="text"
            placeholder="Tu nombre"
            value={typeof answers.nombre === "string" ? (answers.nombre as string) : ""}
            onChange={(e) => setAnswers((prev) => ({ ...prev, nombre: e.target.value }))}
            maxLength={60}
            autoFocus
          />
        )}

        <button className="at-btn" disabled={!canContinue} onClick={onNext}>
          {step + 1 === total ? "Ver mi resultado →" : "Continuar"}
        </button>
      </section>
    </>
  );
}

// ═══════════ Resultado ═══════════

function ResultScreen({
  answers, onRestart, trackWhatsappClick,
}: {
  answers: Respuestas;
  onRestart: () => void;
  trackWhatsappClick: () => void;
}) {
  const result = useMemo(() => evaluate(answers), [answers]);
  const arq = arquetipoById(result.arquetipoId)!;
  const name = typeof answers.nombre === "string" ? (answers.nombre as string).trim().split(" ")[0] : "";

  // Áreas más débiles, para incluirlas en el mensaje de WhatsApp.
  const debiles = [...AREAS]
    .map((a) => ({ ...a, score: result.scores[a.id] }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 2);

  const msg = `¡Hola Ales! ${name ? `Soy ${name}. ` : ""}Hice el Autotest Funcional del Hombro y me ha salido *${arq.title}*.\nMis dos áreas más flojas: ${debiles.map((d) => d.name.toLowerCase()).join(" y ")}.\nMe gustaría que me pasaras un par de cosas concretas para mejorarlas.`;
  const wa = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;

  return (
    <>
      <header className="at-hero">
        <div className="at-brand"><span className="at-brand-accent">FisioFitCross</span> · Tu resultado</div>
        <div className="at-arq-head">
          <div className="at-arq-emoji">{arq.emoji}</div>
          <h2 className="at-arq-title">
            {name ? `${name}, eres` : "Eres un"} <br />{arq.title}
          </h2>
          <p className="at-arq-summary">{arq.summary}</p>
        </div>
      </header>

      <section className="at-card">
        <div className="at-section">Tus 6 capacidades</div>
        <div className="at-bars">
          {AREAS.map((a) => {
            const score = result.scores[a.id as AreaId];
            const level = levelFromScore(score);
            const showHint = score < 40;
            return (
              <div key={a.id} className="at-bar">
                <div className="at-bar-head">
                  <span className="at-bar-name">{a.emoji} {a.name}</span>
                  <span className="at-bar-score">{score}<span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 2 }}>/100</span></span>
                </div>
                <div className="at-bar-track">
                  <div className={`at-bar-fill ${level}`} style={{ width: `${score}%` }} />
                </div>
                {showHint && <div className="at-bar-hint">{a.weakHint}</div>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="at-card" style={{ marginTop: 14 }}>
        <div className="at-section">Siguiente paso</div>
        <p style={{ fontFamily: "var(--font-body)", color: "var(--ink)", fontSize: 14, lineHeight: 1.55, margin: "0 0 12px" }}>
          Si quieres te paso un par de ejercicios concretos para tus 2 áreas más débiles ({debiles.map((d) => d.name.toLowerCase()).join(" y ")}) y te cuento cómo encajarlos sin tocar tu rutina del box.
        </p>
        <a
          className="at-btn wa"
          href={wa}
          target="_blank"
          rel="noopener"
          onClick={trackWhatsappClick}
        >
          Hablar con Ales por WhatsApp →
        </a>
      </section>

      <button className="at-btn ghost" style={{ marginTop: 10 }} onClick={onRestart}>
        Volver a empezar
      </button>
    </>
  );
}
