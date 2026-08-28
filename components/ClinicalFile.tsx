"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PROGRAM_TYPES, DIFFICULTIES, PROGRAM_LABELS, DIFFICULTY_LABELS } from "./PatientPills";
import { RollingAssignmentBlock } from "./RollingAssignmentBlock";
import { PatientRollingOverridesPanel } from "./PatientRollingOverridesPanel";
import { DeletePatientButton } from "./DeletePatientButton";
import { IssueInvoiceButton } from "./IssueInvoiceButton";

type Patient = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  diagnosis: string;
  bodyZone: string;
  appliedProfileName: string;
  appliedLevelName: string;
  subscriptionStartDate: string;
  subscriptionPeriodMonths: number;
  whatsappGroupUrl: string;
  programType: string;
  difficulty: string;
  programMode: string;
  rollingProgramId: string | null;
  rollingAccessoriesId: string | null;
  rollingTrainingId: string | null;
  // Dirección postal
  shippingStreet: string | null;
  shippingNumber: string | null;
  shippingFloor: string | null;
  shippingStaircase: string | null;
  shippingDoor: string | null;
  shippingCity: string | null;
  shippingProvince: string | null;
  shippingPostalCode: string | null;
  shippingPhone: string | null;
  /** Para el botón de facturación: indica si ya tenemos NIF/dirección. */
  hasTaxId?: boolean;
  hasFiscalAddress?: boolean;
};

function daysUntilRenewal(start: string, months: number): number | null {
  if (!start) return null;
  const startDate = new Date(start);
  const renewal = new Date(startDate);
  renewal.setMonth(renewal.getMonth() + months);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  renewal.setHours(0, 0, 0, 0);
  return Math.round((renewal.getTime() - now.getTime()) / 86400000);
}

