"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function ResetForm({ token, isWelcome }: { token?: string; isWelcome: boolean }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [fullName, setFullName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    fetch(`/api/auth/reset?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        setValid(!!data.valid);
        setFullName(data.fullName || "");
        setEmail(data.email || "");
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (password !== password2) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    if (res.ok) {
      router.push("/fisio");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Error al establecer contraseña");
      setLoading(false);
    }
  }

  if (checking) return <p className="text-center text-sm text-neutral-500 py-4">Comprobando enlace...</p>;

  if (!token || !valid) {
    return (
      <div className="text-center py-4">
        <div className="text-4xl mb-3">⚠️</div>
        <h2 className="font-semibold mb-1">Enlace inválido o caducado</h2>
        <p className="text-sm text-neutral-600 mb-4">
          Pide a tu CEO que te reenvíe la invitación, o usa "¿Olvidaste tu contraseña?" en el login.
        </p>
        <a href="/login" className="text-sm text-blue-600 hover:underline">← Volver al login</a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {fullName && (
        <p className="text-sm text-neutral-600 mb-3">
          Hola <strong>{fullName.split(" ")[0]}</strong>, vas a establecer la contraseña para <span className="font-mono text-xs">{email}</span>.
        </p>
      )}
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Nueva contraseña</label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg outline-none focus:border-neutral-400"
          autoComplete="new-password"
          autoFocus
        />
        <p className="text-[10px] text-neutral-500 mt-1">Mínimo 8 caracteres. Usa el gestor de contraseñas para generar una fuerte.</p>
      </div>
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Repítela</label>
        <input
          type="password"
          required
          minLength={8}
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg outline-none focus:border-neutral-400"
          autoComplete="new-password"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={loading} className="w-full bg-neutral-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-neutral-800 disabled:opacity-50 mt-2">
        {loading ? "Guardando..." : isWelcome ? "Establecer y entrar" : "Restablecer y entrar"}
      </button>
    </form>
  );
}
