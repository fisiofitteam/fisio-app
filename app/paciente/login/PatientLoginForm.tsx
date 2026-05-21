"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FieldLabel, fieldInputStyle, primaryButtonStyle } from "@/components/PublicShell";

export function PatientLoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/patient-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      setStep("code");
      setLoading(false);
    } else {
      setError("No hemos podido enviar el código. Vuelve a intentarlo.");
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/patient-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    if (res.ok) {
      const data = await res.json();
      router.push(`/paciente/${data.patientId}`);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Código incorrecto");
      setLoading(false);
    }
  }

  if (step === "code") {
    return (
      <form onSubmit={verifyCode} className="space-y-3">
        <div className="text-center mb-2">
          <div className="text-3xl mb-2">📬</div>
          <p className="text-sm font-medium" style={{ letterSpacing: "-0.01em" }}>
            Te hemos enviado un código
          </p>
          <p className="text-xs mt-1" style={{ color: "#737373" }}>
            A <span className="font-mono">{email}</span>
          </p>
        </div>
        <div>
          <FieldLabel>Código de 6 dígitos</FieldLabel>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            style={{
              ...fieldInputStyle,
              fontSize: 26,
              textAlign: "center",
              fontFamily: "'SF Mono', Menlo, monospace",
              letterSpacing: "0.5em",
              padding: "16px 13px",
            }}
            autoFocus
            autoComplete="one-time-code"
          />
        </div>
        {error && <p className="text-sm text-center" style={{ color: "#DC2626" }}>{error}</p>}
        <button
          type="submit"
          disabled={loading || code.length !== 6}
          style={{ ...primaryButtonStyle, marginTop: 8, opacity: loading || code.length !== 6 ? 0.5 : 1 }}
        >
          {loading ? "Comprobando..." : "Entrar →"}
        </button>
        <button
          type="button"
          onClick={() => {
            setStep("email");
            setCode("");
            setError("");
          }}
          className="block w-full text-xs hover:underline"
          style={{ color: "#737373", paddingTop: 4 }}
        >
          ← Usar otro email
        </button>
        <p className="text-[10px] text-center pt-2" style={{ color: "#A3A3A3" }}>
          El código caduca en 10 minutos. Revisa también tu carpeta de spam.
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={requestCode} className="space-y-3">
      <div>
        <FieldLabel>Tu email</FieldLabel>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={fieldInputStyle}
          autoComplete="email"
          autoFocus
          placeholder="atleta@email.com"
        />
        <p className="text-[10px] mt-1.5" style={{ color: "#737373" }}>
          Te enviaremos un código de 6 dígitos para entrar. Sin contraseñas que recordar.
        </p>
      </div>
      {error && <p className="text-sm" style={{ color: "#DC2626" }}>{error}</p>}
      <button type="submit" disabled={loading || !email} style={{ ...primaryButtonStyle, marginTop: 14, opacity: loading || !email ? 0.5 : 1 }}>
        {loading ? "Enviando..." : "Enviar código →"}
      </button>
    </form>
  );
}
