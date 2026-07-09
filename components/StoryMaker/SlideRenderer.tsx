"use client";

import { BRAND, FORMAT_DIMS, type Slide, type StoryFormat } from "./types";

/**
 * Renderiza UN slide en el formato indicado aplicando su estilo.
 *
 * Filosofía: cada estilo tiene su propio "layout mental" (marca-base = hero
 * grande centrado, luxury = cita en italic serif, bento = grid, magazine =
 * revista, flashcard = un solo mensaje). No hay layers editables tipo
 * Fabric.js — el editor cambia los CAMPOS y el estilo redistribuye.
 *
 * Todos los estilos comparten la paleta FisioFit (dark + amarillo) para
 * mantener coherencia de marca aunque el layout cambie.
 *
 * V2: soporta también aspecto 4:5 (carrusel feed). Los layouts internos
 * se apoyan en el flex/grid del canvas — como no dependen de posiciones
 * absolutas al pixel, la mayoría se adapta automáticamente al cambio de
 * aspecto. Solo ajusto padding un pelín para 4:5 (más apretado).
 */
export function SlideRenderer({
  slide,
  scale = 1,
  handle,
  format = "story-9x16",
  index,
  total,
}: {
  slide: Slide;
  scale?: number;
  handle?: string;
  format?: StoryFormat;
  index?: number;   // 0-based, para la numeración N/M en carruseles
  total?: number;
}) {
  const { w: W, h: H } = FORMAT_DIMS[format];
  const showCounter = format === "carousel-4x5" && typeof index === "number" && typeof total === "number" && total > 1;
  return (
    <div
      style={{
        width: W * scale,
        height: H * scale,
        position: "relative",
        overflow: "hidden",
        borderRadius: 12 * scale,
        boxShadow: `0 6px 20px -6px rgba(0,0,0,0.5)`,
      }}
    >
      <div
        style={{
          width: W,
          height: H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          position: "absolute",
          top: 0,
          left: 0,
          background: BRAND.bg,
          color: BRAND.ink,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
        }}
      >
        <StyleLayer slide={slide} format={format} />
        {handle && (
          <div
            style={{
              position: "absolute",
              bottom: 40,
              right: 44,
              fontSize: 22,
              letterSpacing: "0.05em",
              color: BRAND.inkFaint,
              fontWeight: 500,
            }}
          >
            {handle}
          </div>
        )}
        {showCounter && (
          <div
            style={{
              position: "absolute",
              top: 40,
              right: 44,
              padding: "10px 20px",
              borderRadius: 999,
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(8px)",
              fontSize: 24,
              fontWeight: 700,
              color: BRAND.ink,
              letterSpacing: "0.05em",
            }}
          >
            {(index as number) + 1}/{total}
          </div>
        )}
      </div>
    </div>
  );
}

function StyleLayer({ slide, format }: { slide: Slide; format: StoryFormat }) {
  switch (slide.styleKey) {
    case "luxury":
      return <StyleLuxury slide={slide} format={format} />;
    case "bento":
      return <StyleBento slide={slide} format={format} />;
    case "magazine":
      return <StyleMagazine slide={slide} format={format} />;
    case "flashcard":
      return <StyleFlashcard slide={slide} format={format} />;
    case "marca-base":
    default:
      return <StyleMarcaBase slide={slide} format={format} />;
  }
}

// Padding lateral y vertical según formato. 4:5 es más cuadrado → menos
// altura, así que apretamos verticalmente para que quepa lo mismo sin
// romper la composición.
function paddingFor(format: StoryFormat, base: { x: number; y: number }): string {
  const scaleY = format === "carousel-4x5" ? 0.65 : 1;
  return `${Math.round(base.y * scaleY)}px ${base.x}px`;
}

// ═════════════════════════════════════════════════════════════════════════
// Estilos concretos. Cada uno pinta el interior del canvas 1080×1920.
// La foto de fondo (bgUrl) se aplica como overlay bajo un tinte oscuro.
// ═════════════════════════════════════════════════════════════════════════

function BgLayer({ url, tint = 0.65 }: { url: string; tint?: number }) {
  if (!url) return null;
  return (
    <>
      <img
        src={url}
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `rgba(10,10,10,${tint})`,
        }}
      />
    </>
  );
}

// ─── marca-base ───────────────────────────────────────────────────────────
// Hero grande centrado con badge amarillo, título masivo y CTA gradient.
function StyleMarcaBase({ slide, format }: { slide: Slide; format: StoryFormat }) {
  return (
    <>
      <BgLayer url={slide.bgUrl} tint={0.72} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: paddingFor(format, { x: 100, y: 80 }),
          textAlign: "center",
        }}
      >
        {slide.subtitle && (
          <div
            style={{
              display: "inline-block",
              padding: "14px 28px",
              borderRadius: 999,
              background: `${BRAND.primary}22`,
              border: `1px solid ${BRAND.primary}55`,
              color: BRAND.primary,
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              marginBottom: 40,
            }}
          >
            {slide.subtitle}
          </div>
        )}
        <div
          style={{
            fontSize: slide.title.length > 40 ? 110 : 150,
            fontWeight: 900,
            lineHeight: 1.0,
            letterSpacing: "-0.035em",
            marginBottom: slide.body ? 40 : 60,
            whiteSpace: "pre-line",
          }}
        >
          {slide.title}
        </div>
        {slide.body && (
          <div
            style={{
              fontSize: 40,
              lineHeight: 1.4,
              color: BRAND.inkDim,
              maxWidth: 880,
              whiteSpace: "pre-line",
            }}
          >
            {slide.body}
          </div>
        )}
        {slide.cta && (
          <div
            style={{
              marginTop: 80,
              padding: "26px 56px",
              borderRadius: 20,
              background: `linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.primaryDark} 100%)`,
              color: "#1F2937",
              fontSize: 44,
              fontWeight: 800,
              letterSpacing: "-0.01em",
              boxShadow: `0 20px 60px -20px ${BRAND.primaryDark}`,
            }}
          >
            {slide.cta} →
          </div>
        )}
      </div>
    </>
  );
}

