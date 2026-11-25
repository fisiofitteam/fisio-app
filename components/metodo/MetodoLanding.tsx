"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, Dumbbell, MessageCircle, Pause, SlidersHorizontal } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ZONES, youtubeId, type PublicMetodo, type Section } from "@/lib/metodo/content";
import { MetodoJourney } from "./MetodoJourney";
import { MetodoVideo } from "./MetodoVideo";
import { useMetodoAnalytics } from "./useMetodoAnalytics";
import "./metodo.css";

const isVideo = (url: string) => !!youtubeId(url) || /\.(mp4|webm|mov)(?:\?|$)/i.test(url);

function Intro({ section }: { section: Section }) {
  return <div className="mf-intro">
    {section.eyebrow && <p className="mf-eyebrow">{section.eyebrow}</p>}
    <h2>{section.title}</h2>
    {section.body && <p className="mf-description">{section.body}</p>}
  </div>;
}

/** Emphasis only, without replacing or shortening the text saved by the team. */
function HeroTitle({ title }: { title: string }) {
  const emphasis = "sin que el dolor decida";
  const index = title.indexOf(emphasis);
  return <h1>{index < 0 ? title : <>{title.slice(0, index)}<mark>{emphasis}</mark>{title.slice(index + emphasis.length)}</>}</h1>;
}

function Brand() {
  return <span className="mf-brand"><span className="mf-logo-icon"><Logo size={30} /></span><span className="mf-brand-name">FISIO<span>FIT</span><small>CROSS</small></span></span>;
}

