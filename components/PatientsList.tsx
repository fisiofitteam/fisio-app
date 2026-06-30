"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { ProgressRing } from "@/components/ProgressRing";
import { PatientPill, PROGRAM_TYPES, DIFFICULTIES, PROGRAM_LABELS, DIFFICULTY_LABELS } from "@/components/PatientPills";
import { LegacyCreatePatientModal } from "@/components/LegacyCreatePatientModal";

type Patient = {
  id: string;
  fullName: string;
  diagnosis: string;
  bodyZone: string | null;
  appliedLevelName: string | null;
  whatsappGroupUrl: string | null;
  subscriptionStartDate: string | null;
  subscriptionTotalMonths: number;
  renewalDays: number | null;
  consumedMonths: number;
  adherenceCompleted: number;
  adherenceTotal: number;
  adaptationsCount: number;
  programsCount: number;
  programType: string | null;
  difficulty: string | null;
  assignedProfessional: { id: string; fullName: string; role: string } | null;
};

type CurrentUser = {
  id: string;
  fullName: string;
  isManager: boolean;
  role: string;
};

type ProInfo = { id: string; fullName: string; role: string };

const ROLE_ICON: Record<string, string> = {
  ceo: "👑",
  head_success: "⭐",
  fisio: "🩺",
};