export function ClinicalFile({
  patient,
  isManager,
  isCeo = false,
}: {
  patient: Patient;
  isManager: boolean;
  /** Si true, muestra la "Zona de peligro" para borrar al paciente. */
  isCeo?: boolean;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(patient.fullName);
  const [email, setEmail] = useState(patient.email ?? "");
  const [phone, setPhone] = useState(patient.phone ?? "");
  const [instagram, setInstagram] = useState(patient.instagram ?? "");
  // Dirección postal (editable desde la ficha)
  const [shippingStreet, setShippingStreet] = useState(patient.shippingStreet ?? "");
  const [shippingNumber, setShippingNumber] = useState(patient.shippingNumber ?? "");
  const [shippingFloor, setShippingFloor] = useState(patient.shippingFloor ?? "");
  const [shippingStaircase, setShippingStaircase] = useState(patient.shippingStaircase ?? "");
  const [shippingDoor, setShippingDoor] = useState(patient.shippingDoor ?? "");
  const [shippingCity, setShippingCity] = useState(patient.shippingCity ?? "");
  const [shippingProvince, setShippingProvince] = useState(patient.shippingProvince ?? "");
  const [shippingPostalCode, setShippingPostalCode] = useState(patient.shippingPostalCode ?? "");
  const [shippingPhone, setShippingPhone] = useState(patient.shippingPhone ?? "");
  const [diagnosis, setDiagnosis] = useState(patient.diagnosis);
  // bodyZone es read-only en la ficha: la fuente de verdad es la anamnesis
  // (paso "Zona afectada" del onboarding) y se sincroniza vía
  // /api/patient/onboarding → summarizeBodyZone().
  const bodyZone = patient.bodyZone ?? "";
  const [subscriptionStartDate, setSubscriptionStartDate] = useState(patient.subscriptionStartDate);
  const [subscriptionPeriodMonths, setSubscriptionPeriodMonths] = useState(patient.subscriptionPeriodMonths);
  const [whatsappGroupUrl, setWhatsappGroupUrl] = useState(patient.whatsappGroupUrl);
  const [programType, setProgramType] = useState(patient.programType ?? "");
  const [difficulty, setDifficulty] = useState(patient.difficulty ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const renewalDays = daysUntilRenewal(subscriptionStartDate, subscriptionPeriodMonths);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/patients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: patient.id,
        fullName,
        email: email.trim() || null,
        phone: phone.trim() || null,
        instagram: instagram.trim() || null,
        diagnosis,
        subscriptionStartDate: subscriptionStartDate || null,
        subscriptionPeriodMonths: Number(subscriptionPeriodMonths) || 4,
        whatsappGroupUrl: whatsappGroupUrl || null,
        programType: programType || null,
        ...(isManager && { difficulty: difficulty || null }),
        // Dirección
        shippingStreet: shippingStreet.trim() || null,
        shippingNumber: shippingNumber.trim() || null,
        shippingFloor: shippingFloor.trim() || null,
        shippingStaircase: shippingStaircase.trim() || null,
        shippingDoor: shippingDoor.trim() || null,
        shippingCity: shippingCity.trim() || null,
        shippingProvince: shippingProvince.trim() || null,
        shippingPostalCode: shippingPostalCode.trim() || null,
        shippingPhone: shippingPhone.trim() || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data?.error || "No se pudieron guardar los cambios");
      return;
    }
    setSavedAt(new Date());
    router.refresh();
  }

  const renewalDate = subscriptionStartDate
    ? (() => {
        const d = new Date(subscriptionStartDate);
        d.setMonth(d.getMonth() + subscriptionPeriodMonths);
        return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
      })()
    : null;

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <h2 className="font-medium">📇 Datos personales</h2>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Nombre completo</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">
            Email <span className="text-neutral-400 font-normal">(con el que entra a la app)</span>
          </label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="paciente@ejemplo.com"
          />
          <p className="text-[10px] text-neutral-400 mt-1 italic">
            Si lo cambias, el paciente recibirá el código de acceso a este nuevo email.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Teléfono</label>
            <input
              className="input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+34 600 000 000"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Instagram</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">@</span>
              <input
                className="input pl-7"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value.replace(/^@+/, ""))}
                placeholder="usuario"
              />
            </div>
          </div>
        </div>

        <details className="border-t border-neutral-100 pt-3">
          <summary className="text-sm font-medium cursor-pointer flex items-center gap-2">
            📮 Dirección postal
            <span className="text-[10px] text-neutral-400 font-normal">
              {patient.shippingStreet ? "(con dirección)" : "(vacía)"}
            </span>
          </summary>
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-xs text-neutral-500 block mb-1">Calle</label>
                <input className="input" value={shippingStreet} onChange={(e) => setShippingStreet(e.target.value)} placeholder="Calle Mayor" />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Número</label>
                <input className="input" value={shippingNumber} onChange={(e) => setShippingNumber(e.target.value)} placeholder="42" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Piso</label>
                <input className="input" value={shippingFloor} onChange={(e) => setShippingFloor(e.target.value)} placeholder="3" />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Escalera</label>
                <input className="input" value={shippingStaircase} onChange={(e) => setShippingStaircase(e.target.value)} placeholder="A" />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Puerta</label>
                <input className="input" value={shippingDoor} onChange={(e) => setShippingDoor(e.target.value)} placeholder="2" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Código postal</label>
                <input className="input" value={shippingPostalCode} onChange={(e) => setShippingPostalCode(e.target.value)} placeholder="28001" />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Ciudad</label>
                <input className="input" value={shippingCity} onChange={(e) => setShippingCity(e.target.value)} placeholder="Madrid" />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Provincia</label>
                <input className="input" value={shippingProvince} onChange={(e) => setShippingProvince(e.target.value)} placeholder="Madrid" />
              </div>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Teléfono de contacto para envíos</label>
              <input className="input" type="tel" value={shippingPhone} onChange={(e) => setShippingPhone(e.target.value)} placeholder="+34 600 000 000" />
            </div>
          </div>
        </details>

        <div className="border-t border-neutral-100 pt-3">
          <label className="text-xs text-neutral-500 block mb-1">Diagnóstico / motivo</label>
          <textarea className="input" rows={3} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Zona corporal afectada</label>
          <div
            className="text-sm px-3 py-2 rounded-lg"
            style={{ background: "#FAFAFA", border: "1px solid #E5E5E5", minHeight: 38 }}
          >
            {bodyZone ? (
              <span>{bodyZone}</span>
            ) : (
              <span className="text-neutral-400 italic">El paciente aún no la ha rellenado en la anamnesis.</span>
            )}
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">
            Lo rellena el paciente en el cuestionario inicial (paso "Zona afectada").
          </p>
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">
            <span className="inline-flex items-center gap-1">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" className="text-emerald-600">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Grupo de WhatsApp (link de invitación)
            </span>
          </label>
          <input
            className="input"
            value={whatsappGroupUrl}
            onChange={(e) => setWhatsappGroupUrl(e.target.value)}
            placeholder="https://chat.whatsapp.com/..."
          />
          <p className="text-xs text-neutral-400 mt-1">
            Pega el link de invitación del grupo. Lo consigues desde WhatsApp → Datos del grupo → Invitar mediante enlace.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Programa</label>
            <div className="flex gap-1 flex-wrap">
              {PROGRAM_TYPES.map((p) => {
                const active = programType === p;
                const meta = PROGRAM_LABELS[p];
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProgramType(active ? "" : p)}
                    className={`text-xs px-2.5 py-1.5 rounded-full border font-medium ${
                      active ? meta.color : "bg-white border-neutral-300 text-neutral-400 hover:text-neutral-700"
                    }`}
                  >
                    {meta.label}
                  </button>
                );
              })}
              {programType && (
                <button
                  type="button"
                  onClick={() => setProgramType("")}
                  className="text-xs text-neutral-400 underline ml-1"
                >
                  limpiar
                </button>
              )}
            </div>
          </div>

          {isManager && (
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Dificultad percibida</label>
              <div className="flex gap-1 flex-wrap">
                {DIFFICULTIES.map((d) => {
                  const active = difficulty === d;
                  const meta = DIFFICULTY_LABELS[d];
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDifficulty(active ? "" : d)}
                      className={`text-xs px-2.5 py-1.5 rounded-full border font-medium ${
                        active ? meta.color : "bg-white border-neutral-300 text-neutral-400 hover:text-neutral-700"
                      }`}
                    >
                      {meta.label}
                    </button>
                  );
                })}
                {difficulty && (
                  <button
                    type="button"
                    onClick={() => setDifficulty("")}
                    className="text-xs text-neutral-400 underline ml-1"
                  >
                    limpiar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Asignación del programa rolling (queda en ficha clínica porque es decisión clínica, no comercial) */}
      <section className="card space-y-3">
        <h2 className="font-medium">Programa rolling</h2>
        <RollingAssignmentBlock
          patientId={patient.id}
          programType={patient.programType}
          programMode={patient.programMode}
          currentRollingProgramId={patient.rollingProgramId}
          currentAccessoriesId={patient.rollingAccessoriesId}
          currentTrainingId={patient.rollingTrainingId}
          isManager={isManager}
        />
      </section>

      {/* Personalización del rolling para este atleta concreto. Solo aparece
          si está en modo rolling y tiene al menos un rolling asignado. */}
      {patient.programMode === "rolling" && (patient.rollingAccessoriesId || patient.rollingTrainingId || patient.rollingProgramId) && (
        <PatientRollingOverridesPanel
          patientId={patient.id}
          patientName={patient.fullName}
          accessoriesId={patient.rollingAccessoriesId}
          trainingId={patient.rollingTrainingId || patient.rollingProgramId}
        />
      )}


      <div className="flex justify-end items-center gap-3">
        {savedAt && <span className="text-xs text-emerald-600">✓ Guardado</span>}
        <button onClick={save} disabled={saving} className="btn btn-primary">
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>

      {patient.appliedProfileName && (
        <section className="card">
          <h2 className="font-medium mb-2">Perfil clínico aplicado</h2>
          <div className="text-sm">
            <div><span className="text-neutral-500">Perfil:</span> <strong>{patient.appliedProfileName}</strong></div>
            <div><span className="text-neutral-500">Nivel:</span> {patient.appliedLevelName}</div>
          </div>
          <p className="text-xs text-neutral-500 mt-2">
            El perfil y nivel se cambian desde "Control de cargas".
          </p>
        </section>
      )}

      <ConvertToCaseBlock patient={patient} />

      {isCeo && (
        <div className="mt-6 pt-4 border-t border-neutral-100">
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="text-sm font-medium">Facturación</h3>
            <a
              href="/fisio/finanzas/facturas-pacientes"
              className="text-xs text-neutral-500 hover:underline"
            >
              Ver todas →
            </a>
          </div>
          <p className="text-xs text-neutral-500 mb-3">
            Emite una factura para este paciente. Quedará en{" "}
            <strong>Finanzas → Facturas a pacientes</strong> con numeración
            correlativa anual (FF-YYYY-NNNN).
          </p>
          <IssueInvoiceButton
            patient={{
              id: patient.id,
              fullName: patient.fullName,
              hasTaxId: patient.hasTaxId ?? false,
              hasFiscalAddress: patient.hasFiscalAddress ?? false,
            }}
            suggestedConcept={
              patient.programType
                ? `Servicios de fisioterapia · Programa ${patient.programType}`
                : "Servicios de fisioterapia y rehabilitación"
            }
          />
        </div>
      )}

      {/* Borrar paciente: abierto a cualquier profesional del equipo.
          La red de seguridad la pone el propio botón (pedir teclear el
          nombre completo como confirmación) y el endpoint (misma
          verificación server-side). */}
      <DeletePatientButton patientId={patient.id} fullName={patient.fullName} />
    </div>
  );
}

