"use client";

import { useEffect, useState } from "react";

type Status =
  | { kind: "checking" }
  | { kind: "ready"; patientId: string; isNewPatient: boolean; sessionToken: string | null }
  | { kind: "pending" }
  | { kind: "error"; message: string };

/**
 * Página de retorno del checkout de Stripe. Look dark box.jpg heredado
 * de la landing pública para mantener coherencia visual.
 *
 * Llama a /api/prevention/confirm con el session_id de la URL, hace poll
 * si Stripe todavía no ha marcado la sesión como "complete", y muestra
 * el estado. Si el paciente es nuevo, guarda el session token en cookie
 * `fisio-session` para que al pulsar "Entrar a mi app" ya esté autenticado.
 */
export function PreventionThanks({
  sessionId,
  brandName,
  brandSuffix,
  brandPrimary,
  brandPrimaryDark,
}: {
  sessionId: string | null;
  brandName: string;
  brandSuffix: string;
  brandPrimary: string;
  brandPrimaryDark: string;
}) {
  const [status, setStatus] = useState<Status>({ kind: "checking" });
  const gradient = `linear-gradient(135deg, ${brandPrimary} 0%, ${brandPrimaryDark} 100%)`;

  useEffect(() => {
    if (!sessionId) {
      setStatus({ kind: "error", message: "Falta el identificador de sesión. Escríbenos si crees que es un error." });
      return;
    }
    let cancelled = false;

    async function confirm(attempt = 0): Promise<void> {
      try {
        const res = await fetch("/api/prevention/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        if (cancelled) return;

        if (res.status === 202) {
          // Aún no listo; reintentamos con backoff hasta 20s
          if (attempt < 8) {
            await new Promise((r) => setTimeout(r, 2500));
            return confirm(attempt + 1);
          }
          setStatus({ kind: "pending" });
          return;
        }
        const d = await res.json();
        if (!res.ok) {
          setStatus({ kind: "error", message: d?.error ?? "Error al confirmar el pago" });
          return;
        }
        // Guardar cookie de sesión si nos la dieron
        if (d.sessionToken) {
          document.cookie = `fisio-session=${d.sessionToken}; Path=/; Max-Age=${90 * 86400}; SameSite=Lax; Secure`;
        }
        setStatus({
          kind: "ready",
          patientId: d.patientId,
          isNewPatient: !!d.isNewPatient,
          sessionToken: d.sessionToken ?? null,
        });
      } catch (e: any) {
        if (cancelled) return;
        setStatus({ kind: "error", message: e?.message ?? "Error de red" });
      }
    }
    confirm();
    return () => { cancelled = true; };
  }, [sessionId]);

  return (
    <main
      className="min-h-screen relative flex items-center justify-center px-5 py-10"
      style={{
        backgroundColor: "#0A0A0A",
        backgroundImage: "url('/box.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        color: "#FAFAFA",
      }}
    >
      {/* Overlay dark para legibilidad */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "rgba(10, 10, 10, 0.78)" }}
      />

      <div className="relative max-w-md w-full">
        {/* Marca arriba, discreta */}
        <div
          className="flex items-center justify-center gap-2 text-sm font-semibold mb-8"
          style={{ letterSpacing: "-0.02em" }}
        >
          <span>🛡</span>
          <span>
            {brandName} <span style={{ color: brandPrimary }}>{brandSuffix}</span>
          </span>
        </div>

        {/* Card central */}
        <div
          className="rounded-2xl p-8 sm:p-10 text-center"
          style={{
            background: "rgba(20, 20, 20, 0.85)",
            border: "1px solid #262626",
            backdropFilter: "blur(8px)",
          }}
        >
          {status.kind === "checking" && (
            <>
              <div className="text-5xl mb-4 animate-pulse">⏳</div>
              <h1
                className="font-bold mb-3"
                style={{ fontSize: "clamp(22px, 3vw, 28px)", letterSpacing: "-0.02em" }}
              >
                Estamos activando tu cuenta…
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: "#A3A3A3" }}>
                Un momento — confirmamos tu pago con Stripe y te preparamos el acceso.
              </p>
            </>
          )}

          {status.kind === "pending" && (
            <>
              <div className="text-5xl mb-4">⌛</div>
              <h1
                className="font-bold mb-3"
                style={{ fontSize: "clamp(22px, 3vw, 28px)", letterSpacing: "-0.02em" }}
              >
                Tu pago está procesándose
              </h1>
              <p className="text-sm leading-relaxed mb-6" style={{ color: "#A3A3A3" }}>
                Stripe todavía no nos ha confirmado la operación. Suele ir en segundos, pero a veces tarda unos minutos.
                Refresca esta página en un rato o mira tu email — te avisaremos cuando esté todo listo.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="text-sm font-semibold px-5 py-2.5 rounded-xl"
                style={{
                  background: "rgba(250, 250, 250, 0.08)",
                  border: "1px solid #333",
                  color: "#FAFAFA",
                }}
              >
                Refrescar
              </button>
            </>
          )}

          {status.kind === "error" && (
            <>
              <div className="text-5xl mb-4">⚠</div>
              <h1
                className="font-bold mb-3"
                style={{ fontSize: "clamp(22px, 3vw, 28px)", letterSpacing: "-0.02em" }}
              >
                Algo no salió bien
              </h1>
              <p className="text-sm mb-6" style={{ color: "#FCA5A5" }}>
                {status.message}
              </p>
              <a
                href="/prevention"
                className="inline-block text-sm font-semibold px-5 py-2.5 rounded-xl"
                style={{
                  background: "rgba(250, 250, 250, 0.08)",
                  border: "1px solid #333",
                  color: "#FAFAFA",
                }}
              >
                Volver a la landing
              </a>
            </>
          )}

          {status.kind === "ready" && (
            <>
              <div className="text-6xl mb-5">🎉</div>
              <h1
                className="font-bold mb-3"
                style={{
                  fontSize: "clamp(28px, 4vw, 36px)",
                  letterSpacing: "-0.025em",
                }}
              >
                ¡Bienvenida a {brandSuffix}!
              </h1>
              <p
                className="text-sm sm:text-base leading-relaxed mb-8"
                style={{ color: "#A3A3A3" }}
              >
                {status.isNewPatient
                  ? "Hemos creado tu cuenta. Tu primer periodo empieza cuando termina tu prueba gratuita — o si ya tenías un programa activo, en cuanto ese termine."
                  : "Tu suscripción está activa. Puedes entrar cuando quieras."}
              </p>
              <a
                href={`/paciente/${status.patientId}`}
                className="inline-block text-sm font-semibold px-6 py-3 rounded-xl text-white transition-transform active:scale-[0.98]"
                style={{
                  background: gradient,
                  boxShadow: `0 10px 25px -8px ${brandPrimary}80`,
                }}
              >
                Entrar a mi app →
              </a>
            </>
          )}
        </div>

        {/* Footer discreto */}
        <div
          className="text-center text-[11px] mt-6"
          style={{ color: "#525252" }}
        >
          Cualquier duda, respóndenos al email de bienvenida.
        </div>
      </div>
    </main>
  );
}
