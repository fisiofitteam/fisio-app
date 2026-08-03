"use client";

import { forwardRef, useMemo } from "react";
import type { CarouselSlide } from "@/lib/carousel-maker/types";
import {
  CANVAS_H,
  CANVAS_W,
  FONTS,
  PALETTE,
  tokenizeTitle,
  type SlideLayout,
  type SlideVisual,
} from "@/lib/carousel-maker/visual";

/**
 * Renderiza UN slide del carrusel en tamaño 1080×1350 (canvas real). El
 * `displayScale` reduce el DOM para verlo en pantalla; a la hora de
 * exportar con html-to-image se ignora el scale y se captura el elemento
 * a resolución nativa via width/height.
 */
type Props = {
  slide: CarouselSlide;
  visual: SlideVisual;
  slideIndex: number;
  totalSlides: number;
  displayScale?: number;
};

export const SlideCanvas = forwardRef<HTMLDivElement, Props>(function SlideCanvas(
  { slide, visual, slideIndex, totalSlides, displayScale = 1 },
  ref,
) {
  return (
    <div
      ref={ref}
      style={{
        width: CANVAS_W,
        height: CANVAS_H,
        transform: displayScale !== 1 ? `scale(${displayScale})` : undefined,
        transformOrigin: "top left",
      }}
      className="relative overflow-hidden"
    >
      <SlideInner slide={slide} visual={visual} slideIndex={slideIndex} totalSlides={totalSlides} />
    </div>
  );
});

function SlideInner({ slide, visual, slideIndex, totalSlides }: Omit<Props, "displayScale">) {
  return (
    <div
      style={{
        width: CANVAS_W,
        height: CANVAS_H,
        background: PALETTE.bg,
        color: PALETTE.chalkWhite,
        fontFamily: FONTS.body,
        position: "relative",
      }}
    >
      <GrainOverlay />
      <BrandHeader />
      <SlideNumber index={slideIndex} total={totalSlides} />

      <div style={{ position: "absolute", inset: 0, paddingTop: 180, paddingBottom: 80, paddingLeft: 80, paddingRight: 80 }}>
        {visual.layout === "hook" && <HookLayout slide={slide} visual={visual} />}
        {visual.layout === "hook_photo" && <HookPhotoLayout slide={slide} visual={visual} />}
        {visual.layout === "chips_list" && <ChipsListLayout slide={slide} visual={visual} />}
        {visual.layout === "text_body" && <TextBodyLayout slide={slide} visual={visual} />}
        {visual.layout === "cta_ribbon" && <CtaRibbonLayout slide={slide} visual={visual} />}
      </div>
    </div>
  );
}

// ─────────────────────────── piezas base ──────────────────────────

function GrainOverlay() {
  // Grano/ruido barato: gradiente radial + overlay via SVG data URL con
  // filter turbulence. Se ve sutil pero suficiente para no aplanar el negro.
  const noise = `data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#n)" opacity="0.35"/></svg>',
  )}`;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `url("${noise}")`,
        opacity: 0.08,
        pointerEvents: "none",
        mixBlendMode: "screen",
      }}
    />
  );
}

function BrandHeader() {
  return (
    <div style={{
      position: "absolute",
      top: 60,
      left: 0,
      right: 0,
      textAlign: "center",
      fontFamily: FONTS.display,
      fontSize: 46,
      letterSpacing: 4,
      color: PALETTE.chalkWhite,
    }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span>FISIOF</span>
        <span style={{ color: PALETTE.yellow, fontSize: 52 }}>⚡</span>
        <span>T CROSS</span>
      </span>
    </div>
  );
}

function SlideNumber({ index, total }: { index: number; total: number }) {
  return (
    <div style={{
      position: "absolute",
      top: 60,
      right: 60,
      fontFamily: FONTS.body,
      fontSize: 22,
      color: PALETTE.chalkWhite,
      opacity: 0.6,
      letterSpacing: 1,
    }}>
      {index + 1}/{total}
    </div>
  );
}

function DetailDashes() {
  return (
    <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
      <span style={{ width: 60, height: 4, background: PALETTE.yellow }} />
      <span style={{ width: 20, height: 4, background: PALETTE.yellow }} />
    </div>
  );
}

// ─────────────────────────── layouts ──────────────────────────

function BigTitle({ text, yellowWords, size = 120 }: { text: string; yellowWords?: string[]; size?: number }) {
  const tokens = useMemo(() => tokenizeTitle((text ?? "").toUpperCase(), yellowWords), [text, yellowWords]);
  return (
    <h1 style={{
      fontFamily: FONTS.display,
      fontSize: size,
      lineHeight: 1.0,
      letterSpacing: 1,
      color: PALETTE.chalkWhite,
      margin: 0,
      textShadow: "0 2px 0 rgba(0,0,0,.5)",
      wordBreak: "break-word",
    }}>
      {tokens.map((t, i) => t.break ? <br key={i} /> : (
        <span key={i} style={{ color: t.yellow ? PALETTE.yellow : "inherit" }}>{t.text}</span>
      ))}
    </h1>
  );
}

function HookLayout({ slide, visual }: { slide: CarouselSlide; visual: SlideVisual }) {
  const size = pickTitleSize(slide.title ?? "");
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
      <BigTitle text={slide.title ?? slide.body ?? ""} yellowWords={visual.yellowWords} size={size} />
      {slide.subtitle && (
        <p style={{ fontSize: 34, marginTop: 30, color: PALETTE.white, lineHeight: 1.3, fontWeight: 500 }}>
          {slide.subtitle}
        </p>
      )}
      {slide.body && (
        <p style={{ fontSize: 28, marginTop: 20, color: PALETTE.muted, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
          {slide.body}
        </p>
      )}
      <DetailDashes />
    </div>
  );
}

function HookPhotoLayout({ slide, visual }: { slide: CarouselSlide; visual: SlideVisual }) {
  return (
    <div style={{ display: "flex", gap: 40, height: "100%", alignItems: "center" }}>
      <div style={{ flex: 1 }}>
        <BigTitle text={slide.title ?? ""} yellowWords={visual.yellowWords} size={pickTitleSize(slide.title ?? "") - 20} />
        {slide.subtitle && (
          <p style={{ fontSize: 30, marginTop: 24, color: PALETTE.white, lineHeight: 1.3 }}>{slide.subtitle}</p>
        )}
        <DetailDashes />
      </div>
      <div style={{ width: 380, height: 700, borderRadius: 20, background: "rgba(255,255,255,.05)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONTS.body, color: PALETTE.muted, fontSize: 20 }}>
        {visual.photoUrl
          ? <img src={visual.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 20 }} />
          : "[ foto ]"}
      </div>
    </div>
  );
}

function ChipsListLayout({ slide, visual }: { slide: CarouselSlide; visual: SlideVisual }) {
  // Si el user no ha metido chips a mano, intentamos parsearlos del body:
  // líneas cortas o precedidas por • / - / ✔️.
  const chips = visual.chips ?? autoExtractChips(slide.body ?? "");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <BigTitle text={slide.title ?? ""} yellowWords={visual.yellowWords} size={pickTitleSize(slide.title ?? "") - 30} />
      {slide.subtitle && (
        <p style={{ fontSize: 30, marginTop: 20, color: PALETTE.white, lineHeight: 1.3, fontWeight: 500 }}>
          {slide.subtitle}
        </p>
      )}
      <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: chips.length > 3 ? "1fr 1fr" : "1fr", gap: 16 }}>
        {chips.map((chip, i) => <Chip key={i} icon={chip.icon} label={chip.label} />)}
      </div>
    </div>
  );
}

