"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
      const data = await res.json();
      // Redirige según rol o al destino solicitado
      router.push(redirectTo || "/fisio");
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
        <div className="text-center py-6">
          <div className="text-4xl mb-3">📬</div>
          <h2 className="font-semibold mb-1">Email enviado</h2>
          <p className="text-sm text-neutral-600 mb-4">
            Si tu email está registrado, recibirás en un minuto un enlace para restablecer tu contraseña.
          </p>
          <button onClick={() => { setForgotMode(false); setForgotSent(false); }} className="text-sm text-blue-600 hover:underline">
            ← Volver al login
          </button>
        </div>
      );
    }

    return (
      <form onSubmit={requestReset} className="space-y-3">
        <h2 className="font-semibold mb-1">Restablecer contraseña</h2>
        <p className="text-sm text-neutral-600 mb-3">Te enviaremos un enlace por email.</p>
        <input
          type="email"
          required
          placeholder="Tu email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg outline-none focus:border-neutral-400"
          autoFocus
          autoComplete="email"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading || !email} className="w-full bg-neutral-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-neutral-800 disabled:opacity-50">
          {loading ? "Enviando..." : "Enviar enlace"}
        </button>
        <button type="button" onClick={() => setForgotMode(false)} className="w-full text-sm text-neutral-500 hover:text-neutral-900">
          ← Volver al login
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg outline-none focus:border-neutral-400"
          autoComplete="email"
          autoFocus
        />
      </div>
      <div>
        <div className="flex justify-between items-baseline mb-1">
          <label className="text-xs text-neutral-500">Contraseña</label>
          <button type="button" onClick={() => setForgotMode(true)} className="text-[11px] text-blue-600 hover:underline">
            ¿Olvidaste?
          </button>
        </div>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg outline-none focus:border-neutral-400"
          autoComplete="current-password"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={loading} className="w-full bg-neutral-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-neutral-800 disabled:opacity-50 mt-2">
        {loading ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
