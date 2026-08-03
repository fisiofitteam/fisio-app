"use client";

import { useEffect } from "react";

/**
 * Inyecta el link a Google Fonts (Anton + Bebas Neue) en `<head>` la primera
 * vez que el editor visual del Carrusel Maker se monta. Idempotente: si el
 * link ya está en el DOM, no lo dobla. Se descarga en background, así la
 * primera generación puede pillar Bebas mientras Anton carga.
 */
export function CarouselFontsLoader() {
  useEffect(() => {
    const id = "carousel-maker-fonts";
    if (typeof document === "undefined") return;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&display=swap";
    document.head.appendChild(link);
  }, []);
  return null;
}
