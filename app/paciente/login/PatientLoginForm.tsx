"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
        <div className="text-center mb-3">
          <div className="text-3xl mb-2">📬</div>
          <p className="text-sm font-medium">Te hemos enviado un código</p>
          <p className="text-xs text-neutral-500 mt-1">A <span className="font-mono">{email}</span></p>
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Código de 6 dígitos</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-full px-3 py-3 border border-neutral-200 rounded-lg outline-none focus:border-neutral-400 text-2xl text-center font-mono tracking-widest"
            autoFocus
            autoComplete="one-time-code"
          />
        </div>
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
        <button type="submit" disabled={loading || code.length !== 6} className="w-full bg-neutral-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-neutral-800 disabled:opacity-50">
          {loading ? "Comprobando..." : "Entrar"}
        </button>
        <button type="button" onClick={() => { setStep("email"); setCode(""); setError(""); }} className="w-full text-xs text-neutral-500 hover:text-neutral-900">
          ← Usar otro email
        </button>
        <p className="text-[10px] text-neutral-400 text-center pt-2">
          El código caduca en 10 minutos. Revisa también tu carpeta de spam.
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={requestCode} className="space-y-3">
      <div>
        <label className="text-xs text-neutral-500 block mb-1">Tu email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg outline-none focus:border-neutral-400"
          autoComplete="email"
          autoFocus
          placeholder="atleta@email.com"
        />
        <p className="text-[10px] text-neutral-500 mt-1">Te enviaremos un código para entrar. Sin contraseñas.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={loading || !email} className="w-full bg-neutral-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-neutral-800 disabled:opacity-50 mt-2">
        {loading ? "Enviando..." : "Enviar código"}
      </button>
    </form>
  );
}
