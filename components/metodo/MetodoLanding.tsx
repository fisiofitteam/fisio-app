"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import teamLogo from "@/public/brand/fisiofitteam.png";
import { ArrowRight, Check, CircleCheck, MessageCircle, Play, X } from "lucide-react";
import { ZONES, youtubeId, type PublicMetodo, type Section } from "@/lib/metodo/content";
import { ORIGINS } from "@/lib/metodo/request";
import { MetodoJourney } from "./MetodoJourney";
import { MetodoRequestForm } from "./MetodoRequestForm";
import { MetodoVideo } from "./MetodoVideo";
import { useMetodoAnalytics } from "./useMetodoAnalytics";
import { useMetodoMotion } from "./useMetodoMotion";
import "./metodo.css";
import "./metodo-experience.css";
import "./metodo-conversion.css";

const isVideo = (url: string) => !!youtubeId(url) || /\.(mp4|webm|mov)(?:\?|$)/i.test(url);

function Intro({ section }: { section: Section }) {
  return <div className="mf-intro">
    {section.eyebrow && <p className="mf-eyebrow">{section.eyebrow}</p>}
    <h2>{section.title}</h2>
    {section.body && <p className="mf-description">{section.body}</p>}
  </div>;
}

/** Repeated call to action after each section: same label, one short reassurance. */
function InlineCta({ href, label, note, dark = false }: { href: string; label: string; note: string; dark?: boolean }) {
  return <div className={`mf-inline-cta${dark ? " mf-inline-cta-dark" : ""}`}>
    <a className="mf-button mf-button-yellow" href={href}>{label}<ArrowRight size={18} aria-hidden="true" /></a>
    <span>{note}</span>
  </div>;
}

function Brand() {
  return <span className="mf-brand"><Image src={teamLogo} alt="FisioFitTeam" width={500} height={500} sizes="140px" priority /></span>;
}

/** Mobile call to action: appears once the hero is behind; hides over the form, other buttons, footer and privacy banner. */
function useStickyCta(enabled: boolean) {
  const heroRef = useRef<HTMLElement>(null), [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;
    // Also hide while another call to action is on screen, so two yellow buttons never stack.
    const targets = [heroRef.current, document.getElementById("valoracion"), document.querySelector<HTMLElement>(".mf-footer"), ...Array.from(document.querySelectorAll<HTMLElement>(".mf-inline-cta, .mf-final"))].filter((el): el is HTMLElement => !!el);
    const inView = new Map<Element, boolean>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) inView.set(entry.target, entry.isIntersecting);
      const hero = heroRef.current;
      setVisible((!hero || inView.get(hero) === false) && !targets.some(t => t !== hero && inView.get(t)));
    }, { threshold: 0 });
    targets.forEach(t => observer.observe(t));
    return () => observer.disconnect();
  }, [enabled]);
  return { heroRef, visible };
}

