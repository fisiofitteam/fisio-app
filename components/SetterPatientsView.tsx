"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [showOnlyMissing, setShowOnlyMissing] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);

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
              <PatientRow key={p.id} patient={p} onEdit={() => setEditing(p)} />
            ))}
          </div>
        )}
      </section>

      {editing && (
        <EditPatientModal
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

function PatientRow({ patient, onEdit }: { patient: Patient; onEdit: () => void }) {
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
        <button
          onClick={onEdit}
          className="ml-auto text-[11px] text-blue-700 hover:underline"
          title="Editar datos y dirección"
        >
          ✏️ Editar
        </button>
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

const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const COUNTRIES = ["España", "Portugal", "Francia", "Italia", "Alemania", "Reino Unido", "Estados Unidos", "México", "Argentina", "Colombia", "Chile", "Otro"];

function EditPatientModal({
  patient,
  onClose,
  onSaved,
}: {
  patient: Patient;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState(patient.email ?? "");
  const [shippingPhone, setShippingPhone] = useState(patient.shippingPhone ?? "");
  const [country, setCountry] = useState(patient.country ?? "España");
  const [shirtSize, setShirtSize] = useState(patient.shirtSize ?? "");
  const [shippingStreet, setShippingStreet] = useState(patient.shippingStreet ?? "");
  const [shippingNumber, setShippingNumber] = useState(patient.shippingNumber ?? "");
  const [shippingFloor, setShippingFloor] = useState(patient.shippingFloor ?? "");
  const [shippingStaircase, setShippingStaircase] = useState(patient.shippingStaircase ?? "");
  const [shippingDoor, setShippingDoor] = useState(patient.shippingDoor ?? "");
  const [shippingPostalCode, setShippingPostalCode] = useState(patient.shippingPostalCode ?? "");
  const [shippingCity, setShippingCity] = useState(patient.shippingCity ?? "");
  const [shippingProvince, setShippingProvince] = useState(patient.shippingProvince ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    setSaving(true);
    const res = await fetch("/api/patients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: patient.id,
        email: email.trim() || null,
        // También el "phone" principal para que quede sincronizado con la ficha.
        phone: shippingPhone.trim() || null,
        shippingPhone: shippingPhone.trim() || null,
        country: country || null,
        shirtSize: shirtSize || null,
        shippingStreet: shippingStreet.trim() || null,
        shippingNumber: shippingNumber.trim() || null,
        shippingFloor: shippingFloor.trim() || null,
        shippingStaircase: shippingStaircase.trim() || null,
        shippingDoor: shippingDoor.trim() || null,
        shippingCity: shippingCity.trim() || null,
        shippingProvince: shippingProvince.trim() || null,
        shippingPostalCode: shippingPostalCode.trim() || null,
      }),
    });
    if (res.ok) {
      onSaved();
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data?.error || "No se pudieron guardar los cambios");
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-4 my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">Editar · {patient.fullName}</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl">✕</button>
        </div>

        <div className="space-y-3">
          {/* Contacto */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-neutral-500 block mb-1">Email</label>
              <input type="email" className="input text-sm w-full" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] text-neutral-500 block mb-1">Teléfono</label>
              <input type="tel" className="input text-sm w-full" value={shippingPhone} onChange={(e) => setShippingPhone(e.target.value)} />
            </div>
          </div>

          {/* País / Camiseta */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-neutral-500 block mb-1">País</label>
              <select className="input text-sm w-full" value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-neutral-500 block mb-1">Camiseta</label>
              <select className="input text-sm w-full" value={shirtSize} onChange={(e) => setShirtSize(e.target.value)}>
                <option value="">—</option>
                {SHIRT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Dirección */}
          <div className="text-[11px] text-neutral-500 font-medium border-t border-neutral-100 pt-2 mt-2">Dirección de envío</div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <label className="text-[11px] text-neutral-500 block mb-1">Calle</label>
              <input type="text" className="input text-sm w-full" value={shippingStreet} onChange={(e) => setShippingStreet(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] text-neutral-500 block mb-1">Nº</label>
              <input type="text" className="input text-sm w-16" value={shippingNumber} onChange={(e) => setShippingNumber(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] text-neutral-500 block mb-1">Piso</label>
              <input type="text" className="input text-sm w-full" value={shippingFloor} onChange={(e) => setShippingFloor(e.target.value)} placeholder="1º" />
            </div>
            <div>
              <label className="text-[11px] text-neutral-500 block mb-1">Escalera</label>
              <input type="text" className="input text-sm w-full" value={shippingStaircase} onChange={(e) => setShippingStaircase(e.target.value)} placeholder="A" />
            </div>
            <div>
              <label className="text-[11px] text-neutral-500 block mb-1">Puerta</label>
              <input type="text" className="input text-sm w-full" value={shippingDoor} onChange={(e) => setShippingDoor(e.target.value)} placeholder="Izq" />
            </div>
          </div>
          <div className="grid grid-cols-[100px_1fr] gap-2">
            <div>
              <label className="text-[11px] text-neutral-500 block mb-1">CP</label>
              <input type="text" className="input text-sm w-full" value={shippingPostalCode} onChange={(e) => setShippingPostalCode(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] text-neutral-500 block mb-1">Ciudad</label>
              <input type="text" className="input text-sm w-full" value={shippingCity} onChange={(e) => setShippingCity(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-neutral-500 block mb-1">Provincia</label>
            <input type="text" className="input text-sm w-full" value={shippingProvince} onChange={(e) => setShippingProvince(e.target.value)} />
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">{error}</div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
            <button onClick={onClose} className="text-xs text-neutral-600 hover:underline px-2">Cancelar</button>
            <button onClick={save} disabled={saving} className="btn btn-primary text-xs disabled:opacity-50">
              {saving ? "Guardando…" : "💾 Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
