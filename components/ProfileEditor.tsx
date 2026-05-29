"use client";

import { useState } from "react";
import { ImageUpload } from "@/components/ImageUpload";

type Initial = {
  fiscalName: string;
  taxId: string;
  fiscalAddress: string;
  iban: string;
  photoUrl: string;
  vatExempt: boolean;
  workSchedule: string;
};

export function ProfileEditor({ fullName, initial }: { fullName: string; initial: Initial }) {
  const [fiscalName, setFiscalName] = useState(initial.fiscalName);
  const [taxId, setTaxId] = useState(initial.taxId);
  const [fiscalAddress, setFiscalAddress] = useState(initial.fiscalAddress);
  const [iban, setIban] = useState(initial.iban);
  const [photoUrl, setPhotoUrl] = useState(initial.photoUrl);
  const [vatExempt, setVatExempt] = useState(initial.vatExempt);
  const [workSchedule, setWorkSchedule] = useState(initial.workSchedule);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fiscalName, taxId, fiscalAddress, iban, photoUrl, vatExempt, workSchedule }),
    });
    if (res.ok) setMsg({ kind: "ok", text: "Guardado ✓" });
    else setMsg({ kind: "err", text: "No se pudo guardar." });
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <h2 className="font-medium text-sm">Foto</h2>
        <ImageUpload value={photoUrl} onChange={setPhotoUrl} hint="Cuadrada, ~400×400 px. Máx 5 MB." />
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="font-medium text-sm">🕒 Horario de trabajo</h2>
          <p className="text-xs text-neutral-500 mt-0.5">Visible para el resto del equipo en la pestaña "Horario equipo".</p>
        </div>
        <textarea
          className="input text-sm"
          rows={2}
          value={workSchedule}
          onChange={(e) => setWorkSchedule(e.target.value)}
          placeholder="Ej: Lunes a Viernes · 9:00 — 14:00 y 16:00 — 19:00"
        />
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium text-sm">Datos fiscales</h2>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Nombre / razón social</label>
          <input className="input text-sm" value={fiscalName} onChange={(e) => setFiscalName(e.target.value)} placeholder={fullName} />
          <p className="text-[11px] text-neutral-400 mt-1">Si lo dejas vacío, se usa tu nombre: {fullName}</p>
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">NIF / DNI</label>
          <input className="input text-sm font-mono uppercase" value={taxId} onChange={(e) => setTaxId(e.target.value.toUpperCase())} placeholder="12345678A" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Dirección fiscal</label>
          <textarea className="input text-sm" rows={2} value={fiscalAddress} onChange={(e) => setFiscalAddress(e.target.value)} placeholder="Calle, nº, CP, ciudad" />
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">IBAN (opcional)</label>
          <input className="input text-sm font-mono" value={iban} onChange={(e) => setIban(e.target.value)} placeholder="ES.." />
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="font-medium text-sm">IVA</h2>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={vatExempt} onChange={(e) => setVatExempt(e.target.checked)} className="w-5 h-5 accent-neutral-900 mt-0.5 flex-shrink-0" />
          <span>
            <span className="font-medium">Exento de IVA (art. 20 Ley 37/1992)</span>
            <span className="block text-xs text-neutral-500 mt-0.5">
              Marcado: la factura sale sin IVA con la nota legal. Sin marcar: se aplica IVA del 21%.
            </span>
          </span>
        </label>
      </section>

      <div className="flex items-center justify-end gap-3">
        {msg && <span className={`text-sm ${msg.kind === "ok" ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</span>}
        <button onClick={save} disabled={saving} className="btn btn-primary text-sm">{saving ? "Guardando..." : "Guardar"}</button>
      </div>
    </div>
  );
}