// ============================================================================
// Bloque: convertir paciente en caso de éxito (banco de recursos)
// ============================================================================

function ConvertToCaseBlock({ patient }: { patient: Patient }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <section className="card">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1">
            <h2 className="font-medium mb-1">🩺 Convertir en caso de éxito</h2>
            <p className="text-xs text-neutral-500">
              Crea un caso clínico publicable a partir de este paciente. Se guarda en el banco de recursos para usarlo en contenido (reels caso éxito, carruseles, etc).
            </p>
          </div>
          <button onClick={() => setOpen(true)} className="btn btn-primary text-xs whitespace-nowrap">
            + Crear caso
          </button>
        </div>
      </section>
      {open && (
        <ConvertToCaseModal patient={patient} onClose={() => setOpen(false)} onCreated={() => setOpen(false)} />
      )}
    </>
  );
}

type VideoRef = { url: string; caption: string };

const APARTADOS = [
  {
    key: "initialSituation" as const,
    videosKey: "initialSituationVideos" as const,
    label: "Cómo estaba / dolor principal",
    placeholder: "Punto de partida: qué le pasaba, desde cuándo, tratamientos previos, hallazgos objetivos, estado emocional…",
  },
  {
    key: "process" as const,
    videosKey: "processVideos" as const,
    label: "Cómo ha sido su proceso",
    placeholder: "Arco del tratamiento: fases, hitos, adaptaciones, cómo respondió, adherencia…",
  },
  {
    key: "obstacles" as const,
    videosKey: "obstaclesVideos" as const,
    label: "Obstáculos que ha superado",
    placeholder: "Frustración, miedo al movimiento, hipervigilancia, impulsividad competitiva, creencias limitantes…",
  },
  {
    key: "achievements" as const,
    videosKey: "achievementsVideos" as const,
    label: "Qué ha conseguido",
    placeholder: "Recuperación objetiva (funcionalidad, cargas, competiciones) + subjetiva (cómo se siente, aprendizajes)…",
  },
];

