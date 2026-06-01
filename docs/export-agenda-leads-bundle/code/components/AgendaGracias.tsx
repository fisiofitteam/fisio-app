"use client";

import { applyVars, type AgendaGraciasCopy } from "@/lib/landing-content";

function formatDateLong(iso: string): string {
  const d = new Date(iso);
  const dayName = d.toLocaleDateString("es-ES", { weekday: "long", timeZone: "Europe/Madrid" });
  const day = d.toLocaleDateString("es-ES", { day: "numeric", timeZone: "Europe/Madrid" });
  const month = d.toLocaleDateString("es-ES", { month: "long", timeZone: "Europe/Madrid" });
  const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
  return `${dayName} ${day} de ${month} a las ${time}`;
}

export function AgendaGracias({
  startISO,
  firstName,
  copy,
}: {
  startISO: string | null;
  firstName: string | null;
  copy: AgendaGraciasCopy;
}) {
  const dateLabel = startISO ? formatDateLong(startISO) : null;
  const WHATSAPP_LINK = `https://wa.me/${copy.whatsappNumber.replace(/[^0-9]/g, "")}`;
  const INSTAGRAM_HANDLE = copy.instagramHandle;
  const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}`;
  const PRE_CALL_VIDEO_ID = copy.videoId;

  return (
    <main
      className="min-h-screen relative"
      style={{
        backgroundColor: "#0A0A0A",
        backgroundImage: "url('/box.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        color: "#FAFAFA",
      }}
    >
      {/* Overlay sutil para que la imagen del box se vea con buena legibilidad */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(10, 10, 10, 0.72)" }}
      />

      <div className="relative max-w-2xl mx-auto px-5 py-10 pb-20">
        {/* ━━━ Confirmación inicial ━━━ */}
        <section className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
            style={{ background: "rgba(34, 197, 94, 0.15)", border: "1px solid rgba(34, 197, 94, 0.4)" }}
          >
            <span style={{ fontSize: 32 }}>✓</span>
          </div>
          <h1
            className="font-bold leading-none mb-4"
            style={{
              fontSize: "clamp(32px, 5vw, 48px)",
              letterSpacing: "-0.035em",
            }}
          >
            {firstName ? applyVars(copy.heroTitleWithName, { nombre: firstName }) : copy.heroTitleNoName}
          </h1>
          <p className="text-sm sm:text-base" style={{ color: "#D4D4D4" }}>
            {dateLabel ? applyVars(copy.reservedWithDate, { fecha: dateLabel }) : copy.reservedNoDate}
          </p>
        </section>

        {/* ━━━ Cómo será tu videoconsulta ━━━ */}
        <section
          className="rounded-2xl p-5 sm:p-6 mb-4"
          style={{ background: "rgba(20, 20, 20, 0.85)", border: "1px solid #262626", backdropFilter: "blur(8px)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span style={{ fontSize: 20 }}>📋</span>
            <h2 className="text-base sm:text-lg font-semibold">{copy.callTitle}</h2>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#D4D4D4" }}>
            {copy.callText}
          </p>
        </section>

        {/* ━━━ Vídeo pre-llamada (MOVIDO ARRIBA) ━━━ */}
        <section
          className="rounded-2xl p-5 sm:p-6 mb-4"
          style={{ background: "rgba(20, 20, 20, 0.85)", border: "1px solid #262626", backdropFilter: "blur(8px)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span
              className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded"
              style={{ background: "#FCD34D", color: "#78350F" }}
            >
              {copy.videoBadge}
            </span>
            <h2 className="text-base sm:text-lg font-semibold">{copy.videoTitle}</h2>
          </div>
          <p className="text-sm mb-4" style={{ color: "#A3A3A3" }}>
            {copy.videoIntro}
          </p>
          <div
            className="rounded-lg overflow-hidden mb-4"
            style={{ aspectRatio: "16/9", background: "#000" }}
          >
            <iframe
              src={`https://www.youtube.com/embed/${PRE_CALL_VIDEO_ID}?rel=0`}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <ul className="space-y-1.5 text-sm" style={{ color: "#A3A3A3" }}>
            {copy.videoBullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <span style={{ color: "#86EFAC" }}>✓</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ━━━ Cómo prepararte ━━━ */}
        <section
          className="rounded-2xl p-5 sm:p-6 mb-4"
          style={{ background: "rgba(20, 20, 20, 0.85)", border: "1px solid #262626", backdropFilter: "blur(8px)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span style={{ fontSize: 20 }}>📍</span>
            <h2 className="text-base sm:text-lg font-semibold">{copy.prepTitle}</h2>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#A3A3A3" }}>
            {copy.prepText}
          </p>
        </section>

        {/* ━━━ Qué pasará antes de la llamada ━━━ */}
        <section
          className="rounded-2xl p-5 sm:p-6 mb-4"
          style={{ background: "rgba(20, 20, 20, 0.85)", border: "1px solid #262626", backdropFilter: "blur(8px)" }}
        >
          <div className="flex items-center gap-2 mb-4">
            <span style={{ fontSize: 20 }}>⏱</span>
            <h2 className="text-base sm:text-lg font-semibold">{copy.stepsTitle}</h2>
          </div>

          <ol className="space-y-4 text-sm">
            {copy.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
                  style={{ background: "#262626", color: "#FAFAFA" }}
                >
                  {i + 1}
                </span>
                <div className="whitespace-pre-line" style={{ color: "#A3A3A3" }}>{s}</div>
              </li>
            ))}
          </ol>
        </section>

        {/* ━━━ Política de cancelación ━━━ */}
        <section
          className="rounded-2xl p-5 sm:p-6 mb-4"
          style={{
            background: "rgba(127, 29, 29, 0.15)",
            border: "1px solid rgba(252, 165, 165, 0.25)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span style={{ fontSize: 20 }}>🚫</span>
            <h2 className="text-base sm:text-lg font-semibold">{copy.policyTitle}</h2>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#D4D4D4" }}>
            {copy.policyText}
          </p>
          <div
            className="rounded-lg p-3 mt-3"
            style={{
              background: "rgba(127, 29, 29, 0.25)",
              border: "1px solid rgba(252, 165, 165, 0.4)",
            }}
          >
            <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#FCA5A5" }}>
              {copy.policyWarning}
            </p>
          </div>
        </section>

        {/* ━━━ Contacto / reprogramar ━━━ */}
        <section
          className="rounded-2xl p-5 text-sm"
          style={{
            background: "rgba(20, 20, 20, 0.7)",
            border: "1px solid #262626",
            backdropFilter: "blur(8px)",
          }}
        >
          <p className="text-center mb-4" style={{ color: "#A3A3A3" }}>
            {copy.contactText}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center text-sm font-semibold rounded-lg px-4 py-2.5 flex items-center justify-center gap-2"
              style={{ background: "#25D366", color: "#0A0A0A" }}
            >
              <span style={{ fontSize: 16 }}>💬</span> Escríbenos por WhatsApp
            </a>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center text-sm rounded-lg px-4 py-2.5 flex items-center justify-center gap-2"
              style={{
                background: "rgba(31, 31, 31, 0.7)",
                border: "1px solid #404040",
                color: "#D4D4D4",
              }}
            >
              <span style={{ fontSize: 16 }}>📷</span> @{INSTAGRAM_HANDLE}
            </a>
          </div>
        </section>

        <footer className="mt-10 text-center text-xs" style={{ color: "#737373" }}>
          FisioFit Team · Readaptación deportiva online · {new Date().getFullYear()}
        </footer>
      </div>
    </main>
  );
}
