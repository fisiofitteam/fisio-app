"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Patient = {
  id: string;
  fullName: string;
  startedAt: string;
  programType: string | null;
  patchSent: boolean;
  patchSentAt: string | null;
  shippingAddress: string | null;
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

// Construye la primera línea de la dirección a partir de los campos estructurados;
// si solo existe el campo legacy de texto libre, lo devuelve tal cual.
function buildAddressLine1(p: Patient): string {
  if (p.shippingStreet) {
    const parts = [p.shippingStreet];
    if (p.shippingNumber) parts.push(p.shippingNumber);
    const detail = [p.shippingFloor, p.shippingStaircase, p.shippingDoor].filter(Boolean).join(" ");
    if (detail) parts.push(detail);
    return parts.join(", ");
  }
  return p.shippingAddress ?? "";
}
function buildAddressLine2(p: Patient): string {
  const parts: string[] = [];
  if (p.shippingPostalCode) parts.push(p.shippingPostalCode);
  if (p.shippingCity) parts.push(p.shippingCity);
  let line = parts.join(" ");
  if (p.shippingProvince) line += ` (${p.shippingProvince})`;
  return line;
}

export function PatchesView({
  view,
  patients,
  counts,
}: {
  view: "pending" | "sent";
  patients: Patient[];
  counts: { pending: number; sent: number };
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Patient | null>(null);

  function switchView(v: "pending" | "sent") {
    const url = new URL(window.location.href);
    if (v === "pending") url.searchParams.delete("view");
    else url.searchParams.set("view", v);
    router.push(url.pathname + url.search);
    router.refresh();
  }

  async function toggleSent(patientId: string, sent: boolean) {
    setLoadingId(patientId);
    await fetch("/api/patients/patch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId, sent }),
    });
    router.refresh();
    setLoadingId(null);
  }

  function daysSince(iso: string): number {
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  }

  function hasShipping(p: Patient): boolean {
    // Estructurada (preferida): calle + número + ciudad + CP
    const structured = !!(p.shippingStreet && p.shippingNumber && p.shippingCity && p.shippingPostalCode);
    if (structured) return true;
    // Legacy: texto libre + ciudad + CP
    return !!(p.shippingAddress && p.shippingCity && p.shippingPostalCode);
  }

  return (
    <main>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Parches de bienvenida</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Regalo a nuevos pacientes al iniciar el programa
        </p>
      </header>

      <div className="flex gap-1 mb-4">
        <button
          onClick={() => switchView("pending")}
          className={`px-3 py-2 text-xs rounded-lg flex items-center gap-1.5 ${
            view === "pending" ? "bg-neutral-900 text-white" : "bg-white border border-neutral-200"
          }`}
        >
          📦 Pendientes de enviar
          <span className={`text-[10px] px-1.5 rounded-full ${view === "pending" ? "bg-white/20" : "bg-neutral-100"}`}>
            {counts.pending}
          </span>
        </button>
        <button
          onClick={() => switchView("sent")}
          className={`px-3 py-2 text-xs rounded-lg flex items-center gap-1.5 ${
            view === "sent" ? "bg-neutral-900 text-white" : "bg-white border border-neutral-200"
          }`}
        >
          ✓ Enviados
          <span className={`text-[10px] px-1.5 rounded-full ${view === "sent" ? "bg-white/20" : "bg-neutral-100"}`}>
            {counts.sent}
          </span>
        </button>
      </div>

      <section className="card">
        {patients.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-12 italic">
            {view === "pending" ? "No hay parches pendientes. ¡Todo enviado!" : "Aún no se ha enviado ningún parche."}
          </p>
        ) : (
          <div className="divide-y divide-neutral-100">
            {patients.map((p) => (
              <div key={p.id} className="py-3 px-2 -mx-2 flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-medium">{p.fullName}</span>
                    {p.programType && (
                      <span className="text-[10px] uppercase bg-neutral-100 text-neutral-700 border border-neutral-300 px-2 py-0.5 rounded-full font-medium">
                        {p.programType}
                      </span>
                    )}
                    {view === "pending" && (
                      <span className="text-[11px] text-amber-700">
                        · alta hace {daysSince(p.startedAt)} {daysSince(p.startedAt) === 1 ? "día" : "días"}
                      </span>
                    )}
                    {view === "sent" && p.patchSentAt && (
                      <span className="text-[11px] text-emerald-700">
                        · enviado {new Date(p.patchSentAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </div>

                  {/* Datos de envío */}
                  {hasShipping(p) ? (
                    <div className="text-xs text-neutral-600 leading-relaxed mt-1.5 bg-neutral-50 rounded px-2 py-1.5">
                      <div>📍 {buildAddressLine1(p)}</div>
                      <div>{buildAddressLine2(p)}</div>
                      {p.shippingPhone && <div>📞 {p.shippingPhone}</div>}
                    </div>
                  ) : (
                    <div className="text-xs text-amber-700 italic mt-1.5">
                      ⚠ Falta dirección de envío
                    </div>
                  )}

                  <button
                    onClick={() => setEditing(p)}
                    className="text-[11px] text-blue-600 hover:underline mt-1.5"
                  >
                    {hasShipping(p) ? "Editar dirección" : "+ Añadir dirección"}
                  </button>
                </div>

                <div className="flex-shrink-0">
                  {view === "pending" ? (
                    <button
                      onClick={() => toggleSent(p.id, true)}
                      disabled={loadingId === p.id || !hasShipping(p)}
                      className="btn btn-accent text-xs whitespace-nowrap disabled:opacity-50"
                      title={!hasShipping(p) ? "Añade dirección antes de marcar como enviado" : ""}
                    >
                      {loadingId === p.id ? "..." : "✓ Marcar enviado"}
                    </button>
                  ) : (
                    <button
                      onClick={() => toggleSent(p.id, false)}
                      disabled={loadingId === p.id}
                      className="text-xs text-neutral-500 hover:text-neutral-900"
                    >
                      Deshacer
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {editing && (
        <ShippingModal
          patient={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

function ShippingModal({
  patient,
  onClose,
  onSaved,
}: {
  patient: Patient;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState({
    shippingStreet: patient.shippingStreet ?? "",
    shippingNumber: patient.shippingNumber ?? "",
    shippingFloor: patient.shippingFloor ?? "",
    shippingStaircase: patient.shippingStaircase ?? "",
    shippingDoor: patient.shippingDoor ?? "",
    shippingCity: patient.shippingCity ?? "",
    shippingProvince: patient.shippingProvince ?? "",
    shippingPostalCode: patient.shippingPostalCode ?? "",
    shippingPhone: patient.shippingPhone ?? "",
  });
  const [saving, setSaving] = useState(false);

  function field<K extends keyof typeof v>(k: K, val: string) {
    setV((s) => ({ ...s, [k]: val }));
  }

  async function save() {
    setSaving(true);
    await fetch("/api/patients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: patient.id,
        ...Object.fromEntries(Object.entries(v).map(([k, val]) => [k, val.trim() || null])),
      }),
    });
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium">Datos de envío · {patient.fullName}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-neutral-500 block mb-1">Calle</label>
              <input className="input text-sm" value={v.shippingStreet} onChange={(e) => field("shippingStreet", e.target.value)} placeholder="Calle Mayor" autoFocus />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Número</label>
              <input className="input text-sm" value={v.shippingNumber} onChange={(e) => field("shippingNumber", e.target.value)} placeholder="23" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Piso</label>
              <input className="input text-sm" value={v.shippingFloor} onChange={(e) => field("shippingFloor", e.target.value)} placeholder="3º" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Escalera / Patio</label>
              <input className="input text-sm" value={v.shippingStaircase} onChange={(e) => field("shippingStaircase", e.target.value)} placeholder="B" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Puerta</label>
              <input className="input text-sm" value={v.shippingDoor} onChange={(e) => field("shippingDoor", e.target.value)} placeholder="A" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Población</label>
              <input className="input text-sm" value={v.shippingCity} onChange={(e) => field("shippingCity", e.target.value)} placeholder="Valencia" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Provincia</label>
              <input className="input text-sm" value={v.shippingProvince} onChange={(e) => field("shippingProvince", e.target.value)} placeholder="Valencia" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Código postal</label>
              <input className="input text-sm" value={v.shippingPostalCode} onChange={(e) => field("shippingPostalCode", e.target.value)} placeholder="46001" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Teléfono</label>
              <input className="input text-sm" value={v.shippingPhone} onChange={(e) => field("shippingPhone", e.target.value)} placeholder="+34 600 000 000" />
            </div>
          </div>

          <button onClick={save} disabled={saving} className="btn btn-primary w-full text-sm">
            {saving ? "Guardando..." : "Guardar dirección"}
          </button>
        </div>
      </div>
    </div>
  );
}
