"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldLabel, fieldInputStyle, primaryButtonStyle } from "@/components/PublicShell";

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      // El backend puede devolver redirect (p.ej. fallback demo paciente).
      const data = await res.json().catch(() => ({}));
      router.push(data?.redirect || redirectTo || "/fisio");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Error al iniciar sesión");
      setLoading(false);
    }
  }

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setForgotSent(true);
    setLoading(false);
  }

  if (forgotMode) {
    if (forgotSent) {
      return (
        <div className="text-center py-2">
          <div className="text-4xl mb-3">📬</div>
          <h3 className="font-semibold mb-1" style={{ letterSpacing: "-0.02em" }}>
            Email enviado
          </h3>
          <p className="text-sm mb-5" style={{ color: "#737373" }}>
            Si tu email está registrado, recibirás en un minuto un enlace para restablecer tu contraseña.
          </p>
          <button
            onClick={() => {
              setForgotMode(false);
              setForgotSent(false);
            }}
            className="text-sm hover:underline"
            style={{ color: "#0A0A0A" }}
          >
            ← Volver al login
          </button>
        </div>
      );
    }

    return (
      <form onSubmit={requestReset} className="space-y-3">
        <p className="text-sm mb-4" style={{ color: "#525252" }}>
          Te enviaremos un enlace por email para que la cambies.
        </p>
        <div>
          <FieldLabel>Correo</FieldLabel>
          <input
            type="email"
            required
            placeholder="tu@fisiofitteam.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={fieldInputStyle}
            autoFocus
            autoComplete="email"
          />
        </div>
        {error && <p className="text-sm" style={{ color: "#DC2626" }}>{error}</p>}
        <button type="submit" disabled={loading || !email} style={{ ...primaryButtonStyle, marginTop: 6, opacity: loading || !email ? 0.5 : 1 }}>
          {loading ? "Enviando..." : "Enviar enlace"}
        </button>
        <button
          type="button"
          onClick={() => setForgotMode(false)}
          className="block w-full text-sm hover:underline"
          style={{ color: "#737373", paddingTop: 4 }}
        >
          ← Volver al login
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <FieldLabel>Correo</FieldLabel>
        <input
          type="email"
          required
          placeholder="tu@fisiofitteam.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={fieldInputStyle}
          autoComplete="email"
          autoFocus
        />
      </div>
      <div>
        <div className="flex justify-between items-baseline mb-1.5">
          <FieldLabel>Contraseña</FieldLabel>
          <button
            type="button"
            onClick={() => setForgotMode(true)}
            className="text-[11px] hover:underline"
            style={{ color: "#525252", marginBottom: 6 }}
          >
            ¿La olvidaste?
          </button>
        </div>
        <input
          type="password"
          required
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={fieldInputStyle}
          autoComplete="current-password"
        />
      </div>
      {error && <p className="text-sm" style={{ color: "#DC2626" }}>{error}</p>}
      <button type="submit" disabled={loading} style={{ ...primaryButtonStyle, marginTop: 14, opacity: loading ? 0.5 : 1 }}>
        {loading ? "Entrando..." : "Entrar →"}
      </button>
    </form>
  );
}