export function PatientsList({
  patients,
  currentUser,
  tab,
  counts,
  professionals,
  rollingPrograms,
}: {
  patients: Patient[];
  currentUser: CurrentUser;
  tab: string;
  counts: { all: number; unassigned: number; mine: number; byPro: Record<string, number> };
  professionals: ProInfo[];
  rollingPrograms: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [reassigning, setReassigning] = useState<Patient | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingLegacy, setCreatingLegacy] = useState(false);
  // Managers y fisios pueden crear pacientes (de momento).
  const canCreate = currentUser.isManager || currentUser.role === "fisio";

  // Buscador por nombre, visible para todos los roles. Filtra la lista
  // de la pestaña activa sin tocar las cuentas de las tabs ni el resumen
  // por programa/dificultad — esos siempre reflejan el total de la pestaña.
  const [search, setSearch] = useState("");
  const visiblePatients = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => p.fullName.toLowerCase().includes(q));
  })();

  function switchTab(newTab: string) {
    const url = new URL(window.location.href);
    if (newTab === "all") url.searchParams.delete("tab");
    else url.searchParams.set("tab", newTab);
    router.push(url.pathname + url.search);
    router.refresh();
  }

  return (
    <main>
      <header className="mb-4 flex items-start justify-between gap-3">
        <h1 className="text-xl font-semibold">Pacientes</h1>
        {canCreate && (
          <div className="flex gap-1.5 flex-wrap justify-end">
            <button
              onClick={() => setCreatingLegacy(true)}
              className="text-sm font-medium px-3 py-2 rounded-lg whitespace-nowrap"
              style={{ background: "#FFFFFF", color: "#0A0A0A", border: "1px solid #E5E5E5" }}
              title="Migrar paciente que ya tenemos fuera de la plataforma"
            >
              📥 Paciente existente
            </button>
            <button
              onClick={() => setCreating(true)}
              className="text-sm font-medium px-3 py-2 rounded-lg whitespace-nowrap"
              style={{ background: "#0A0A0A", color: "#FAFAFA" }}
            >
              + Nuevo paciente
            </button>
          </div>
        )}
      </header>

      {currentUser.isManager && (
        <div className="mb-4 flex gap-1 overflow-x-auto pb-1 -mx-4 px-4">
          <TabButton active={tab === "all"} label={`Todos`} count={counts.all} onClick={() => switchTab("all")} />
          <TabButton active={tab === "mine"} label="Míos" count={counts.mine} onClick={() => switchTab("mine")} />
          <TabButton
            active={tab === "unassigned"}
            label="Por asignar"
            count={counts.unassigned}
            onClick={() => switchTab("unassigned")}
            highlight={counts.unassigned > 0}
          />
          {professionals
            .filter((p) => p.id !== currentUser.id) // ya tienes "Míos"
            .map((p) => {
              const tabKey = `pro:${p.id}`;
              const count = counts.byPro[p.id] ?? 0;
              return (
                <TabButton
                  key={p.id}
                  active={tab === tabKey}
                  label={`${ROLE_ICON[p.role] ?? "🩺"} ${p.fullName.split(" ")[0]}`}
                  count={count}
                  onClick={() => switchTab(tabKey)}
                />
              );
            })}
        </div>
      )}

      {/* Cuadro resumen: cuando estás en pestaña de un fisio concreto (mine o pro:) */}
      {patients.length > 0 && (tab === "mine" || tab.startsWith("pro:")) && (
        <FisioSummary patients={patients} isManager={currentUser.isManager} />
      )}

      {/* Buscador por nombre. Disponible para cualquier rol. Se aplica
          sobre los pacientes ya filtrados por pestaña. */}
      {patients.length > 0 && (
        <div className="mb-3 relative">
          <input
            type="search"
            className="input pl-8 text-sm w-full"
            placeholder="🔍 Buscar paciente por nombre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 text-xs"
              type="button"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {patients.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-neutral-500 italic mb-4">
            {tab === "unassigned"
              ? "No hay pacientes por asignar. ¡Bien!"
              : tab === "mine"
              ? "No tienes pacientes asignados todavía."
              : "Sin pacientes en esta vista."}
          </p>
          {currentUser.isManager && tab !== "unassigned" && (
            <button
              onClick={() => setCreating(true)}
              className="text-sm font-medium px-4 py-2 rounded-lg"
              style={{ background: "#0A0A0A", color: "#FAFAFA" }}
            >
              + Crear primer paciente
            </button>
          )}
        </div>
      ) : visiblePatients.length === 0 ? (
        <p className="text-sm text-neutral-500 italic text-center py-8">
          Ningún paciente coincide con "{search}".
        </p>
      ) : (
        <div className="space-y-3">
          {visiblePatients.map((p) => (
            <PatientRow
              key={p.id}
              patient={p}
              isManager={currentUser.isManager}
              onReassign={() => setReassigning(p)}
            />
          ))}
        </div>
      )}

      {reassigning && currentUser.isManager && (
        <ReassignModal
          patient={reassigning}
          professionals={professionals}
          onClose={() => setReassigning(null)}
          onSaved={() => {
            setReassigning(null);
            router.refresh();
          }}
        />
      )}

      {creating && canCreate && (
        <CreatePatientModal
          professionals={professionals}
          rollingPrograms={rollingPrograms}
          onClose={() => setCreating(false)}
          onCreated={(patientId) => {
            setCreating(false);
            router.push(`/fisio/paciente/${patientId}`);
          }}
        />
      )}

      {creatingLegacy && canCreate && (
        <LegacyCreatePatientModal
          professionals={professionals}
          rollingPrograms={rollingPrograms}
          onClose={() => setCreatingLegacy(false)}
          onCreated={(patientId) => {
            setCreatingLegacy(false);
            router.push(`/fisio/paciente/${patientId}`);
          }}
        />
      )}
    </main>
  );
}