type CaseState = {
  initialSituation: string;
  process: string;
  obstacles: string;
  achievements: string;
  initialSituationVideos: VideoRef[];
  processVideos: VideoRef[];
  obstaclesVideos: VideoRef[];
  achievementsVideos: VideoRef[];
  consentSigned: boolean;
  notes: string;
};

function ConvertToCaseModal({ patient, onClose, onCreated }: { patient: Patient; onClose: () => void; onCreated: () => void }) {
  const [caseId, setCaseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [state, setState] = useState<CaseState>({
    initialSituation: "",
    process: "",
    obstacles: "",
    achievements: "",
    initialSituationVideos: [],
    processVideos: [],
    obstaclesVideos: [],
    achievementsVideos: [],
    consentSigned: false,
    notes: "",
  });

  // Crea (o recupera) el caso ligado a este paciente al abrir el modal.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/content/cases/from-patient", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientId: patient.id }),
        });
        if (!res.ok) { setError("No se pudo crear el caso"); return; }
        const data = await res.json();
        if (cancelled) return;
        setCaseId(data.caseId);

        // Carga el estado actual del caso (por si ya existía).
        const detail = await fetch(`/api/content/cases/${data.caseId}`).then((r) => r.ok ? r.json() : null);
        if (cancelled || !detail) return;
        setState({
          initialSituation: detail.initialSituation ?? "",
          process: detail.process ?? "",
          obstacles: detail.obstacles ?? "",
          achievements: detail.achievements ?? "",
          initialSituationVideos: (detail.initialSituationVideos ?? []).map((v: any) => ({ url: v.url, caption: v.caption ?? "" })),
          processVideos: (detail.processVideos ?? []).map((v: any) => ({ url: v.url, caption: v.caption ?? "" })),
          obstaclesVideos: (detail.obstaclesVideos ?? []).map((v: any) => ({ url: v.url, caption: v.caption ?? "" })),
          achievementsVideos: (detail.achievementsVideos ?? []).map((v: any) => ({ url: v.url, caption: v.caption ?? "" })),
          consentSigned: !!detail.consentSigned,
          notes: detail.notes ?? "",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id]);

  async function generateWithAi() {
    if (!caseId) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/content/cases/${caseId}/ai-draft`, { method: "POST" });
      const text = await res.text();
      let d: any = {};
      try { d = JSON.parse(text); } catch { /* ignore */ }
      if (!res.ok || !d?.ok) {
        setError(d?.error || `Error ${res.status} generando con IA`);
        return;
      }
      setState((prev) => ({
        ...prev,
        initialSituation: d.initialSituation ?? prev.initialSituation,
        process: d.process ?? prev.process,
        obstacles: d.obstacles ?? prev.obstacles,
        achievements: d.achievements ?? prev.achievements,
      }));
      setSavedFeedback("Borrador generado ✅ — revisa y edita antes de guardar.");
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    if (!caseId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/content/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initialSituation: state.initialSituation,
          process: state.process,
          obstacles: state.obstacles,
          achievements: state.achievements,
          initialSituationVideos: state.initialSituationVideos,
          processVideos: state.processVideos,
          obstaclesVideos: state.obstaclesVideos,
          achievementsVideos: state.achievementsVideos,
          consentSigned: state.consentSigned,
          notes: state.notes,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error || `Error ${res.status} guardando`);
        return;
      }
      setSavedFeedback("Caso guardado ✅");
      onCreated();
    } catch (e: any) {
      setError(e?.message || "Error de red");
    } finally {
      setSaving(false);
    }
  }

  function updateVideos(videosKey: keyof CaseState, next: VideoRef[]) {
    setState((prev) => ({ ...prev, [videosKey]: next } as CaseState));
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b sticky top-0 bg-white flex items-center justify-between z-10">
          <div>
            <h3 className="font-medium">🩺 Caso de éxito · {patient.fullName}</h3>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              {patient.diagnosis || "Sin diagnóstico registrado"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={generateWithAi}
              disabled={loading || generating || !caseId}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white disabled:opacity-40"
              title="La IA lee toda la info del paciente y rellena los 4 apartados"
            >
              {generating ? "Generando…" : "🧠 Generar con IA"}
            </button>
            <button onClick={onClose} className="text-neutral-400 text-xl px-2">✕</button>
          </div>
        </div>

        <div className="p-4 space-y-5">
          {loading ? (
            <p className="text-sm text-neutral-400 italic text-center py-8">Cargando caso…</p>
          ) : (
            <>
              {savedFeedback && (
                <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-xs text-emerald-800">
                  {savedFeedback}
                </div>
              )}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700 whitespace-pre-wrap">
                  {error}
                </div>
              )}
              {generating && (
                <p className="text-[11px] text-neutral-500 italic">
                  Leyendo anamnesis, sesiones, sensaciones, resúmenes semanales… tarda 20-60s.
                </p>
              )}

              {APARTADOS.map((ap) => (
                <ApartadoBlock
                  key={ap.key}
                  label={ap.label}
                  placeholder={ap.placeholder}
                  text={state[ap.key]}
                  onTextChange={(v) => setState((prev) => ({ ...prev, [ap.key]: v }))}
                  videos={state[ap.videosKey]}
                  onVideosChange={(next) => updateVideos(ap.videosKey, next)}
                />
              ))}

              <div>
                <label className="text-xs text-neutral-500 block mb-1">Notas internas (opcional)</label>
                <textarea
                  className="input text-sm w-full"
                  rows={2}
                  value={state.notes}
                  onChange={(e) => setState((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Cuándo usar este caso, ideas de hooks…"
                />
              </div>

              <label className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 rounded p-2">
                <input
                  type="checkbox"
                  checked={state.consentSigned}
                  onChange={(e) => setState((prev) => ({ ...prev, consentSigned: e.target.checked }))}
                  className="mt-0.5"
                />
                <span className="text-amber-900">
                  El paciente ha firmado el permiso de uso de imagen y testimonio.
                  <span className="block text-[11px] text-amber-700 mt-0.5">
                    Sin esta confirmación el caso queda marcado como "⚠ Sin permiso" y no debe publicarse.
                  </span>
                </span>
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button onClick={onClose} className="text-sm text-neutral-500 px-3 py-2">Cancelar</button>
                <button onClick={save} disabled={saving} className="btn btn-primary text-sm">
                  {saving ? "Guardando…" : "Guardar caso"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ApartadoBlock({
  label, placeholder, text, onTextChange, videos, onVideosChange,
}: {
  label: string;
  placeholder: string;
  text: string;
  onTextChange: (v: string) => void;
  videos: VideoRef[];
  onVideosChange: (next: VideoRef[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newCaption, setNewCaption] = useState("");

  function addVideo() {
    const url = newUrl.trim();
    if (!url) return;
    onVideosChange([...videos, { url, caption: newCaption.trim() }]);
    setNewUrl("");
    setNewCaption("");
    setAdding(false);
  }

  function removeVideo(i: number) {
    const next = videos.slice();
    next.splice(i, 1);
    onVideosChange(next);
  }

  return (
    <div className="border border-neutral-200 rounded-lg p-3 bg-white">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-semibold text-neutral-800">{label}</label>
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-[11px] font-medium text-emerald-700 hover:text-emerald-900"
        >
          🎥 + Añadir vídeo
        </button>
      </div>

      <textarea
        className="input text-sm w-full"
        rows={6}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder={placeholder}
      />

      {adding && (
        <div className="mt-2 p-2 bg-neutral-50 rounded border border-neutral-200 space-y-2">
          <input
            type="url"
            className="input text-xs w-full"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="URL del vídeo (Drive, YouTube, etc)"
            autoFocus
          />
          <input
            type="text"
            className="input text-xs w-full"
            value={newCaption}
            onChange={(e) => setNewCaption(e.target.value)}
            placeholder="Descripción corta (ej. clean pesado, MU en anilla)"
          />
          <div className="flex justify-end gap-1.5">
            <button onClick={() => { setAdding(false); setNewUrl(""); setNewCaption(""); }} className="text-[11px] text-neutral-500 px-2 py-1">
              Cancelar
            </button>
            <button onClick={addVideo} disabled={!newUrl.trim()} className="text-[11px] font-medium px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded disabled:opacity-40">
              + Añadir
            </button>
          </div>
        </div>
      )}

      {videos.length > 0 && (
        <ul className="mt-2 space-y-1">
          {videos.map((v, i) => (
            <li key={`${v.url}-${i}`} className="flex items-center gap-2 text-[11px] bg-neutral-50 rounded px-2 py-1">
              <span className="shrink-0">🎥</span>
              <a href={v.url} target="_blank" rel="noopener noreferrer" className="truncate text-blue-600 hover:underline flex-1" title={v.url}>
                {v.caption || v.url}
              </a>
              <button onClick={() => removeVideo(i)} className="text-neutral-400 hover:text-red-600 text-xs px-1" title="Eliminar">✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
