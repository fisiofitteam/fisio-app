"use client";

// Vídeo pre-llamada (si cambias el vídeo, edita esta constante)
const PRE_CALL_VIDEO_ID = "DnEAQXs09BI";

// Contacto de la marca (canales públicos)
const WHATSAPP_NUMBER = "+34621495367";
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER.replace(/[^0-9]/g, "")}`;
const INSTAGRAM_HANDLE = "fisiofitcross";
const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}`;

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
}: {
  startISO: string | null;
  firstName: string | null;
}) {
  const dateLabel = startISO ? formatDateLong(startISO) : null;

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
        style={{ background: "rgba(10, 10, 10, 0.55)" }}
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
          <h1 className="text-2xl sm:text-3xl font-semibold leading-tight mb-3" style={{ letterSpacing: "-0.02em" }}>
            {firstName ? `Listo, ${firstName}.` : "Reserva confirmada"}
          </h1>
          <p className="text-sm sm:text-base" style={{ color: "#D4D4D4" }}>
            {dateLabel ? (
              <>
                Tu videoconsulta está reservada para el{" "}
                <strong style={{ color: "#FAFAFA" }}>{dateLabel}</strong>.
              </>
            ) : (
              "Tu videoconsulta está reservada."
            )}
          </p>
        </section>

        {/* ━━━ Cómo será tu videoconsulta ━━━ */}
        <section
          className="rounded-2xl p-5 sm:p-6 mb-4"
          style={{ background: "rgba(20, 20, 20, 0.85)", border: "1px solid #262626", backdropFilter: "blur(8px)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span style={{ fontSize: 20 }}>📋</span>
            <h2 className="text-base sm:text-lg font-semibold">Cómo será tu videoconsulta</h2>
          </div>
          <p className="text-sm leading-relaxed mb-3" style={{ color: "#D4D4D4" }}>
            Será una llamada de <strong style={{ color: "#FAFAFA" }}>45-60 minutos</strong>. Un especialista de FisioFit
            te atenderá.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "#A3A3A3" }}>
            Hablaremos para <strong style={{ color: "#FAFAFA" }}>conocer tu problema a fondo</strong> y saber qué
            errores te mantienen en el bucle. Luego te daremos{" "}
            <strong style={{ color: "#FAFAFA" }}>claridad sobre cómo puedes volver a disfrutar de CrossFit sin dolor</strong>.
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
              IMPORTANTE
            </span>
            <h2 className="text-base sm:text-lg font-semibold">Mira esto antes de la llamada</h2>
          </div>
          <p className="text-sm mb-4" style={{ color: "#A3A3A3" }}>
            Hemos preparado un vídeo corto para que llegues a la videoconsulta con todo el contexto. Es la mejor
            forma de aprovechar al máximo nuestra sesión:
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
            <li className="flex items-start gap-2">
              <span style={{ color: "#86EFAC" }}>✓</span>
              <span>Conocerás cómo trabajamos y nuestra metodología</span>
            </li>
            <li className="flex items-start gap-2">
              <span style={{ color: "#86EFAC" }}>✓</span>
              <span>Llegarás con las preguntas correctas</span>
            </li>
            <li className="flex items-start gap-2">
              <span style={{ color: "#86EFAC" }}>✓</span>
              <span>Aprovecharás cada minuto de la videoconsulta</span>
            </li>
          </ul>
        </section>

        {/* ━━━ Cómo prepararte ━━━ */}
        <section
          className="rounded-2xl p-5 sm:p-6 mb-4"
          style={{ background: "rgba(20, 20, 20, 0.85)", border: "1px solid #262626", backdropFilter: "blur(8px)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span style={{ fontSize: 20 }}>📍</span>
            <h2 className="text-base sm:text-lg font-semibold">Cómo prepararte</h2>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "#A3A3A3" }}>
            Busca un <strong style={{ color: "#FAFAFA" }}>sitio tranquilo</strong>, sin distracciones. Evita
            conectarte por la calle o conduciendo:{" "}
            <strong style={{ color: "#FAFAFA" }}>necesitamos toda tu atención</strong> para sacar el máximo
            partido de la llamada.
          </p>
        </section>

        {/* ━━━ Qué pasará antes de la llamada ━━━ */}
        <section
          className="rounded-2xl p-5 sm:p-6 mb-4"
          style={{ background: "rgba(20, 20, 20, 0.85)", border: "1px solid #262626", backdropFilter: "blur(8px)" }}
        >
          <div className="flex items-center gap-2 mb-4">
            <span style={{ fontSize: 20 }}>⏱</span>
            <h2 className="text-base sm:text-lg font-semibold">Qué pasará antes de la llamada</h2>
          </div>

          <ol className="space-y-4 text-sm">
            <li className="flex items-start gap-3">
              <span
                className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
                style={{ background: "#262626", color: "#FAFAFA" }}
              >
                1
              </span>
              <div style={{ color: "#A3A3A3" }}>
                <strong style={{ color: "#FAFAFA" }}>En breve recibirás un mensaje por WhatsApp</strong> para
                presentarte al especialista que te atenderá y resolver cualquier duda inicial.
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span
                className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
                style={{ background: "#262626", color: "#FAFAFA" }}
              >
                2
              </span>
              <div style={{ color: "#A3A3A3" }}>
                <strong style={{ color: "#FAFAFA" }}>24 horas antes de la llamada</strong> te enviaremos un
                recordatorio con el link de Google Meet para conectarte.
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span
                className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
                style={{ background: "#262626", color: "#FAFAFA" }}
              >
                3
              </span>
              <div style={{ color: "#A3A3A3" }}>
                <strong style={{ color: "#FAFAFA" }}>Hablamos a la hora que has reservado.</strong> Solo tienes
                que entrar en el link que te enviaremos por WhatsApp.
              </div>
            </li>
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
            <h2 className="text-base sm:text-lg font-semibold">Política de cancelación</h2>
          </div>
          <p className="text-sm leading-relaxed mb-3" style={{ color: "#D4D4D4" }}>
            Atendemos a un <strong style={{ color: "#FAFAFA" }}>número muy limitado de personas cada semana</strong>.
            Si reservas, comprométete con tu cita.
          </p>
          <p className="text-sm leading-relaxed mb-3" style={{ color: "#D4D4D4" }}>
            <strong style={{ color: "#FAFAFA" }}>Si necesitas cancelar o reprogramar</strong>, avísanos con
            la mayor antelación posible. Liberamos tu hueco para otra persona que también lo está esperando.
          </p>
          <div
            className="rounded-lg p-3 mt-3"
            style={{
              background: "rgba(127, 29, 29, 0.25)",
              border: "1px solid rgba(252, 165, 165, 0.4)",
            }}
          >
            <p className="text-sm leading-relaxed" style={{ color: "#FCA5A5" }}>
              <strong>⚠️ Importante:</strong> si no acudes sin avisar,{" "}
              <strong>no podrás volver a agendar</strong> con nosotros. Nuestro tiempo es limitado y solo
              trabajamos con personas verdaderamente comprometidas con su recuperación.
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
            ¿Te ha surgido un imprevisto o tienes dudas antes de la llamada?
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
