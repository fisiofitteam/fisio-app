"use client";

import { useId, useState } from "react";
import type { Section } from "@/lib/metodo/content";
import "./metodo-journey.css";

export function MetodoJourney({ section }: { section: Section }) {
  const [selected, setSelected] = useState<number | null>(0);
  const componentId = useId();
  const active = selected === null ? null : Math.min(selected, section.items.length - 1);

  if (!section.visible) return null;

  return (
    <section id="metodologia" className="mf-method mj-section" aria-labelledby={`${componentId}-title`}>
      <div className="mj-inner">
        <header className="mj-intro">
          {section.eyebrow && <p className="mj-eyebrow">{section.eyebrow}</p>}
          <h2 id={`${componentId}-title`}>{section.title}</h2>
          {section.body && <p className="mj-intro-body">{section.body}</p>}
        </header>

        {section.items.length > 0 && (
          <div className="mj-phases">
            {section.items.map((item, index) => {
              const expanded = active === index;
              const buttonId = `${componentId}-trigger-${index}`;
              const panelId = `${componentId}-phase-${index}`;

              return (
                <div key={index} className={`mj-phase${expanded ? " mj-phase-open" : ""}`}>
                  <h3 className="mj-phase-heading">
                    <button
                      id={buttonId}
                      className="mj-phase-trigger"
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      onClick={() => setSelected(expanded ? null : index)}
                    >
                      <span className="mj-phase-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                      <span className="mj-phase-title">{item.title}</span>
                      <span className="mj-phase-arrow" aria-hidden="true" />
                    </button>
                  </h3>
                  <div
                    id={panelId}
                    className="mj-phase-panel"
                    role="region"
                    aria-labelledby={buttonId}
                    hidden={!expanded}
                  >
                    <p>{item.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
