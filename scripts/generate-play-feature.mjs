/**
 * scripts/generate-play-feature.mjs
 *
 * Genera el "Feature Graphic" 1024×500 que pide Google Play Store. Es la
 * imagen grande que aparece en la ficha del Play Store, sobre el icono y
 * el nombre de la app. Solo se usa una vez por app; si quieres cambiarla
 * en el futuro, la editas en Play Console sin re-submit.
 *
 * Diseño: fondo negro #0A0A0A, rayo ámbar a la izquierda, textos a la
 * derecha. El SVG se compone a mano y se rasteriza con sharp.
 *
 * Uso: node scripts/generate-play-feature.mjs
 * Salida: assets/play-feature-graphic.png
 */
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const AMBER = "#FBBF24";
const AMBER_DARK = "#F59E0B";
const BLACK = "#0A0A0A";
const WHITE = "#FAFAFA";
const DIM = "#A3A3A3";

const FEATURE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 500" width="1024" height="500">
  <defs>
    <linearGradient id="amber-grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${AMBER}"/>
      <stop offset="1" stop-color="${AMBER_DARK}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.25" cy="0.5" r="0.4">
      <stop offset="0" stop-color="${AMBER}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="${AMBER}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Fondo negro -->
  <rect width="1024" height="500" fill="${BLACK}"/>
  <!-- Glow detrás del icono -->
  <rect width="1024" height="500" fill="url(#glow)"/>

  <!-- Icono cuadrado con el rayo (izquierda) -->
  <g transform="translate(80, 130)">
    <rect width="240" height="240" rx="48" fill="url(#amber-grad)"/>
    <!-- rayo escalado dentro del 240×240 -->
    <path
      d="M135.5 45 L75 130 L112 130 L104 195 L165 110 L128 110 Z"
      fill="${BLACK}"
    />
  </g>

  <!-- Textos a la derecha -->
  <g transform="translate(380, 0)">
    <!-- Nombre app -->
    <text x="0" y="200"
          font-family="-apple-system, system-ui, 'Segoe UI', sans-serif"
          font-size="68" font-weight="800" fill="${WHITE}"
          letter-spacing="-2">
      FisioFit App
    </text>
    <!-- Tagline línea 1 -->
    <text x="0" y="260"
          font-family="-apple-system, system-ui, 'Segoe UI', sans-serif"
          font-size="28" font-weight="600" fill="${AMBER}"
          letter-spacing="-0.5">
      Tu fisio personal online
    </text>
    <!-- Tagline línea 2 -->
    <text x="0" y="305"
          font-family="-apple-system, system-ui, 'Segoe UI', sans-serif"
          font-size="22" font-weight="400" fill="${DIM}"
          letter-spacing="-0.2">
      Vuelve a entrenar CrossFit sin dolor.
    </text>
    <!-- Tagline línea 3 -->
    <text x="0" y="335"
          font-family="-apple-system, system-ui, 'Segoe UI', sans-serif"
          font-size="22" font-weight="400" fill="${DIM}"
          letter-spacing="-0.2">
      Programa diseñado para ti.
    </text>
  </g>

  <!-- Pie discreto -->
  <text x="80" y="465"
        font-family="-apple-system, system-ui, 'Segoe UI', sans-serif"
        font-size="14" font-weight="500" fill="${DIM}"
        letter-spacing="2"
        text-transform="uppercase">
    READAPTACIÓN DEPORTIVA · ESPAÑA
  </text>
</svg>`.trim();

await mkdir("assets", { recursive: true });

await sharp(Buffer.from(FEATURE_SVG))
  .png()
  .toFile("assets/play-feature-graphic.png");

console.log("✓ assets/play-feature-graphic.png  (1024×500)");
console.log("");
console.log("Súbelo en Google Play Console → Ficha de Store → Gráficos →");
console.log("Gráfico destacado (Feature Graphic).");
