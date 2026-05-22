"use client";

// Vídeo pre-llamada (lo dejamos aquí; si cambias el vídeo, edita esta constante)
const PRE_CALL_VIDEO_ID = "DnEAQXs09BI";

function formatDateLong(iso: string): string {
  const d = new Date(iso);
  const dayName = d.toLocaleDateString("es-ES", { weekday: "long" });
  const day = d.getDate();
  const month = d.toLocaleDateString("es-ES", { month: "long" });
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${dayName} ${day} de ${month} a las ${hh}:${mm}`;
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
      className="min-h-screen"
      style={{
        background: "linear-gradient(180deg, #0A0A0A 0%, #0F0F0F 100%)",
        color: "#FAFAFA",
      }}
    >
      <div className="max-w-2xl mx-auto px-5 py-10 pb-20">
        {/* Confirmación */}
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
          <p className="text-sm sm:text-base" style={{ color: "#A3A3A3" }}>
            {dateLabel ? (
              <>
                Tu videoconsulta está reservada para el{" "}
                <strong style={{ color: "#FAFAFA" }}>{dateLabel}</strong>.
              </>
            ) : (
              "Tu videoconsulta está reservada."
            )}
          </p>
          <p className="text-sm mt-2" style={{ color: "#A3A3A3" }}>
            Recibirás un email con el link de Google Meet en unos minutos.
          </p>
        </section>

        {/* Vídeo pre-llamada */}
        <section
          className="rounded-2xl p-5 sm:p-6 mb-6"
          style={{ background: "#141414", border: "1px solid #262626" }}
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
            Hemos preparado un vídeo corto para que llegues a la videoconsulta con todo el contexto. Es la mejor forma
            de aprovechar al máximo nuestra sesión:
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
              <span>Aprovecharás cada minuto de la videoconsulta</span>
            </li>
            <li className="flex items-start gap-2">
              <span style={{ color: "#86EFAC" }}>✓</span>
              <span>Llegarás con las preguntas correctas que necesitas hacer</span>
            </li>
          </ul>
        </section>

        {/* Qué pasa ahora */}
        <section
          className="rounded-2xl p-5 sm:p-6 mb-6"
          style={{ background: "#141414", border: "1px solid #262626" }}
        >
          <h2 className="text-base font-semibold mb-3">¿Qué pasa ahora?</h2>
          <ol className="space-y-3 text-sm" style={{ color: "#A3A3A3" }}>
            <li className="flex items-start gap-3">
              <span
                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                style={{ background: "#262626", color: "#FAFAFA" }}
              >
                1
              </span>
              <span>
                <strong style={{ color: "#FAFAFA" }}>Recibirás un email</strong> con la invitación a Google Calendar y
                el link de Google Meet.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span
                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                style={{ background: "#262626", color: "#FAFAFA" }}
              >
                2
              </span>
              <span>
                <strong style={{ color: "#FAFAFA" }}>Mira el vídeo de arriba</strong> con tranquilidad. Hazlo cuando
                tengas 10 minutos. Será la primera parte de tu proceso.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span
                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                style={{ background: "#262626", color: "#FAFAFA" }}
              >
                3
              </span>
              <span>
                <strong style={{ color: "#FAFAFA" }}>Te llamamos a la hora reservada.</strong> Conecta unos minutos
                antes desde el link del email para que no se te escape nada.
              </span>
            </li>
          </ol>
        </section>

        {/* Reprogramar */}
        <section
          className="rounded-2xl p-4 text-sm text-center"
          style={{ background: "transparent", border: "1px dashed #404040", color: "#A3A3A3" }}
        >
          ¿Te ha surgido un imprevisto?{" "}
          <strong style={{ color: "#FAFAFA" }}>
            Escríbenos por Instagram <a href="https://www.instagram.com/fisiofitteam" target="_blank" rel="noopener noreferrer" className="underline">@fisiofitteam</a>
          </strong>{" "}
          y lo movemos sin problema.
        </section>

        <footer className="mt-10 text-center text-xs" style={{ color: "#525252" }}>
          FisioFit Team · Readaptación deportiva online · {new Date().getFullYear()}
        </footer>
      </div>
    </main>
  );
}
