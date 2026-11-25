"use client";

import { useId, useState } from "react";
import type { Section } from "@/lib/metodo/content";
import "./metodo-journey.css";

/** Abstract marks describe the process; they do not represent clinical measurements. */
function JourneyMark({ phase }: { phase: number }) {
  return (
    <svg className="mj-mark" viewBox="0 0 260 260" fill="none" aria-hidden="true">
      <circle className="mj-mark-orbit" cx="130" cy="130" r="110" />
      <path className="mj-mark-cross" d="M130 13v14m0 206v14M13 130h14m206 0h14" />
      {phase % 4 === 0 && (
        <g className="mj-mark-main">
          <path d="M70 75h89a20 20 0 0 1 20 20v43a20 20 0 0 1-20 20h-43l-34 25v-25H70a20 20 0 0 1-20-20V95a20 20 0 0 1 20-20Z" />
          <path className="mj-mark-secondary" d="M179 107h11a20 20 0 0 1 20 20v40a20 20 0 0 1-20 20h-4v19l-29-19h-20a20 20 0 0 1-20-20v-9" />
          <path d="M81 106h67m-67 23h42" />
        </g>
      )}
      {phase % 4 === 1 && (
        <g className="mj-mark-main">
          <path d="M38 130h184M65 93v74m21-88v102m88-102v102m21-88v74" />
          <path className="mj-mark-secondary" d="M110 72h40m-32-16v32m-8 100h40m-16-16v32" />
          <circle cx="130" cy="130" r="18" />
          <path d="m123 130 5 5 10-11" />
        </g>
      )}
      {phase % 4 === 2 && (
        <g className="mj-mark-main">
          <path className="mj-mark-secondary" d="M58 181v-49a72 72 0 0 1 144 0v49M83 181v-49a47 47 0 0 1 94 0v49" />
          <path d="M108 181v-49a22 22 0 0 1 44 0v49M130 181v-49" />
          <path d="m121 141 9-9 9 9M49 195h162" />
        </g>
      )}
      {phase % 4 === 3 && (
        <g className="mj-mark-main">
          <circle className="mj-mark-secondary" cx="130" cy="130" r="72" />
          <circle cx="130" cy="130" r="46" />
          <path d="m102 131 20 20 42-45M177 57l23-8-8 23M178 70l22-21" />
        </g>
      )}
    </svg>
  );
}

export function MetodoJourney({ section }: { section: Section }) {
  const [selected, setSelected] = useState(0);
  const componentId = useId();
  const active = Math.min(selected, Math.max(section.items.length - 1, 0));

  if (!section.visible) return null;

  return (
    <section id="metodologia" className="mf-method mj-section" aria-labelledby={`${componentId}-title`}>
      <div className="mj-inner">
        <header className="mj-intro">
          <div>
            {section.eyebrow && <p className="mj-eyebrow"><span aria-hidden="true" />{section.eyebrow}</p>}
            <h2 id={`${componentId}-title`}>{section.title}</h2>
          </div>
          {section.body && <p className="mj-intro-body">{section.body}</p>}
        </header>

        {section.items.length > 0 && (
          <div className="mj-journey">
            <div className="mj-selector-label">Explora cada fase</div>
            <div className="mj-selectors" role="group" aria-label="Fases de nuestra metodología">
              {section.items.map((item, index) => (
                <button
                  key={index}
                  type="button"
                  className={`mj-selector${active === index ? " mj-selector-active" : ""}`}
                  aria-pressed={active === index}
                  aria-controls={`${componentId}-phase-${index}`}
                  onClick={() => setSelected(index)}
                >
                  <span className="mj-selector-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <span className="mj-selector-title">{item.title}</span>
                </button>
              ))}
            </div>

            <div className="mj-panels" aria-live="polite" aria-atomic="true">
              {section.items.map((item, index) => (
                <div
                  key={index}
                  id={`${componentId}-phase-${index}`}
                  className="mj-panel"
                  hidden={active !== index}
                >
                  <div className="mj-phase-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</div>
                  <div className="mj-phase-copy">
                    <span className="mj-phase-caption">Fase {String(index + 1).padStart(2, "0")}</span>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </div>
                  <JourneyMark phase={index} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
