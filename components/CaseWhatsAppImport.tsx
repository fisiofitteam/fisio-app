"use client";
import { useState } from "react";
export function CaseWhatsAppImport({ patientId, disabled, onBusyChange }: { patientId: string; disabled?: boolean; onBusyChange: (busy: boolean) => void }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  return <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
    <label className="block text-sm font-medium">Añadir conversación de WhatsApp (.txt)
      <input type="file" accept=".txt,text/plain" disabled={disabled || busy} className="block text-xs mt-2 w-full"
        onChange={async e => {
          const file = e.target.files?.[0]; if (!file) return;
          setBusy(true); onBusyChange(true); setStatus("Guardando conversación…");
          try {
            if (!file.name.toLowerCase().endsWith(".txt") || file.size > 1024 * 1024) throw new Error("Selecciona un TXT de hasta 1 MB.");
            const res = await fetch("/api/testimonials", { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ patientId, kind: "whatsapp", name: file.name, textContent: await file.text() }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "No se pudo guardar");
            setStatus("Conversación guardada. Se incluirá al pulsar Generar con IA.");
          } catch (err) { setStatus(err instanceof Error ? err.message : "No se pudo guardar"); }
          finally { setBusy(false); onBusyChange(false); e.target.value = ""; }
        }} />
    </label>
    <p className="text-xs text-neutral-600 mt-2">Exporta el chat sin archivos desde WhatsApp. Se guarda en Éxitos; la IA utiliza la última conversación subida para evitar duplicados.</p>
    {status && <p className="text-xs mt-2" role="status">{status}</p>}
  </div>;
}
