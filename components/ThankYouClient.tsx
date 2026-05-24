"use client";

import { useEffect, useState } from "react";

type Phase =
  | "checking"     // polling al backend
  | "ready"        // pago OK, mostrando opciones
  | "creating"     // creando cuenta / sesión
  | "entering"     // redirigiendo a /paciente
  | "error";

type Status = {
  phase: Phase;
  leadName?: string;
  leadEmail?: string;
  message?: string;
};

export function ThankYouClient({ token, sessionId }: { token: string; sessionId: string }) {
  const [status, setStatus] = useState<Status>({ phase: "checking" });
  const [setPasswordOpen, setSetPasswordOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Polling: cada 1.5s comprobar si el pago se ha confirmado
  useEffect(() => {
    if (!token) {
      setStatus({ phase: "error", message: "Link no válido" });
      return;
    }
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 40;

    const poll = async () => {
      if (cancelled) return;
      attempts++;
      try {
        const res = await fetch(`/api/sale/${token}/status`);
        const data = await res.json();
        if (cancelled) return;
        if (data.status === "paid" && data.leadName) {
          setStatus({ phase: "ready", leadName: data.leadName, leadEmail: data.leadEmail });
          return;
        }
        if (attempts >= maxAttempts) {
          setStatus({
            phase: "error",
            message:
              "El pago se está procesando. Si en unos minutos no puedes entrar, escríbenos al WhatsApp.",
          });
          return;
        }
        setTimeout(poll, 1500);
      } catch (e: any) {
        if (cancelled) return;
        if (attempts >= maxAttempts) {
          setStatus({ phase: "error", message: e.message || "Error al verificar el pago" });
          return;
        }
        setTimeout(poll, 1500);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [token]);

  /**
   * Entrar a la app: crea cuenta (sin contraseña) y deja sesión activa.
   */
  async function enterApp(passwordToSet?: string) {
    setStatus((s) => ({ ...s, phase: "creating" }));
    try {
      const res = await fetch(`/api/sale/${token}/create-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordToSet || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus((s) => ({ ...s, phase: "ready", message: data.error }));
        return;
      }
      setStatus((s) => ({ ...s, phase: "entering" }));
      setTimeout(() => {
        window.location.href = `/paciente/${data.patientId}`;
      }, 800);
    } catch (e: any) {
      setStatus((s) => ({ ...s, phase: "ready", message: e.message || "Error" }));
    }
  }

  async function saveAndEnter() {
    if (password.length < 8) {
      alert("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (password !== passwordConfirm) {
      alert("Las contraseñas no coinciden");
      return;
    }
    setSavingPassword(true);
    await enterApp(password);
  }

  return (
    <div
      className="min-h-screen w-full"
      style={{
        backgroundColor: "#0A0A0A",
        backgroundImage: "url('/box.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="min-h-screen w-full" style={{ background: "rgba(10, 10, 10, 0.82)" }}>
        <div className="max-w-md mx-auto px-4 py-12 sm:py-16">
          {/* Checking pago */}
          {status.phase === "checking" && (
            <div
              className="rounded-2xl p-8 text-center"
              style={{ background: "rgba(20, 20, 20, 0.85)", border: "1px solid #262626", backdropFilter: "blur(8px)" }}
            >
              <div className="mb-4 flex justify-center">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center animate-pulse"
                  style={{ background: "rgba(255, 212, 0, 0.15)" }}
                >
                  <span className="text-2xl">⚡</span>
                </div>
              </div>
              <h1 className="text-xl font-bold mb-2 tracking-tight" style={{ color: "#FAFAFA" }}>
                Confirmando tu pago...
              </h1>
              <p className="text-sm" style={{ color: "#A3A3A3" }}>
                Solo unos segundos. No cierres esta ventana.
              </p>
            </div>
          )}

          {/* Ready: pago OK, opciones */}
          {status.phase === "ready" && !setPasswordOpen && (
            <>
              <div className="text-center mb-6">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ background: "rgba(34, 197, 94, 0.15)", border: "1px solid #16A34A" }}
                >
                  <span className="text-2xl">✓</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold mb-2 tracking-tight" style={{ color: "#FAFAFA" }}>
                  ¡Gracias, {(status.leadName || "").split(" ")[0]}!
                </h1>
                <p className="text-sm" style={{ color: "#A3A3A3" }}>
                  Tu pago se ha completado correctamente.
                </p>
              </div>

              <div
                className="rounded-2xl p-6 mb-3"
                style={{ background: "rgba(20, 20, 20, 0.85)", border: "1px solid #262626", backdropFilter: "blur(8px)" }}
              >
                <p className="text-sm mb-4" style={{ color: "#D4D4D4" }}>
                  Tu cuenta está lista. Entra a la app para empezar tu programa.
                </p>

                <button
                  onClick={() => enterApp()}
                  className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-tight transition-all hover:opacity-90"
                  style={{ background: "#FFD400", color: "#0A0A0A" }}
                >
                  Entrar a la app →
                </button>

                <button
                  onClick={() => setSetPasswordOpen(true)}
                  className="w-full mt-3 py-2.5 rounded-xl text-xs font-medium tracking-tight transition-all hover:bg-neutral-800"
                  style={{ background: "transparent", color: "#A3A3A3", border: "1px solid #404040" }}
                >
                  Crear contraseña antes de entrar (opcional)
                </button>
              </div>

              <p className="text-[11px] text-center" style={{ color: "#525252" }}>
                Para futuros accesos te enviaremos un código por email. La contraseña sirve como respaldo.
              </p>
            </>
          )}

          {/* Formulario crear contraseña */}
          {status.phase === "ready" && setPasswordOpen && (
            <>
              <div className="text-center mb-6">
                <h1 className="text-xl font-bold mb-1 tracking-tight" style={{ color: "#FAFAFA" }}>
                  Crear contraseña
                </h1>
                <p className="text-sm" style={{ color: "#A3A3A3" }}>
                  Servirá como respaldo si pierdes el acceso al email.
                </p>
              </div>

              <div
                className="rounded-2xl p-6 mb-4"
                style={{ background: "rgba(20, 20, 20, 0.85)", border: "1px solid #262626", backdropFilter: "blur(8px)" }}
              >
                <div className="space-y-4">
                  <div>
                    <label className="text-xs block mb-1.5 uppercase tracking-wider" style={{ color: "#A3A3A3" }}>
                      Email
                    </label>
                    <input
                      type="email"
                      value={status.leadEmail || ""}
                      disabled
                      className="w-full px-3 py-2.5 rounded-lg text-sm"
                      style={{ background: "#1F1F1F", border: "1px solid #262626", color: "#737373" }}
                    />
                  </div>
                  <div>
                    <label className="text-xs block mb-1.5 uppercase tracking-wider" style={{ color: "#A3A3A3" }}>
                      Contraseña (mínimo 8 caracteres)
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg text-sm pr-12"
                        style={{ background: "#1F1F1F", border: "1px solid #404040", color: "#FAFAFA" }}
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1"
                        style={{ color: "#A3A3A3" }}
                      >
                        {showPassword ? "Ocultar" : "Ver"}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs block mb-1.5 uppercase tracking-wider" style={{ color: "#A3A3A3" }}>
                      Repite contraseña
                    </label>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg text-sm"
                      style={{ background: "#1F1F1F", border: "1px solid #404040", color: "#FAFAFA" }}
                      placeholder="••••••••"
                    />
                  </div>
                  <button
                    onClick={saveAndEnter}
                    disabled={savingPassword || !password || !passwordConfirm}
                    className="w-full py-3 rounded-xl text-sm font-semibold mt-2 transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "#FFD400", color: "#0A0A0A" }}
                  >
                    {savingPassword ? "Guardando..." : "Guardar contraseña y entrar →"}
                  </button>
                  <button
                    onClick={() => setSetPasswordOpen(false)}
                    className="w-full py-2.5 rounded-xl text-xs"
                    style={{ background: "transparent", color: "#A3A3A3" }}
                  >
                    ← Volver
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Creating */}
          {status.phase === "creating" && (
            <div
              className="rounded-2xl p-8 text-center"
              style={{ background: "rgba(20, 20, 20, 0.85)", border: "1px solid #262626", backdropFilter: "blur(8px)" }}
            >
              <p className="text-sm" style={{ color: "#A3A3A3" }}>
                Preparando tu cuenta...
              </p>
            </div>
          )}

          {/* Entering */}
          {status.phase === "entering" && (
            <div
              className="rounded-2xl p-8 text-center"
              style={{ background: "rgba(20, 20, 20, 0.85)", border: "1px solid #16A34A", backdropFilter: "blur(8px)" }}
            >
              <h1 className="text-xl font-bold mb-2 tracking-tight" style={{ color: "#FAFAFA" }}>
                ¡Listo!
              </h1>
              <p className="text-sm" style={{ color: "#A3A3A3" }}>
                Redirigiendo a tu app...
              </p>
            </div>
          )}

          {/* Error */}
          {status.phase === "error" && (
            <div
              className="rounded-2xl p-6 text-center"
              style={{ background: "rgba(127, 29, 29, 0.25)", border: "1px solid #7F1D1D", backdropFilter: "blur(8px)" }}
            >
              <p className="text-sm" style={{ color: "#FCA5A5" }}>
                {status.message}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