export function MetodoLanding({ content, preview = false }: { content: PublicMetodo; preview?: boolean }) {
  const { sections: s, media: m, buttons } = content;
  const analytics = useMetodoAnalytics(preview);
  const [zone, setZone] = useState("Todos");
  const stories = content.stories.filter(story => zone === "Todos" || story.zone === zone);
  const hasStories = s.results.visible && content.stories.length > 0;
  // Use the already published athlete photograph when no dedicated hero is set.
  // This is the public DTO: private/hidden source media never enter this component.
  const hero = m.hero.url ? m.hero : m.athlete;
  const heroIsAthlete = !m.hero.url && !!m.athlete.url;
  const educationIcons = [Pause, SlidersHorizontal, Dumbbell];
  const contact = (placement: string) => preview ? "#contacto" : `/api/metodo/contact?placement=${placement}`;
  const contactButton = (placement: string, quiet = false) => <a className={quiet ? "mf-text-link" : "mf-button"} href={contact(placement)}>
    {!quiet && <MessageCircle size={20} aria-hidden="true" />}{quiet ? buttons.secondary : buttons.contact}
  </a>;

  return <div className="mf-page">
    <a className="mf-skip" href="#contenido">Saltar al contenido</a>
    <header className="mf-header">
      <a href="/metodo" aria-label="FisioFitCross, inicio"><Brand /></a>
      <nav aria-label="Navegación de la metodología">
        {s.method.visible && <a href="#metodologia">El método</a>}
        {s.founder.visible && <a href="#equipo">Quiénes somos</a>}
        {hasStories && <a href="#historias">Historias reales</a>}
        <a className="mf-nav-contact" href={contact("header")}>Hablemos <MessageCircle size={17} aria-hidden="true" /></a>
      </nav>
    </header>
    <main id="contenido">
      {s.hero.visible && <section className={`mf-hero${!hero.url ? " mf-hero-no-media" : ""}`}>
        <div className="mf-hero-head">
          <p className="mf-eyebrow"><span aria-hidden="true" />{s.hero.eyebrow}</p>
          <HeroTitle title={s.hero.title} />
        </div>
        {hero.url && <figure className="mf-hero-visual">
          <div className="mf-photo-heading"><span>DE ATLETAS.</span><span>PARA ATLETAS.</span></div>
          <div className="mf-hero-image">
            {isVideo(hero.url) ? <MetodoVideo url={hero.url} poster={hero.poster} title={hero.alt || "Entrenar forma parte del proceso"} target="hero" track={analytics.track} /> :
              <Image src={hero.url} sizes="(max-width: 700px) calc(100vw - 64px), (max-width: 1100px) 40vw, 460px" priority alt={hero.alt || (heroIsAthlete ? "Ales realizando una sentadilla con la barra sobre la cabeza en el box" : "Un atleta entrenando")} width={600} height={600} />}
          </div>
          <figcaption><span>{heroIsAthlete ? "Ales · Fisioterapeuta y atleta" : "Tu deporte forma parte del proceso."}</span><span className="mf-photo-cross" aria-hidden="true">+</span></figcaption>
        </figure>}
        <p className="mf-hero-description">{s.hero.body}</p>
        <div className="mf-hero-actions">
          <a className="mf-button" href={s.method.visible ? "#metodologia" : "#contacto"}>{buttons.discover}</a>
          {contactButton("hero", true)}
        </div>
        <div className="mf-hero-caption"><span>Fisioterapia</span><span>Entrenamiento</span><span>Acompañamiento</span></div>
      </section>}

      {s.empathy.visible && <section className="mf-empathy"><div className="mf-section">
        <Intro section={s.empathy} />
        <div className="mf-empathy-list">{s.empathy.items.map((item, i) => <article key={i}>
          <span className="mf-line-mark" aria-hidden="true" />
          <h3>{item.title}</h3><p>{item.body}</p>
        </article>)}</div>
      </div></section>}

      {s.founder.visible && <section id="equipo" className="mf-section mf-founder">
        <div className="mf-founder-visual">
          <div className="mf-founder-label" aria-hidden="true"><span>ATLETA.</span><span>FISIO.</span></div>
          {m.clinician.url ? <figure className="mf-founder-portrait">
            <Image src={m.clinician.url} sizes="(max-width: 700px) calc(100vw - 48px), 430px" alt={m.clinician.alt || "Ales Faus, fisioterapeuta y fundador de FisioFitCross"} loading="lazy" width={600} height={554} />
            <figcaption><strong>Ales Faus</strong><span>Fisioterapeuta y fundador</span></figcaption>
          </figure> : m.athlete.url ? <figure className="mf-founder-portrait"><Image src={m.athlete.url} alt={m.athlete.alt || "Ales entrenando en el box"} loading="lazy" width={600} height={600} sizes="(max-width: 700px) calc(100vw - 48px), 430px" /><figcaption><strong>Ales Faus</strong><span>Fisioterapeuta y fundador</span></figcaption></figure> : <div className="mf-founder-principle"><Dumbbell aria-hidden="true" size={64} /><p>La experiencia deportiva.<br />La mirada clínica.</p></div>}
          {m.clinician.url && m.athlete.url && !(s.hero.visible && heroIsAthlete) && <figure className="mf-founder-secondary">
            <Image src={m.athlete.url} alt={m.athlete.alt || "Ales entrenando en el box"} width={240} height={240} sizes="120px" loading="lazy" />
            <figcaption>También lo vivimos desde dentro del box.</figcaption>
          </figure>}
        </div>
        <div className="mf-founder-copy">
          <Intro section={s.founder} />
          <div className="mf-founder-note"><span aria-hidden="true">+</span><p>Tu vida dentro del box.<br /><strong>Nuestro punto de partida.</strong></p></div>
          {m.introduction.url && <MetodoVideo url={m.introduction.url} poster={m.introduction.poster} title={m.introduction.alt || "Ales te cuenta cómo trabajamos"} target="introduction" track={analytics.track} />}
        </div>
      </section>}

      {s.education.visible && <section className="mf-education"><div className="mf-section">
        <Intro section={s.education} />
        <div className="mf-education-steps">{s.education.items.map((item, i) => {
          const Icon = educationIcons[Math.min(i, 2)];
          return <article key={i}><span className="mf-education-symbol"><Icon size={30} strokeWidth={1.5} aria-hidden="true" /></span><h3>{item.title}</h3><p>{item.body}</p></article>;
        })}</div>
      </div></section>}

      {s.method.visible && <MetodoJourney section={s.method} />}

      {hasStories && <section id="historias" className="mf-section mf-results">
        <Intro section={s.results} />
        <div className="mf-filters" role="group" aria-label="Filtrar historias por zona corporal">{["Todos", ...ZONES].map(z => <button type="button" key={z} aria-pressed={zone === z} onClick={() => { setZone(z); analytics.track("case_filter", z); }}>{z}</button>)}</div>
        <div className="mf-stories" aria-live="polite">{stories.length ? stories.map(story => <article className="mf-story" key={story.id}>
          {story.kind === "video" && story.mediaUrl ? <MetodoVideo url={story.mediaUrl} title={`La historia de ${story.name}`} target={story.id} track={analytics.track} /> : story.kind === "image" && story.mediaUrl ? <Image sizes="(max-width: 700px) 100vw, 50vw" className="mf-story-image" src={story.mediaUrl} alt={story.title} loading="lazy" decoding="async" width={700} height={500} /> : null}
          <div className="mf-story-copy"><p className="mf-story-zone">{story.zone}</p><h3>{story.title}</h3>{story.quote && <blockquote>{story.quote}</blockquote>}<p className="mf-story-name">{story.name}</p>
            {(story.before || story.after) && <details onToggle={e => { if (e.currentTarget.open) analytics.track("case_open", story.id); }}><summary>Conoce su historia</summary>{story.before && <div><h4>Su punto de partida</h4><p>{story.before}</p></div>}{story.after && <div><h4>Lo que comparte ahora</h4><p>{story.after}</p></div>}</details>}
          </div>
        </article>) : <p>No hay historias publicadas de esta zona por ahora.</p>}</div>
      </section>}

      {s.fit.visible && <section className="mf-section mf-fit">
        <div className="mf-fit-intro"><Intro section={s.fit} /><div className="mf-fit-emblem" aria-hidden="true"><Dumbbell size={44} strokeWidth={1.5} /><span>TÚ + NOSOTROS</span></div></div>
        <ul>{s.fit.items.map((item, i) => <li key={i}><Check size={20} strokeWidth={2} aria-hidden="true" /><div>{item.title}{item.body && <p>{item.body}</p>}</div></li>)}</ul>
      </section>}

      {s.faq.visible && <section className="mf-faq"><div className="mf-section">
        <Intro section={s.faq} />
        <div className="mf-faq-list">{s.faq.items.map((item, i) => <details key={i}><summary>{item.title}<span aria-hidden="true">+</span></summary><p>{item.body}</p></details>)}</div>
      </div></section>}

      {s.tools.visible && content.tools.some(t => t.visible && t.url) && <section className="mf-section mf-tools"><Intro section={s.tools} /><div>{content.tools.map((tool, i) => tool.visible && tool.url ? <a key={i} href={tool.url} onClick={() => analytics.track("tool_open", `tool-${i}`)}><h3>{tool.title}</h3><p>{tool.body}</p></a> : null)}</div></section>}

      {s.cta.visible && <section id="contacto" className="mf-final"><div className="mf-section">
        <p className="mf-eyebrow">{s.cta.eyebrow}</p><h2>{s.cta.title}</h2>
        <div className="mf-final-bottom"><p>{s.cta.body}</p><div>{contactButton("final")}<small>Una conversación para entender tu situación.</small></div></div>
      </div></section>}
    </main>
    <footer className="mf-footer">
      <div className="mf-footer-top"><Brand /><p>Fisioterapia para volver a tu deporte.</p></div>
      <div className="mf-footer-bottom"><span>De atletas para atletas.</span><div><a href="/privacidad">Privacidad</a><a href="/terminos">Términos</a><button type="button" onClick={analytics.openPreferences}>Preferencias de privacidad</button></div></div>
    </footer>
    {analytics.error && <p className="mf-privacy-error" role="status">{analytics.error}</p>}
    {analytics.showPreferences && <aside className="mf-consent" aria-label="Medición opcional">
      <h2>Tu privacidad, tu decisión.</h2>
      <p>Con tu permiso medimos visitas e interacciones y las relacionamos con conversaciones, llamadas y ventas mediante una referencia. Puedes rechazarlo y navegar igualmente. <a href="/metodo/privacidad">Más información</a></p>
      <div className="mf-consent-actions"><button type="button" onClick={() => void analytics.choose(false)}>Rechazar medición</button><button type="button" onClick={() => void analytics.choose(true)}>Aceptar medición</button></div>
    </aside>}
  </div>;
}