// ─── luxury ───────────────────────────────────────────────────────────────
// Cita editorial en italic serif + atribución minúscula abajo.
function StyleLuxury({ slide, format }: { slide: Slide; format: StoryFormat }) {
  return (
    <>
      <BgLayer url={slide.bgUrl} tint={0.78} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: paddingFor(format, { x: 100, y: 120 }),
        }}
      >
        <div
          style={{
            fontSize: 220,
            color: BRAND.primary,
            lineHeight: 0.5,
            marginBottom: 30,
            fontFamily: "'Cormorant Garamond', Georgia, serif",
          }}
        >
          "
        </div>
        <div
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: "italic",
            fontSize: slide.title.length > 60 ? 82 : 100,
            fontWeight: 500,
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
            color: BRAND.ink,
            whiteSpace: "pre-line",
          }}
        >
          {slide.title}
        </div>
        {slide.attribution && (
          <div
            style={{
              marginTop: 80,
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: BRAND.primary,
              borderLeft: `4px solid ${BRAND.primary}`,
              paddingLeft: 24,
            }}
          >
            {slide.attribution}
          </div>
        )}
      </div>
    </>
  );
}

// ─── bento ────────────────────────────────────────────────────────────────
// Grid 2×2 de "celdas KPI". Divide el body en líneas para 2-4 celdas.
function StyleBento({ slide, format }: { slide: Slide; format: StoryFormat }) {
  // Cada línea de `body` = una celda. Formato esperado: "NÚMERO | descripción".
  const cells = slide.body
    .split("\n")
    .map((raw) => {
      const [big, ...rest] = raw.split("|");
      return { big: (big ?? "").trim(), desc: rest.join("|").trim() };
    })
    .filter((c) => c.big);
  const cols = cells.length >= 4 ? 2 : cells.length === 3 ? 3 : cells.length === 2 ? 2 : 1;
  const rows = cells.length >= 4 ? 2 : 1;

  return (
    <>
      <BgLayer url={slide.bgUrl} tint={0.8} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: paddingFor(format, { x: 90, y: 100 }),
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: BRAND.primary,
            marginBottom: 20,
          }}
        >
          {slide.subtitle || "Los números"}
        </div>
        <div
          style={{
            fontSize: 82,
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            marginBottom: 60,
            whiteSpace: "pre-line",
          }}
        >
          {slide.title}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
            gap: 24,
            flex: 1,
          }}
        >
          {cells.map((c, i) => (
            <div
              key={i}
              style={{
                background: BRAND.surface,
                border: `1px solid ${BRAND.border}`,
                borderRadius: 32,
                padding: 40,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                backdropFilter: "blur(8px)",
              }}
            >
              <div
                style={{
                  fontSize: 130,
                  fontWeight: 900,
                  letterSpacing: "-0.04em",
                  color: BRAND.primary,
                  lineHeight: 1.0,
                }}
              >
                {c.big}
              </div>
              <div style={{ fontSize: 32, color: BRAND.inkDim, lineHeight: 1.3 }}>
                {c.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── magazine ─────────────────────────────────────────────────────────────
// Título gigante ocupando arriba + cuerpo justificado abajo.
function StyleMagazine({ slide, format }: { slide: Slide; format: StoryFormat }) {
  return (
    <>
      <BgLayer url={slide.bgUrl} tint={0.8} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: paddingFor(format, { x: 90, y: 100 }),
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: BRAND.primary,
              marginBottom: 40,
              borderTop: `2px solid ${BRAND.primary}`,
              paddingTop: 20,
            }}
          >
            {slide.subtitle || "FisioFit Team · Lección"}
          </div>
          <div
            style={{
              fontSize: slide.title.length > 30 ? 160 : 200,
              fontWeight: 900,
              lineHeight: 0.9,
              letterSpacing: "-0.045em",
              whiteSpace: "pre-line",
            }}
          >
            {slide.title}
          </div>
        </div>
        <div
          style={{
            fontSize: 38,
            lineHeight: 1.5,
            color: BRAND.inkDim,
            textAlign: "justify",
            whiteSpace: "pre-line",
          }}
        >
          {slide.body}
        </div>
      </div>
    </>
  );
}

// ─── flashcard ────────────────────────────────────────────────────────────
// Un solo mensaje centrado, mucho aire, marca abajo.
function StyleFlashcard({ slide, format }: { slide: Slide; format: StoryFormat }) {
  return (
    <>
      <BgLayer url={slide.bgUrl} tint={0.75} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: paddingFor(format, { x: 120, y: 80 }),
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 60,
            height: 6,
            background: BRAND.primary,
            marginBottom: 60,
            borderRadius: 999,
          }}
        />
        <div
          style={{
            fontSize: slide.title.length > 30 ? 130 : 170,
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: "-0.04em",
            whiteSpace: "pre-line",
          }}
        >
          {slide.title}
        </div>
        {slide.cta && (
          <div
            style={{
              marginTop: 100,
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: BRAND.primary,
            }}
          >
            {slide.cta}
          </div>
        )}
      </div>
    </>
  );
}