function Chip({ icon, label }: { icon: string; label: string }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 16,
      padding: "18px 26px",
      border: `2.5px solid ${PALETTE.yellow}`,
      borderRadius: 20,
      background: PALETTE.chipFill,
    }}>
      <div style={{
        width: 54, height: 54, borderRadius: 27,
        background: PALETTE.yellow,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 28, color: PALETTE.bg, fontWeight: 800, flexShrink: 0,
      }}>
        {icon}
      </div>
      <span style={{ fontSize: 30, color: PALETTE.white, fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function TextBodyLayout({ slide, visual }: { slide: CarouselSlide; visual: SlideVisual }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {slide.title && <BigTitle text={slide.title} yellowWords={visual.yellowWords} size={68} />}
      {slide.subtitle && (
        <p style={{ fontSize: 30, marginTop: 20, color: PALETTE.white, lineHeight: 1.35 }}>{slide.subtitle}</p>
      )}
      <div style={{ marginTop: 32, fontSize: 32, color: PALETTE.chalkWhite, lineHeight: 1.5, whiteSpace: "pre-wrap", flex: 1 }}>
        {slide.body}
      </div>
    </div>
  );
}

function CtaRibbonLayout({ slide, visual }: { slide: CarouselSlide; visual: SlideVisual }) {
  const keyword = (visual.ctaKeyword ?? extractCtaKeyword(slide.title ?? "") ?? "HOMBRO").toUpperCase();
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", textAlign: "center" }}>
      <p style={{ fontSize: 52, color: PALETTE.chalkWhite, fontFamily: FONTS.display, letterSpacing: 2 }}>
        ESCRÍBEME
      </p>
      <div style={{
        margin: "20px auto",
        padding: "24px 60px",
        background: PALETTE.yellow,
        color: PALETTE.bg,
        fontFamily: FONTS.display,
        fontSize: 160,
        letterSpacing: 4,
        display: "inline-block",
        transform: "rotate(-1.5deg)",
        boxShadow: "0 6px 0 rgba(0,0,0,.6)",
      }}>
        "{keyword}"
      </div>
      {slide.subtitle || slide.body ? (
        <p style={{ fontSize: 34, color: PALETTE.chalkWhite, marginTop: 30, lineHeight: 1.4, fontWeight: 500 }}>
          {slide.subtitle ?? slide.body}
        </p>
      ) : null}
      <DetailDashes />
    </div>
  );
}

// ─────────────────────────── helpers ──────────────────────────

function pickTitleSize(title: string): number {
  const len = title.replace(/\s+/g, "").length;
  if (len <= 18) return 180;
  if (len <= 30) return 150;
  if (len <= 50) return 120;
  if (len <= 80) return 96;
  return 76;
}

function autoExtractChips(body: string): Array<{ icon: string; label: string }> {
  if (!body) return [];
  const lines = body.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const chips: Array<{ icon: string; label: string }> = [];
  for (const line of lines) {
    // Quitamos bullets / emojis del inicio y usamos primera letra como icono.
    const cleaned = line.replace(/^[•\-–—✔️✅❌🔹🟡🟠🟢👉]+\s*/, "").trim();
    if (!cleaned) continue;
    if (cleaned.length > 40) continue; // no es un chip, es prosa
    chips.push({ icon: cleaned[0].toUpperCase(), label: cleaned });
    if (chips.length >= 6) break;
  }
  return chips;
}

function extractCtaKeyword(title: string): string | null {
  // Palabra entre comillas: "HOMBRO"
  const quoted = title.match(/["'“”]([A-ZÁÉÍÓÚÑ]{3,})["'“”]/);
  if (quoted) return quoted[1];
  // Última palabra en mayúsculas del title.
  const shouts = title.match(/\b[A-ZÁÉÍÓÚÑ]{3,}\b/g);
  if (shouts && shouts.length > 0) return shouts[shouts.length - 1];
  return null;
}