function TabButton({
  active,
  label,
  count,
  onClick,
  highlight,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-xs rounded-lg whitespace-nowrap flex items-center gap-1.5 ${
        active
          ? "bg-neutral-900 text-white"
          : highlight
          ? "bg-amber-100 text-amber-900 border border-amber-300"
          : "bg-white border border-neutral-200"
      }`}
    >
      <span>{label}</span>
      <span className={`text-[10px] px-1.5 rounded-full ${active ? "bg-white/20" : "bg-neutral-100"}`}>{count}</span>
    </button>
  );
}

function PatientRow({
  patient,
  isManager,
  onReassign,
}: {
  patient: Patient;
  isManager: boolean;
  onReassign: () => void;
}) {
  return (
    <div className="card flex items-center gap-3 hover:border-neutral-300">
      <Link href={`/fisio/paciente/${patient.id}`} className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{patient.fullName}</span>
          <PatientPill value={patient.programType} kind="program" />
          {isManager && <PatientPill value={patient.difficulty} kind="difficulty" />}
          {patient.bodyZone && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">{patient.bodyZone}</span>
          )}
        </div>
        {patient.appliedLevelName && (
          <div className="text-xs text-emerald-700 mt-1">✓ Control de cargas · {patient.appliedLevelName}</div>
        )}
      </Link>

      <div className="hidden sm:flex flex-col items-end gap-1 flex-shrink-0">
        {patient.renewalDays !== null && (
          <span className={`text-[11px] font-medium ${
            patient.renewalDays < 0 ? "text-red-600" : patient.renewalDays <= 30 ? "text-amber-700" : "text-neutral-500"
          }`}>
            {patient.renewalDays < 0 ? `Vencida hace ${-patient.renewalDays}d` : `Renueva en ${patient.renewalDays}d`}
          </span>
        )}
        <div className="flex items-center gap-3">
          {patient.subscriptionStartDate && (
            <div className="flex flex-col items-center gap-1">
              <ProgressRing
                value={patient.consumedMonths}
                max={patient.subscriptionTotalMonths || 4}
                size={44}
                stroke={4}
                mode="subscription"
              />
              <span className="text-[10px] text-neutral-500">Suscripción</span>
            </div>
          )}
          <div className="flex flex-col items-center gap-1">
            <ProgressRing
              value={patient.adherenceCompleted}
              max={patient.adherenceTotal}
              size={44}
              stroke={4}
              mode="adherence"
            />
            <span className="text-[10px] text-neutral-500">Cumplimiento</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <WhatsAppButton url={patient.whatsappGroupUrl} size="lg" />
            <span className="text-[10px] text-neutral-500">WhatsApp</span>
          </div>
        </div>
      </div>

      {isManager ? (
        <button
          onClick={onReassign}
          title="Reasignar fisio"
          className="text-xs px-2 py-1 rounded border border-neutral-200 hover:bg-neutral-50 text-neutral-600"
        >
          ⇄
        </button>
      ) : null}

      <Link href={`/fisio/paciente/${patient.id}`} className="text-neutral-300">→</Link>
    </div>
  );
}

function ReassignModal({
  patient,
  professionals,
  onClose,
  onSaved,
}: {
  patient: Patient;
  professionals: ProInfo[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string>(patient.assignedProfessional?.id ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch("/api/patients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: patient.id,
        assignedProfessionalId: selected || null,
      }),
    });
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-sm w-full p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3">
          <h3 className="font-medium">Asignar fisio</h3>
          <p className="text-xs text-neutral-500 mt-0.5">{patient.fullName}</p>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => setSelected("")}
            className={`block w-full text-left px-3 py-2 rounded-lg border ${
              selected === "" ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 hover:bg-neutral-50"
            }`}
          >
            <div className="text-sm">— Sin asignar —</div>
            <div className="text-xs text-neutral-500 mt-0.5">El paciente aparece en "Por asignar"</div>
          </button>
          {professionals.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={`block w-full text-left px-3 py-2 rounded-lg border ${
                selected === p.id ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 hover:bg-neutral-50"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{ROLE_ICON[p.role] ?? "🩺"}</span>
                <div>
                  <div className="text-sm font-medium">{p.fullName}</div>
                  <div className="text-xs text-neutral-500">
                    {p.role === "head_success" ? "Head-success physio" : p.role === "ceo" ? "CEO" : "Fisioterapeuta"}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="btn btn-ghost text-sm">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn btn-primary text-sm">
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FisioSummary({ patients, isManager }: { patients: Patient[]; isManager: boolean }) {
  const programCounts: Record<string, number> = { RECUPERA: 0, CONSOLIDA: 0, ADVANCE: 0, _none: 0 };
  const difficultyCounts: Record<string, number> = { FACIL: 0, MEDIO: 0, DIFICIL: 0, _none: 0 };

  for (const p of patients) {
    if (p.programType && programCounts[p.programType] !== undefined) {
      programCounts[p.programType]++;
    } else {
      programCounts._none++;
    }
    if (p.difficulty && difficultyCounts[p.difficulty] !== undefined) {
      difficultyCounts[p.difficulty]++;
    } else {
      difficultyCounts._none++;
    }
  }

  return (
    <section className="card mb-3">
      <div className={`grid grid-cols-1 ${isManager ? "sm:grid-cols-2" : ""} gap-4`}>
        <div>
          <h3 className="text-xs uppercase text-neutral-500 font-medium mb-2">Por programa</h3>
          <div className="flex gap-2 flex-wrap">
            {PROGRAM_TYPES.map((key) => {
              const meta = PROGRAM_LABELS[key];
              return (
                <div
                  key={key}
                  className={`flex items-center gap-2 px-2 py-1 rounded-full border ${meta.color}`}
                >
                  <span className="text-xs font-medium">{meta.label}</span>
                  <span className="text-sm font-semibold tabular-nums">{programCounts[key]}</span>
                </div>
              );
            })}
            {programCounts._none > 0 && (
              <div className="flex items-center gap-2 px-2 py-1 rounded-full border bg-neutral-50 border-neutral-200 text-neutral-500">
                <span className="text-xs">Sin definir</span>
                <span className="text-sm font-semibold tabular-nums">{programCounts._none}</span>
              </div>
            )}
          </div>
        </div>
        {isManager && (
          <div>
            <h3 className="text-xs uppercase text-neutral-500 font-medium mb-2">Por dificultad</h3>
            <div className="flex gap-2 flex-wrap">
              {DIFFICULTIES.map((key) => {
                const meta = DIFFICULTY_LABELS[key];
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-2 px-2 py-1 rounded-full border ${meta.color}`}
                  >
                    <span className="text-xs font-medium">{meta.label}</span>
                    <span className="text-sm font-semibold tabular-nums">{difficultyCounts[key]}</span>
                  </div>
                );
              })}
              {difficultyCounts._none > 0 && (
                <div className="flex items-center gap-2 px-2 py-1 rounded-full border bg-neutral-50 border-neutral-200 text-neutral-500">
                  <span className="text-xs">Sin definir</span>
                  <span className="text-sm font-semibold tabular-nums">{difficultyCounts._none}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function CreatePatientModal({
  professionals,
  rollingPrograms,
  onClose,
  onCreated,
}: {
  professionals: ProInfo[];
  rollingPrograms: { id: string; name: string }[];
  onClose: () => void;
  onCreated: (patientId: string) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [assignedProfessionalId, setAssignedProfessionalId] = useState("");
  const [programType, setProgramType] = useState("RECUPERA");
  const [programMode, setProgramMode] = useState<"fixed" | "rolling">("fixed");
  const [rollingProgramId, setRollingProgramId] = useState("");
  const [subscriptionPeriodMonths, setSubscriptionPeriodMonths] = useState("4");
  const [amountPaid, setAmountPaid] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ── Generación de link de pago Stripe (alternativa a "Crear paciente") ──
  // Si el CEO/head/fisio prefiere que el paciente pague online en vez de
  // marcar el cobro manualmente, abrimos esta sección. Cuando paga, el
  // webhook Stripe convierte el Lead → Patient heredando phone/instagram.
  const [showStripe, setShowStripe] = useState(false);
  const [stripePrice, setStripePrice] = useState("");
  const [stripeSuggested, setStripeSuggested] = useState<number | null>(null);
  const [loadingStripePrice, setLoadingStripePrice] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<{ url: string; productLabel: string } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Stripe solo tiene precios configurados para RECUPERA/CONSOLIDA × 4M/6M.
  // Cualquier otro programa o duración → el botón de Stripe queda deshabilitado.
  const canStripe =
    (programType === "RECUPERA" || programType === "CONSOLIDA") &&
    (subscriptionPeriodMonths === "4" || subscriptionPeriodMonths === "6");
  const productCode = canStripe
    ? (`${programType}_${subscriptionPeriodMonths}M` as
        | "RECUPERA_4M"
        | "RECUPERA_6M"
        | "CONSOLIDA_4M"
        | "CONSOLIDA_6M")
    : null;

  // Al abrir la sección Stripe (o cambiar programa/duración con la sección
  // abierta), consultamos el precio sugerido y prellenamos el input.
  useEffect(() => {
    if (!showStripe || !productCode) return;
    let cancelled = false;
    setLoadingStripePrice(true);
    fetch(`/api/products/price-suggestion?productCode=${productCode}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (typeof data?.amountCents === "number") {
          setStripeSuggested(data.amountCents);
          setStripePrice((data.amountCents / 100).toFixed(2).replace(".", ","));
        } else {
          setStripeSuggested(null);
        }
      })
      .catch(() => {
        if (!cancelled) setStripeSuggested(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingStripePrice(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showStripe, productCode]);

  function buildWhatsAppLink(fullUrl: string): string | null {
    if (!phone.trim()) return null;
    const raw = phone.replace(/[^\d+]/g, "");
    if (!raw) return null;
    const first = fullName.split(" ")[0] || "";
    const msg = `Hola ${first}, aquí tienes tu link para contratar el programa: ${fullUrl}`;
    return `https://wa.me/${raw.replace(/^\+/, "")}?text=${encodeURIComponent(msg)}`;
  }

  async function copyLink(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {}
  }

  async function generateStripeLink() {
    setError("");
    if (!fullName.trim()) {
      setError("El nombre es obligatorio para generar el link");
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setError("Indica al menos email o teléfono para el lead");
      return;
    }
    if (!productCode) {
      setError("Stripe solo soporta RECUPERA o CONSOLIDA en 4 o 6 meses");
      return;
    }
    const amountEuros = stripePrice ? Number(stripePrice.replace(",", ".")) : NaN;
    if (!Number.isFinite(amountEuros) || amountEuros <= 0) {
      setError("Indica un importe válido (> 0)");
      return;
    }
    setGeneratingLink(true);
    try {
      const res = await fetch("/api/leads/manual-payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          productCode,
          amountEuros,
          // Extras del form: cuando pague, el webhook los aplica al Patient
          // para que el alta quede exactamente como la diseñaste aquí.
          assignedProfessionalId: assignedProfessionalId || undefined,
          diagnosis: diagnosis.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo generar el link");
      const fullUrl = `https://app.fisiofitteam.com${data.landingUrl}`;
      setGeneratedLink({ url: fullUrl, productLabel: data.productLabel });
      // Si hay teléfono, abrir WhatsApp en otra pestaña con el mensaje listo.
      const wa = buildWhatsAppLink(fullUrl);
      if (wa) window.open(wa, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setError(e?.message || "Error generando link");
    } finally {
      setGeneratingLink(false);
    }
  }

  // Si cambia el programType a algo distinto de ADVANCE, forzar modo fijo
  function selectProgramType(p: string) {
    setProgramType(p);
    if (p !== "ADVANCE") {
      setProgramMode("fixed");
      setRollingProgramId("");
    }
  }

  async function save() {
    setError("");
    if (!fullName.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    if (!email.trim()) {
      setError("El email es obligatorio para que el paciente pueda entrar a la app");
      return;
    }
    if (programMode === "rolling" && !rollingProgramId) {
      setError("Selecciona un programa rolling al que enchufar al paciente");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/patients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        shippingPhone: phone.trim() || null,
        diagnosis: diagnosis.trim() || null,
        assignedProfessionalId: assignedProfessionalId || null,
        programType,
        programMode,
        rollingProgramId: programMode === "rolling" ? rollingProgramId : null,
        subscriptionPeriodMonths,
        amountPaid: amountPaid || null,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      onCreated(data.patientId);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se ha podido crear el paciente");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[92vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-semibold text-base">Nuevo paciente</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Crea un paciente nuevo. Le llegará un código por email cuando intente entrar a la app.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Nombre completo *</label>
            <input
              type="text"
              required
              autoFocus
              className="input text-sm w-full"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ej. Marta García"
            />
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Email * (para acceso a la app)</label>
            <input
              type="email"
              required
              className="input text-sm w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="atleta@email.com"
            />
            <p className="text-[10px] text-neutral-500 mt-1 italic">
              Es el email con el que recibirá el código de acceso.
            </p>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Teléfono / WhatsApp (opcional)</label>
            <input
              type="tel"
              className="input text-sm w-full"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+34 600 123 456"
            />
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Diagnóstico breve (opcional)</label>
            <input
              type="text"
              className="input text-sm w-full"
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              placeholder="Ej. Dolor lumbar tras intensidad alta"
            />
          </div>

          {professionals.length > 0 ? (
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Fisio asignado</label>
              <select
                className="input text-sm w-full"
                value={assignedProfessionalId}
                onChange={(e) => setAssignedProfessionalId(e.target.value)}
              >
                <option value="">— Sin asignar (asignar luego) —</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.role === "head_success" ? "⭐ " : "🩺 "}{p.fullName}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="text-xs text-neutral-600 bg-neutral-50 border border-neutral-200 rounded px-3 py-2">
              Se te asignará automáticamente como fisio de este paciente.
            </div>
          )}

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Programa contratado</label>
            <div className="flex gap-1">
              {["RECUPERA", "CONSOLIDA", "ADVANCE"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => selectProgramType(p)}
                  className={`flex-1 text-xs px-2 py-2 rounded border font-medium ${
                    programType === p ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {programType === "ADVANCE" && rollingPrograms.length > 0 && (
            <div className="rounded-lg p-3" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
              <label className="text-xs text-neutral-500 block mb-2 font-medium">Modo del programa</label>
              <div className="flex gap-1 mb-3">
                <button
                  type="button"
                  onClick={() => setProgramMode("fixed")}
                  className={`flex-1 text-xs px-2 py-2 rounded border font-medium ${
                    programMode === "fixed" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200"
                  }`}
                >
                  Individual (fijo)
                </button>
                <button
                  type="button"
                  onClick={() => setProgramMode("rolling")}
                  className={`flex-1 text-xs px-2 py-2 rounded border font-medium ${
                    programMode === "rolling" ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200"
                  }`}
                >
                  Rolling (tiempo corrido)
                </button>
              </div>

              {programMode === "rolling" && (
                <>
                  <label className="text-xs text-neutral-500 block mb-1">Programa rolling *</label>
                  <select
                    className="input text-sm w-full"
                    value={rollingProgramId}
                    onChange={(e) => setRollingProgramId(e.target.value)}
                  >
                    <option value="">— Selecciona uno —</option>
                    {rollingPrograms.map((rp) => (
                      <option key={rp.id} value={rp.id}>{rp.name}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-neutral-500 mt-1 italic">
                    El paciente verá la semana actual del calendario, sin métricas, sin pausas.
                  </p>
                </>
              )}

              {programMode === "fixed" && (
                <p className="text-[10px] text-neutral-500 italic">
                  Programa individual con su propio contador de semanas, métricas y posibilidad de pausas.
                </p>
              )}
            </div>
          )}

          {programType === "ADVANCE" && rollingPrograms.length === 0 && (
            <div className="rounded-lg p-3 text-xs" style={{ background: "#FEF3C7", border: "1px solid #FCD34D", color: "#7C2D12" }}>
              Aún no has creado programas rolling.{" "}
              <a href="/fisio/biblioteca/rolling" className="font-medium underline">Crear el primero</a> para poder enchufar pacientes ADVANCE a rolling.
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Duración (meses)</label>
              <select
                className="input text-sm w-full"
                value={subscriptionPeriodMonths}
                onChange={(e) => setSubscriptionPeriodMonths(e.target.value)}
              >
                <option value="1">1 mes</option>
                <option value="2">2 meses</option>
                <option value="3">3 meses</option>
                <option value="4">4 meses</option>
                <option value="6">6 meses</option>
                <option value="12">12 meses</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Importe (€) (opcional)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input text-sm w-full"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>

          {amountPaid && Number(amountPaid) > 0 && (
            <p className="text-[11px] text-neutral-500 italic">
              💰 Se registrará automáticamente como ingreso "Nueva alta" en Finanzas.
            </p>
          )}

          {error && !generatedLink && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {!generatedLink && (
            <button
              onClick={save}
              disabled={saving || !fullName.trim() || !email.trim()}
              className="btn btn-accent w-full disabled:opacity-50"
              style={{
                background: "#0A0A0A",
                color: "#FAFAFA",
                padding: "11px",
                borderRadius: 10,
                fontWeight: 500,
                fontSize: 14,
                border: "none",
                cursor: saving ? "wait" : "pointer",
                width: "100%",
              }}
            >
              {saving ? "Creando..." : "Crear paciente"}
            </button>
          )}

          {/* ── Alternativa: link de pago Stripe ────────────────────────── */}
          {!generatedLink && (
            <div className="border-t border-neutral-200 pt-3 mt-1">
              {!showStripe ? (
                <button
                  type="button"
                  onClick={() => setShowStripe(true)}
                  className="text-xs text-neutral-600 hover:text-neutral-900 underline"
                  title="En vez de crear el paciente ya, genera un link Stripe. Cuando pague, el paciente se crea automáticamente."
                >
                  💳 ¿Prefieres que pague online con Stripe?
                </button>
              ) : (
                <div className="rounded-lg p-3 space-y-2" style={{ background: "#F0F9FF", border: "1px solid #BAE6FD" }}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-semibold" style={{ color: "#075985" }}>
                      💳 Link de pago Stripe
                    </p>
                    <button
                      type="button"
                      onClick={() => { setShowStripe(false); setStripePrice(""); setError(""); }}
                      className="text-[11px]"
                      style={{ color: "#0369A1" }}
                    >
                      cancelar
                    </button>
                  </div>
                  <p className="text-[11px]" style={{ color: "#0C4A6E" }}>
                    En vez de marcar el cobro aquí, generamos un link Stripe.
                    Cuando el paciente pague, el alta se crea sola con los
                    datos que has rellenado arriba (nombre, email, teléfono,
                    fisio asignado, diagnóstico).
                  </p>
                  {!canStripe && (
                    <div className="text-xs px-2 py-1.5 rounded" style={{ background: "#FEF3C7", color: "#7C2D12", border: "1px solid #FCD34D" }}>
                      Stripe solo está configurado para RECUPERA o CONSOLIDA en
                      4 o 6 meses. Ajusta programa y duración para activarlo.
                    </div>
                  )}
                  {canStripe && (
                    <>
                      <div className="text-[11px]" style={{ color: "#075985" }}>
                        Producto: <strong>{productCode}</strong>
                      </div>
                      <div>
                        <label className="text-[11px] block mb-1" style={{ color: "#0C4A6E" }}>
                          Importe a cobrar (€)
                          {loadingStripePrice && <span className="italic ml-1">· consultando sugerido…</span>}
                          {!loadingStripePrice && stripeSuggested !== null && (
                            <span className="italic ml-1">
                              · sugerido {(stripeSuggested / 100).toFixed(2).replace(".", ",")} €
                            </span>
                          )}
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="input text-sm w-full"
                          value={stripePrice}
                          onChange={(e) => setStripePrice(e.target.value.replace(/[^\d.,]/g, ""))}
                          placeholder="Ej: 749 o 749,00"
                        />
                      </div>
                      {error && (
                        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                          {error}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={generateStripeLink}
                        disabled={generatingLink || !stripePrice.trim()}
                        className="w-full text-sm font-semibold rounded-lg py-2 disabled:opacity-50"
                        style={{ background: "#0369A1", color: "#FFFFFF", border: "none" }}
                      >
                        {generatingLink ? "Generando link…" : "✨ Generar link de pago"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Resultado: link generado ───────────────────────────────── */}
          {generatedLink && (
            <div className="space-y-3">
              <div className="rounded-lg p-3" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
                <p className="text-sm font-medium" style={{ color: "#065F46" }}>✓ Link generado</p>
                <p className="text-xs mt-1" style={{ color: "#047857" }}>
                  {generatedLink.productLabel} · válido 3 días. Cuando el
                  paciente pague, el alta se hace sola.
                </p>
              </div>
              {phone.trim() && (
                <div className="rounded-lg p-3 text-xs" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#1E3A8A" }}>
                  📱 Te he abierto WhatsApp en otra pestaña con el mensaje listo.
                </div>
              )}
              <div>
                <label className="text-xs text-neutral-500 block mb-1">URL del link</label>
                <div className="flex gap-2">
                  <input
                    className="input text-xs flex-1"
                    value={generatedLink.url}
                    readOnly
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    onClick={() => copyLink(generatedLink.url)}
                    className="btn btn-primary text-xs whitespace-nowrap"
                  >
                    {linkCopied ? "✓ Copiado" : "Copiar"}
                  </button>
                </div>
              </div>
              <button
                onClick={onClose}
                className="btn w-full text-sm"
                style={{ background: "#0A0A0A", color: "#FAFAFA", padding: "10px", borderRadius: 10 }}
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
