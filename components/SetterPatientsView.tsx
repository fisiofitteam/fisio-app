"use client";

import { useMemo, useState } from "react";

type Patient = {
  id: string;
  fullName: string;
  email: string | null;
  programType: string | null;
  country: string | null;
  contractDNI: string | null;
  shirtSize: string | null;
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
function hasShipping(p: Patient): boolean {
  const structured = !!(p.shippingStreet && p.shippingNumber && p.shippingCity && p.shippingPostalCode);
  if (structured) return true;
  return !!(p.shippingAddress && p.shippingCity && p.shippingPostalCode);
}

/**
 * Vista para Niki (setter) de /fisio/pacientes: solo info de envío y fiscal
 * de TODOS los pacientes. Pensada como "agenda de envíos" — no entra a la
 * ficha clínica ni a programas.
 */
export function SetterPatientsView({ patients }: { patients: Patient[] }) {
  const [query, setQuery] = useState("");
  const [showOnlyMissing, setShowOnlyMissing] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return patients.filter((p) => {
      if (showOnlyMissing) {
        const missingAny = !hasShipping(p) || !p.contractDNI;
        if (!missingAny) return false;
      }
      if (!q) return true;
      const hay = [
        p.fullName,
        p.email ?? "",
        p.shippingPhone ?? "",
        p.contractDNI ?? "",
        p.shippingCity ?? "",
        p.shippingPostalCode ?? "",
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [patients, query, showOnlyMissing]);

  const totalMissing = patients.filter((p) => !hasShipping(p) || !p.contractDNI).length;

  return (
    <main>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Pacientes</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Información de envío y fiscal de todos los pacientes activos. Para envíos, facturas o cualquier gestión administrativa.
        </p>
      </header>

      <div className="flex gap-2 mb-4 items-center flex-wrap">
        <input
          className="input text-sm flex-1 min-w-[200px]"
          placeholder="Buscar por nombre, email, DNI, ciudad, CP, teléfono…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          onClick={() => setShowOnlyMissing((v) => !v)}
          className={`text-xs px-3 py-2 rounded-lg whitespace-nowrap flex items-center gap-1.5 ${
            showOnlyMissing
              ? "bg-amber-100 text-amber-900 border border-amber-300"
              : "bg-white border border-neutral-200 text-neutral-600"
          }`}
        >
          ⚠ Con datos incompletos
          <span className={`text-[10px] px-1.5 rounded-full ${showOnlyMissing ? "bg-amber-200" : "bg-neutral-100"}`}>
            {totalMissing}
          </span>
        </button>
        <span className="text-xs text-neutral-400 ml-auto">{filtered.length} / {patients.length}</span>
      </div>

      <section className="card">
        {filtered.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-12 italic">
            {query || showOnlyMissing ? "Ningún paciente encaja con el filtro." : "Aún no hay pacientes."}
          </p>
        ) : (
          <div className="divide-y divide-neutral-100">
            {filtered.map((p) => (
              <PatientRow key={p.id} patient={p} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function PatientRow({ patient }: { patient: Patient }) {
  const has = hasShipping(patient);
  return (
    <div className="py-3 px-2 -mx-2">
      <div className="flex items-baseline gap-2 flex-wrap mb-1.5">
        <span className="font-medium">{patient.fullName}</span>
        {patient.programType && (
          <span className="text-[10px] uppercase bg-neutral-100 text-neutral-700 border border-neutral-300 px-2 py-0.5 rounded-full font-medium">
            {patient.programType}
          </span>
        )}
        {patient.country && patient.country !== "España" && (
          <span className="text-[10px] uppercase bg-orange-50 text-orange-800 border border-orange-200 px-2 py-0.5 rounded-full font-medium">
            🌍 {patient.country}
          </span>
        )}
        {patient.shirtSize && (
          <span className="text-[10px] font-bold text-neutral-700 bg-neutral-100 border border-neutral-300 px-1.5 py-0.5 rounded">
            Camiseta {patient.shirtSize}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        {/* Bloque contacto / fiscal */}
        <div className="bg-neutral-50 rounded px-2 py-1.5 space-y-0.5">
          {patient.email && (
            <div className="text-neutral-700">✉️ {patient.email}</div>
          )}
          {patient.shippingPhone ? (
            <div className="text-neutral-700">📞 {patient.shippingPhone}</div>
          ) : (
            <div className="text-amber-700 italic">📞 Sin teléfono</div>
          )}
          {patient.contractDNI ? (
            <div className="text-neutral-700">🪪 DNI: <span className="font-mono">{patient.contractDNI}</span></div>
          ) : (
            <div className="text-amber-700 italic">🪪 DNI no firmado</div>
          )}
          {patient.country && (
            <div className="text-neutral-500 text-[11px]">País: {patient.country}</div>
          )}
        </div>

        {/* Bloque dirección de envío */}
        <div className="bg-neutral-50 rounded px-2 py-1.5">
          {has ? (
            <>
              <div className="text-neutral-700">📍 {buildAddressLine1(patient)}</div>
              <div className="text-neutral-700">{buildAddressLine2(patient)}</div>
            </>
          ) : (
            <div className="text-amber-700 italic">⚠ Sin dirección postal</div>
          )}
        </div>
      </div>
    </div>
  );
}
