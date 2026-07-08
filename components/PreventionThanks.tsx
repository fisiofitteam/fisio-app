"use client";

import { useEffect, useState } from "react";

type Status =
  | { kind: "checking" }
  | { kind: "ready"; patientId: string; isNewPatient: boolean; sessionToken: string | null }
  | { kind: "pending" }
  | { kind: "error"; message: string };

/**
 * Página de retorno del checkout de Stripe. Llama a /api/prevention/confirm
 * con el session_id que viene en la URL, hace poll si Stripe todavía no
 * ha marcado la sesión como "complete", y muestra el estado.
 *
 * Si el paciente es nuevo, guardamos el session token que devuelve la API
 * en una cookie del navegador para que al pulsar "Entrar a mi app" ya esté
 * autenticado. Reusamos la cookie `fisio-session` que ya usa la app.
 */
export function PreventionThanks({ sessionId }: { sessionId: string | null }) {
  const [status, setStatus] = useState<Status>({ kind: "checking" });

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
          // Cookie de 90 días. Simple; el helper de auth lo hace de forma
          // más segura en server, pero aquí en public no tenemos httpOnly.
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
    <main className="min-h-screen bg-white text-neutral-900 flex items-center justify-center px-5 py-10">
      <div className="max-w-md w-full text-center">
        {status.kind === "checking" && (
          <>
            <div className="text-4xl mb-4">⏳</div>
            <h1 className="text-2xl font-bold mb-2" style={{ letterSpacing: "-0.02em" }}>
              Estamos activando tu cuenta…
            </h1>
            <p className="text-sm text-neutral-500">
              Un momento — confirmamos tu pago con Stripe y te preparamos el acceso.
            </p>
          </>
        )}

        {status.kind === "pending" && (
          <>
            <div className="text-4xl mb-4">⌛</div>
            <h1 className="text-2xl font-bold mb-2" style={{ letterSpacing: "-0.02em" }}>
              Tu pago está procesándose
            </h1>
            <p className="text-sm text-neutral-500 mb-4">
              Stripe todavía no nos ha confirmado la operación. Suele ir en segundos, pero a veces tarda unos minutos.
              Refresca esta página en un rato o mira tu email — te avisaremos cuando esté todo listo.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm font-medium px-4 py-2 rounded-lg text-white"
              style={{ background: "#0A0A0A" }}
            >
              Refrescar
            </button>
          </>
        )}

        {status.kind === "error" && (
          <>
            <div className="text-4xl mb-4">⚠</div>
            <h1 className="text-2xl font-bold mb-2" style={{ letterSpacing: "-0.02em" }}>
              Algo no salió bien
            </h1>
            <p className="text-sm text-red-600 mb-4">{status.message}</p>
            <a
              href="/prevention"
              className="text-sm font-medium px-4 py-2 rounded-lg text-white inline-block"
              style={{ background: "#0A0A0A" }}
            >
              Volver a la landing
            </a>
          </>
        )}

        {status.kind === "ready" && (
          <>
            <div className="text-5xl mb-4">🎉</div>
            <h1 className="text-3xl font-bold mb-2" style={{ letterSpacing: "-0.025em" }}>
              ¡Bienvenida a Prevention!
            </h1>
            <p className="text-sm text-neutral-600 mb-6 leading-relaxed">
              {status.isNewPatient
                ? "Hemos creado tu cuenta. Tu primer periodo empieza cuando termina tu prueba gratuita — o si ya tenías un programa activo, en cuanto ese termine."
                : "Tu suscripción está activa. Puedes entrar cuando quieras."}
            </p>
            <a
              href={`/paciente/${status.patientId}`}
              className="inline-block text-sm font-semibold px-5 py-3 rounded-xl text-white"
              style={{ background: "linear-gradient(135deg, #10B981 0%, #059669 100%)" }}
            >
              Entrar a mi app →
            </a>
          </>
        )}
      </div>
    </main>
  );
}
