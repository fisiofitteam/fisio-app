"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function RefreshPatientWeek({ patientId, week }: { patientId: string; week: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const router = useRouter();
  return <div><button className="btn btn-ghost text-xs" disabled={busy} onClick={async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/weekly-reports/patient", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientId, week }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "No se pudo generar");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo generar"); }
    finally { setBusy(false); }
  }}>{busy ? "Actualizando resumen…" : "Actualizar resumen semanal"}</button>
  {error && <p role="alert" className="text-xs text-red-600">{error}</p>}</div>;
}