export function MetodoLanding({ content, preview = false, origin = null }: { content: PublicMetodo; preview?: boolean; origin?: string | null }) {
  const { sections: s, media: m, buttons } = content;
  const analytics = useMetodoAnalytics(preview);
  const pageRef = useMetodoMotion();
  // Ad links (`?origen=hombro`) adapt the hero copy and pre-select the zone; nothing else changes.
  const variant = origin && s.hero.visible ? ORIGINS[origin] || null : null;
  const heroCopy = variant || s.hero;
  const hasForm = s.request.visible;
  const sticky = useStickyCta(hasForm || s.cta.visible);
  const showSticky = sticky.visible && !analytics.showPreferences && !analytics.error;
  const [zone, setZone] = useState("Todos");
  const stories = content.stories.filter(story => zone === "Todos" || story.zone === zone);
  const hasStories = s.results.visible && content.stories.length > 0;
  // Prefer the shared public team photograph when no dedicated hero is set.
  // This is the public DTO: private/hidden source media never enter this component.
  const hero = m.hero.url ? m.hero : m.team.url ? m.team : m.athlete;
  const heroIsTeam = !m.hero.url && !!m.team.url;
  // With the form visible every call to action leads to it; otherwise straight to WhatsApp as before.
  const whatsapp = (placement: string) => preview ? "#contacto" : `/api/metodo/contact?placement=${placement}`;
  const contact = (placement: string) => hasForm ? "#valoracion" : whatsapp(placement);
  const ctaNote = hasForm ? "4 preguntas · menos de 1 minuto" : "Te respondemos por WhatsApp";
  const cta = (placement: string, dark = false) => <InlineCta href={contact(placement)} label={buttons.contact} note={ctaNote} dark={dark} />;
  const contactButton = (placement: string, quiet = false) => <a className={quiet ? "mf-text-link" : "mf-button"} href={contact(placement)}>
    {!quiet && <MessageCircle size={18} aria-hidden="true" />}{quiet ? buttons.secondary : buttons.contact}
  </a>;

  return <div className="mf-page" ref={pageRef}>
    <a className="mf-skip" href="#contenido">Saltar al contenido</a>
    <header className="mf-header">
      <div className="mf-reading-progress" aria-hidden="true" />
      <a href="/metodo" aria-label="FisioFitTeam, inicio"><Brand /></a>
      <nav aria-label="Navegación de la metodología">
        {s.method.visible && <a href="#metodologia">El método</a>}
        {s.founder.visible && <a href="#equipo">El equipo</a>}
        {hasStories && <a href="#historias">Historias reales</a>}
        <a className="mf-nav-contact" href={contact("header")}>Hablemos <MessageCircle size={17} aria-hidden="true" /></a>
      </nav>
    </header>
    <main id="contenido">
      {s.hero.visible && <section ref={sticky.heroRef} className={`mf-hero${!hero.url ? " mf-hero-no-media" : ""}${isVideo(hero.url) ? " mf-hero-with-video" : ""}`}>
        <div className="mf-hero-content">
          {heroCopy.eyebrow && <p className="mf-eyebrow">{heroCopy.eyebrow}</p>}
          <h1>{heroCopy.title}</h1>
          {heroCopy.body && <p className="mf-hero-description">{heroCopy.body}</p>}
          <div className="mf-hero-actions">
            {hasForm ? <>
              <a className="mf-button mf-button-yellow" href="#valoracion">{buttons.contact}<ArrowRight size={18} aria-hidden="true" /></a>
              {s.method.visible && <a className="mf-text-link" href="#metodologia">{buttons.discover}</a>}
            </> : <>
              <a className="mf-button mf-button-yellow" href={s.method.visible ? "#metodologia" : "#contacto"}>{buttons.discover}</a>
              {contactButton("hero", true)}
            </>}
          </div>
          {s.founder.visible && m.introduction.url && <a className="mf-watch-intro" href="#presentacion"><Play size={16} aria-hidden="true" />Conoce al equipo en vídeo</a>}
        </div>
        {hero.url && <figure className="mf-hero-visual">
          {isVideo(hero.url) ? <MetodoVideo url={hero.url} poster={hero.poster} title={hero.alt || "Conoce a FisioFitTeam"} target="hero" track={analytics.track} /> :
            <Image src={hero.url} sizes="(max-width: 760px) 100vw, 53vw" priority alt={hero.alt || (heroIsTeam ? "El equipo de fisioterapeutas de FisioFitTeam en el box" : "Un atleta entrenando crosstraining")} width={heroIsTeam ? 1672 : 1080} height={heroIsTeam ? 941 : 1080} />}
          {heroIsTeam && <figcaption>FisioFitTeam <span>Fisioterapia y crosstraining</span></figcaption>}
        </figure>}
      </section>}

      {s.trust.visible && s.trust.items.length > 0 && <section className="mf-trust" aria-label="Lo que encontrarás en FisioFitTeam"><ul>
        {s.trust.items.map((item, i) => <li key={i}><CircleCheck size={20} aria-hidden="true" /><div><strong>{item.title}</strong>{item.body && <span>{item.body}</span>}</div></li>)}
      </ul></section>}

      {hasForm && <MetodoRequestForm section={s.request} origin={variant ? origin : null} initialZone={variant?.zone} preview={preview} track={analytics.track} directHref={whatsapp("direct")} directLabel={buttons.secondary} />}

      {s.founder.visible && m.introduction.url && <section id="presentacion" className="mf-section mf-presentation" data-mf-reveal>
        <div><p className="mf-eyebrow">CONOCE A FISIOFITTEAM</p><h2>{m.introduction.alt || "Te contamos cómo trabajamos."}</h2>{cta("presentation")}</div>
        <MetodoVideo url={m.introduction.url} poster={m.introduction.poster} title={m.introduction.alt || "Ales te cuenta cómo trabaja nuestro equipo"} target="introduction" track={analytics.track} />
      </section>}

      {s.empathy.visible && <section className="mf-empathy" data-mf-reveal><div className="mf-section">
        <Intro section={s.empathy} />
        <div className="mf-empathy-list">{s.empathy.items.map((item, i) => <details key={i}>
          <summary>{item.title}<span aria-hidden="true">+</span></summary><p>{item.body}</p>
        </details>)}</div>
        {cta("empathy")}
      </div></section>}

      {s.compare.visible && s.compare.items.length > 0 && <section className="mf-section mf-compare" data-mf-reveal>
        <Intro section={s.compare} />
        <div className="mf-compare-table" role="list">
          <div className="mf-compare-head" aria-hidden="true"><span>Lo de siempre</span><span>Con FisioFitTeam</span></div>
          {s.compare.items.map((item, i) => <div className="mf-compare-row" role="listitem" key={i}>
            <p className="mf-compare-old"><X size={20} aria-hidden="true" /><span><span className="mf-sr">Lo de siempre: </span>{item.title}</span></p>
            {item.body && <p className="mf-compare-new"><Check size={20} strokeWidth={2.5} aria-hidden="true" /><span><span className="mf-sr">Con FisioFitTeam: </span>{item.body}</span></p>}
          </div>)}
        </div>
        {cta("compare")}
      </section>}

      {s.method.visible && <MetodoJourney section={s.method} cta={cta("method", true)} />}

      {hasStories && <section id="historias" className="mf-section mf-results" data-mf-reveal>
        <Intro section={s.results} />
        <div className="mf-filters" role="group" aria-label="Filtrar historias por zona corporal">{["Todos", ...ZONES].map(z => <button type="button" key={z} aria-pressed={zone === z} onClick={() => { setZone(z); analytics.track("case_filter", z); }}>{z}</button>)}</div>
        <div className="mf-stories" aria-live="polite">{stories.length ? stories.map(story => <article className="mf-story" key={story.id}>
          {story.kind === "video" && story.mediaUrl ? <MetodoVideo url={story.mediaUrl} title={`La historia de ${story.name}`} target={story.id} track={analytics.track} /> : story.kind === "image" && story.mediaUrl ? <Image sizes="(max-width: 700px) 100vw, 50vw" className="mf-story-image" src={story.mediaUrl} alt={story.title} loading="lazy" decoding="async" width={700} height={500} /> : null}
          <div className="mf-story-copy"><p className="mf-story-zone">{story.zone}</p><h3>{story.title}</h3>{story.quote && <blockquote>{story.quote}</blockquote>}<p className="mf-story-name">{story.name}</p>
            {(story.before || story.after) && <details onToggle={e => { if (e.currentTarget.open) analytics.track("case_open", story.id); }}><summary>Conoce su historia</summary>{story.before && <div><h4>Su punto de partida</h4><p>{story.before}</p></div>}{story.after && <div><h4>Lo que comparte ahora</h4><p>{story.after}</p></div>}</details>}
          </div>
        </article>) : <p>No hay historias publicadas de esta zona por ahora.</p>}</div>
        {cta("stories")}
      </section>}

      {s.founder.visible && <section id="equipo" className="mf-section mf-team" data-mf-reveal>
        {m.team.url && !(s.hero.visible && heroIsTeam) && <figure className="mf-team-group"><Image src={m.team.url} alt={m.team.alt || "El equipo de FisioFitTeam"} width={1672} height={941} sizes="(max-width: 700px) calc(100vw - 48px), 90vw" loading="lazy" /></figure>}
        <div className="mf-team-copy">
          <Intro section={s.founder} />
          {cta("team")}
        </div>
        {(m.athlete.url || m.clinician.url) && <div className="mf-team-origin">
          <div className={`mf-team-diptych${!m.athlete.url || !m.clinician.url ? " mf-team-single" : ""}`}>
            {m.athlete.url && <figure className="mf-athlete-photo"><div className="mf-team-photo"><Image src={m.athlete.url} alt={m.athlete.alt || "Ales entrenando crosstraining"} width={1080} height={1080} sizes="(max-width: 700px) 44vw, (max-width: 1100px) 23vw, 280px" loading="lazy" /></div><figcaption>Atleta</figcaption></figure>}
            {m.clinician.url && <figure className="mf-clinician-photo"><div className="mf-team-photo"><Image src={m.clinician.url} alt={m.clinician.alt || "Ales Faus, fisioterapeuta y fundador de FisioFitTeam"} width={1080} height={999} sizes="(max-width: 700px) 44vw, (max-width: 1100px) 23vw, 280px" loading="lazy" /></div><figcaption>Fisioterapeuta</figcaption></figure>}
          </div>
          <p className="mf-origin-caption">Ales Faus · Fisioterapeuta y fundador de FisioFitTeam</p>
        </div>}
      </section>}

      {s.education.visible && <section className="mf-education" data-mf-reveal><div className="mf-section">
        <Intro section={s.education} />
        <div className="mf-education-steps">{s.education.items.map((item, i) => <article key={i}>
          <span className="mf-step-index" aria-hidden="true">{String(i + 1).padStart(2,"0")}</span><h3>{item.title}</h3><p>{item.body}</p>
        </article>)}</div>
      </div></section>}

      {s.fit.visible && <section className="mf-section mf-fit" data-mf-reveal>
        <div className="mf-fit-intro"><Intro section={s.fit} /></div>
        <ul>{s.fit.items.map((item, i) => <li key={i}><Check size={20} strokeWidth={2} aria-hidden="true" /><div>{item.title}{item.body && <p>{item.body}</p>}</div></li>)}</ul>
        {cta("fit")}
      </section>}

      {s.faq.visible && <section className="mf-faq" data-mf-reveal><div className="mf-section">
        <Intro section={s.faq} />
        <div className="mf-faq-list">{s.faq.items.map((item, i) => <details key={i}><summary>{item.title}<span aria-hidden="true">+</span></summary><p>{item.body}</p></details>)}</div>
      </div></section>}

      {s.tools.visible && content.tools.some(t => t.visible && t.url) && <section className="mf-section mf-tools"><Intro section={s.tools} /><div>{content.tools.map((tool, i) => tool.visible && tool.url ? <a key={i} href={tool.url} onClick={() => analytics.track("tool_open", `tool-${i}`)}><h3>{tool.title}</h3><p>{tool.body}</p></a> : null)}</div></section>}

      {s.cta.visible && <section id="contacto" className="mf-final" data-mf-reveal><div className="mf-section">
        <p className="mf-eyebrow">{s.cta.eyebrow}</p><h2>{s.cta.title}</h2>
        <div className="mf-final-bottom"><p>{s.cta.body}</p><div>{contactButton("final")}<small>Una conversación para entender tu situación.</small></div></div>
      </div></section>}
    </main>
    <footer className="mf-footer">
      <div className="mf-footer-top"><Brand /><p>Fisioterapia para volver a tu deporte.</p></div>
      <div className="mf-footer-bottom"><span>De atletas para atletas.</span><div><a href="/privacidad">Privacidad</a><a href="/terminos">Términos</a><button type="button" onClick={analytics.openPreferences}>Preferencias de privacidad</button></div></div>
    </footer>
    {(hasForm || s.cta.visible) && <a className="mf-sticky-cta" href={contact("sticky")} data-visible={showSticky} aria-hidden={!showSticky} tabIndex={showSticky ? undefined : -1}>
      <MessageCircle size={18} aria-hidden="true" />{buttons.contact}
    </a>}
    {analytics.error && <p className="mf-privacy-error" role="status">{analytics.error}</p>}
    {analytics.showPreferences && <aside className="mf-consent" aria-label="Medición opcional">
      <h2>Tu privacidad, tu decisión.</h2>
      <p>Con tu permiso medimos visitas e interacciones y las relacionamos con conversaciones, llamadas y ventas mediante una referencia. Puedes rechazarlo y navegar igualmente. <a href="/metodo/privacidad">Más información</a></p>
      <div className="mf-consent-actions"><button type="button" onClick={() => void analytics.choose(false)}>Rechazar medición</button><button type="button" onClick={() => void analytics.choose(true)}>Aceptar medición</button></div>
    </aside>}
  </div>;
}
