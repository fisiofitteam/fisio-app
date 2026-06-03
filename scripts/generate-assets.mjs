/**
 * scripts/generate-assets.mjs
 *
 * Genera los assets que pide @capacitor/assets (icono + splash) a partir
 * del SVG del logo de la app (public/icon-512.svg).
 *
 * Salida en assets/:
 *   - icon-only.png       (1024×1024, transparente alrededor del logo)
 *   - icon-foreground.png (1024×1024, igual que icon-only para adaptive icon Android)
 *   - icon-background.png (1024×1024, solo el color de fondo ámbar)
 *   - splash.png          (2732×2732, fondo negro con el icono centrado)
 *   - splash-dark.png     (2732×2732, igual — tema oscuro como base)
 *
 * Uso:
 *   node scripts/generate-assets.mjs
 *
 * Tras esto:
 *   npx @capacitor/assets generate --iconBackgroundColor "#FBBF24" \
 *                                  --iconBackgroundColorDark "#FBBF24" \
 *                                  --splashBackgroundColor "#0A0A0A" \
 *                                  --splashBackgroundColorDark "#0A0A0A"
 *
 * Y Capacitor crea las decenas de tamaños para iOS y Android automáticamente.
 */
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const AMBER = "#FBBF24";
const BLACK = "#0A0A0A";

// SVG completo del icono (rayo negro sobre fondo ámbar redondeado).
// Mismo contenido que public/icon-512.svg pero a 1024×1024.
const ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" rx="192" fill="${AMBER}"/>
  <path d="M578 192 L320 560 L480 560 L446 832 L704 464 L544 464 Z" fill="${BLACK}"/>
</svg>`.trim();

// Versión sin fondo (transparente) — el icono solo, para foreground del
// adaptive icon de Android.
const ICON_FOREGROUND_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <path d="M578 192 L320 560 L480 560 L446 832 L704 464 L544 464 Z" fill="${BLACK}"/>
</svg>`.trim();

await mkdir("assets", { recursive: true });

// 1. Icono completo (con fondo).
await sharp(Buffer.from(ICON_SVG))
  .png()
  .toFile("assets/icon-only.png");
console.log("✓ assets/icon-only.png  (1024×1024)");

// 2. Icono solo el dibujo, transparente alrededor (foreground del adaptive icon Android).
await sharp(Buffer.from(ICON_FOREGROUND_SVG))
  .png()
  .toFile("assets/icon-foreground.png");
console.log("✓ assets/icon-foreground.png  (1024×1024)");

// 3. Fondo plano ámbar 1024×1024 (background del adaptive icon).
await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: AMBER },
})
  .png()
  .toFile("assets/icon-background.png");
console.log("✓ assets/icon-background.png  (1024×1024)");

// 4. Splash 2732×2732: fondo negro con el icono centrado (≈ 25% del ancho).
const ICON_FOR_SPLASH = await sharp(Buffer.from(ICON_SVG))
  .resize(680, 680)
  .png()
  .toBuffer();

await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: BLACK },
})
  .composite([{ input: ICON_FOR_SPLASH, gravity: "center" }])
  .png()
  .toFile("assets/splash.png");
console.log("✓ assets/splash.png  (2732×2732)");

// 5. Splash dark — igual que el normal (el brand ya es oscuro).
await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: BLACK },
})
  .composite([{ input: ICON_FOR_SPLASH, gravity: "center" }])
  .png()
  .toFile("assets/splash-dark.png");
console.log("✓ assets/splash-dark.png  (2732×2732)");

console.log("\n✅ Assets generados en /assets. Ahora:");
console.log("   npx @capacitor/assets generate");
