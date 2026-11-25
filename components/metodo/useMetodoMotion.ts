"use client";

import { useEffect, useRef } from "react";

/** Local presentation state only: no identifiers, events or network requests. */
export function useMetodoMotion() {
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const distance = document.documentElement.scrollHeight - window.innerHeight;
      page.style.setProperty("--mf-progress", String(distance > 0 ? Math.min(1, Math.max(0, window.scrollY / distance)) : 0));
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const elements = Array.from(page.querySelectorAll<HTMLElement>("[data-mf-reveal]"));
    const observer: IntersectionObserver | null = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.removeAttribute("data-mf-pending");
        observer?.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -32px 0px", threshold: 0 }) : null;
    if (observer && !reduced.matches) for (const element of elements) {
      // SSR and in-view content stay visible; only future sections enter progressively.
      if (element.getBoundingClientRect().top > window.innerHeight) {
        element.setAttribute("data-mf-pending", "");
        observer.observe(element);
      }
    }
    const showAll = () => { if (reduced.matches) { observer?.disconnect(); elements.forEach(el => el.removeAttribute("data-mf-pending")); } };
    reduced.addEventListener("change", showAll);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reduced.removeEventListener("change", showAll);
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      elements.forEach(el => el.removeAttribute("data-mf-pending"));
    };
  }, []);
  return pageRef;
}
