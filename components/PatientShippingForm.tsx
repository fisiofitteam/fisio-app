"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Shipping = {
  shippingStreet: string | null;
  shippingNumber: string | null;
  shippingFloor: string | null;
  shippingStaircase: string | null;
  shippingDoor: string | null;
  shippingCity: string | null;
  shippingProvince: string | null;
  shippingPostalCode: string | null;
  shippingPhone: string | null;
};

// Formulario de dirección de envío del paciente. Estructurado: calle, número,
// piso, escalera/patio, puerta, población, provincia, CP y teléfono.
export function PatientShippingForm({ initial }: { initial: Shipping }) {
  const router = useRouter();
  const [v, setV] = useState({
    shippingStreet: initial.shippingStreet ?? "",
    shippingNumber: initial.shippingNumber ?? "",
    shippingFloor: initial.shippingFloor ?? "",
    shippingStaircase: initial.shippingStaircase ?? "",
    shippingDoor: initial.shippingDoor ?? "",
    shippingCity: initial.shippingCity ?? "",
    shippingProvince: initial.shippingProvince ?? "",
    shippingPostalCode: initial.shippingPostalCode ?? "",
    shippingPhone: initial.shippingPhone ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function field<K extends keyof typeof v>(k: K, val: string) {
    setV((s) => ({ ...s, [k]: val }));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/patient/shipping", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "No se pudo guardar");
      }
      setMsg({ kind: "ok", text: "Dirección guardada." });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "No se pudo guardar" });
    }
    setSaving(false);
  }

  const required = !!(v.shippingStreet && v.shippingNumber && v.shippingCity && v.shippingPostalCode);

  const labelCls = "text-[11px] block mb-1";
  const labelStyle = { color: "var(--p-text-dim)" } as const;
  const inputCls = "w-full px-3 py-2 text-sm rounded-lg outline-none";
  const inputStyle = {
    background: "var(--p-card-bg)",
    color: "var(--p-card-ink)",
    border: "1px solid var(--p-border)",
  } as const;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className={labelCls} style={labelStyle}>Calle *</label>
          <input className={inputCls} style={inputStyle} value={v.shippingStreet} onChange={(e) => field("shippingStreet", e.target.value)} placeholder="Calle Mayor" />
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>Número *</label>
          <input className={inputCls} style={inputStyle} value={v.shippingNumber} onChange={(e) => field("shippingNumber", e.target.value)} placeholder="23" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={labelCls} style={labelStyle}>Piso</label>
          <input className={inputCls} style={inputStyle} value={v.shippingFloor} onChange={(e) => field("shippingFloor", e.target.value)} placeholder="3º" />
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>Escalera / Patio</label>
          <input className={inputCls} style={inputStyle} value={v.shippingStaircase} onChange={(e) => field("shippingStaircase", e.target.value)} placeholder="B" />
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>Puerta</label>
          <input className={inputCls} style={inputStyle} value={v.shippingDoor} onChange={(e) => field("shippingDoor", e.target.value)} placeholder="A" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls} style={labelStyle}>Población *</label>
          <input className={inputCls} style={inputStyle} value={v.shippingCity} onChange={(e) => field("shippingCity", e.target.value)} placeholder="Valencia" />
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>Provincia</label>
          <input className={inputCls} style={inputStyle} value={v.shippingProvince} onChange={(e) => field("shippingProvince", e.target.value)} placeholder="Valencia" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls} style={labelStyle}>Código postal *</label>
          <input className={inputCls} style={inputStyle} value={v.shippingPostalCode} onChange={(e) => field("shippingPostalCode", e.target.value)} placeholder="46001" />
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>Teléfono de contacto</label>
          <input className={inputCls} style={inputStyle} value={v.shippingPhone} onChange={(e) => field("shippingPhone", e.target.value)} placeholder="+34 600 000 000" />
        </div>
      </div>

      <p className="text-[11px]" style={{ color: "var(--p-text-faint)" }}>
        Los campos con * son obligatorios. La usamos para enviarte los parches a casa.
      </p>

      {msg && (
        <p className="text-xs" style={{ color: msg.kind === "ok" ? "#10B981" : "#FCA5A5" }}>{msg.text}</p>
      )}

      <button
        onClick={save}
        disabled={saving || !required}
        className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
        style={{ background: "var(--p-accent)", color: "var(--p-accent-ink)" }}
      >
        {saving ? "Guardando…" : "Guardar dirección"}
      </button>
    </div>
  );
}
