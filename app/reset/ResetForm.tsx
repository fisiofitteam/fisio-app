"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FieldLabel, fieldInputStyle, primaryButtonStyle } from "@/components/PublicShell";

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

  if (checking) {
    return (
      <p className="text-center text-sm py-2" style={{ color: "#737373" }}>
        Comprobando enlace...
      </p>
    );
  }

  if (!token || !valid) {
    return (
      <div className="text-center py-2">
        <div className="text-4xl mb-3">⚠️</div>
        <h3 className="font-semibold mb-1" style={{ letterSpacing: "-0.02em" }}>
          Enlace inválido o caducado
        </h3>
        <p className="text-sm mb-5" style={{ color: "#737373" }}>
          Pide a tu CEO que te reenvíe la invitación, o usa "¿Olvidaste tu contraseña?" en el login.
        </p>
        <a href="/login" className="text-sm hover:underline" style={{ color: "#0A0A0A", fontWeight: 600 }}>
          ← Volver al login
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {fullName && (
        <p className="text-sm mb-2" style={{ color: "#525252" }}>
          Hola <strong style={{ color: "#0A0A0A" }}>{fullName.split(" ")[0]}</strong>, vas a establecer la contraseña
          para <span className="font-mono text-xs">{email}</span>.
        </p>
      )}
      <div>
        <FieldLabel>{isWelcome ? "Tu nueva contraseña" : "Nueva contraseña"}</FieldLabel>
        <input
          type="password"
          required
          minLength={8}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={fieldInputStyle}
          autoComplete="new-password"
          autoFocus
        />
        <p className="text-[10px] mt-1.5" style={{ color: "#737373" }}>
          Mínimo 8 caracteres. Usa el gestor de contraseñas para generar una fuerte y guardarla.
        </p>
      </div>
      <div>
        <FieldLabel>Repítela</FieldLabel>
        <input
          type="password"
          required
          minLength={8}
          placeholder="••••••••"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          style={fieldInputStyle}
          autoComplete="new-password"
        />
      </div>
      {error && <p className="text-sm" style={{ color: "#DC2626" }}>{error}</p>}
      <button type="submit" disabled={loading} style={{ ...primaryButtonStyle, marginTop: 14, opacity: loading ? 0.5 : 1 }}>
        {loading ? "Guardando..." : isWelcome ? "Establecer y entrar →" : "Restablecer y entrar →"}
      </button>
    </form>
  );
}
