"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PREVENTION_PLAN_CONFIG } from "@/lib/stripe";

type ProgramRow = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  patientsCount: number;
  weeksCount: number;
};

type SubscriberRow = {
  id: string;
  patient: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    programType: string | null;
  };
  plan: string;
  status: string;
  amountCents: number;
  currency: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  scheduledStartAt: string | null;
  cancelAtPeriodEnd: boolean;
  originSource: string | null;
  createdAt: string;
};

/**
 * Panel admin de FisioFit Prevention dentro de /fisio/advance.
 * Dos sub-pestañas:
 *  - Rolling Prevention: catálogo de programas rolling con role="prevention".
 *  - Suscriptores: lista de pacientes con PatientSubscription activa/histórica.
 */
export function PreventionAdminPanel({
  activeTab,
  programs,
  subscribers,
}: {
  activeTab: "rolling" | "suscriptores";
  programs: ProgramRow[];
  subscribers: SubscriberRow[];
}) {
  const router = useRouter();

  function switchTab(tab: "rolling" | "suscriptores") {
    const url = new URL(window.location.href);
    if (tab === "rolling") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    router.push(url.pathname + url.search);
    router.refresh();
  }

  const activeSubs = subscribers.filter((s) =>
    ["scheduled", "trialing", "active", "past_due"].includes(s.status)
  );

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-base font-semibold">🛡 FisioFit Prevention</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Servicio low-ticket recurrente para atletas ya sanos que quieren
          mantenerse. Cobro por suscripción (trimestral · semestral · anual)
          gestionado por Stripe. Sin fisio asignado.
        </p>
      </header>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-neutral-200">
        <TabButton
          active={activeTab === "rolling"}
          onClick={() => switchTab("rolling")}
          label={`⚡ Rolling Prevention (${programs.length})`}
        />
        <TabButton
          active={activeTab === "suscriptores"}
          onClick={() => switchTab("suscriptores")}
          label={`👥 Suscriptores (${activeSubs.length})`}
        />
      </div>

      {activeTab === "rolling" && <RollingCatalog programs={programs} />}
      {activeTab === "suscriptores" && <SubscribersList subscribers={subscribers} />}
    </section>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
        active
          ? "border-neutral-900 text-neutral-900"
          : "border-transparent text-neutral-500 hover:text-neutral-900"
      }`}
    >
      {label}
    </button>
  );
}

// ─── Catálogo de Rolling Prevention ─────────────────────────────────────────

function RollingCatalog({ programs }: { programs: ProgramRow[] }) {
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <p className="text-sm text-neutral-500">
          Estos programas se sirven a los suscriptores Prevention. Comparten
          motor con Rolling de Advance (mismo editor, mismo generador IA).
        </p>
        <button
          onClick={() => setCreating(true)}
          className="text-xs font-medium px-3 py-1.5 rounded-lg"
          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
        >
          + Nuevo programa Prevention
        </button>
      </div>

      {programs.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{ background: "#FAFAFA", border: "1px dashed #D4D4D4" }}
        >
          <div className="text-3xl mb-2">🛡</div>
          <p className="text-sm text-neutral-600">
            Aún no hay programas Prevention. Crea el primero para tener un
            canal de contenido semanal que servir a los suscriptores.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {programs.map((p) => (
            <Link
              key={p.id}
              href={`/fisio/advance/rolling/${p.id}`}
              className="rounded-2xl p-4 block hover:bg-neutral-50 transition-colors"
              style={{ background: "#FFFFFF", border: "1px solid #E5E5E5" }}
            >
              <div className="flex items-start justify-between mb-1 gap-2">
                <h3 className="font-semibold text-sm">{p.name}</h3>
                {!p.isActive && (
                  <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">
                    ARCHIVADO
                  </span>
                )}
              </div>
              {p.description && (
                <p className="text-xs text-neutral-500 line-clamp-2 mb-2">{p.description}</p>
              )}
              <div className="text-[11px] text-neutral-500">
                {p.patientsCount} suscriptor{p.patientsCount === 1 ? "" : "es"} ·{" "}
                {p.weeksCount} semana{p.weeksCount === 1 ? "" : "s"} programada
                {p.weeksCount === 1 ? "" : "s"}
              </div>
            </Link>
          ))}
        </div>
      )}

      {creating && <CreatePreventionProgramModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreatePreventionProgramModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!name.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/rolling-programs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || null,
        role: "prevention",
      }),
    });
    if (res.ok) {
      window.location.reload();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se pudo crear");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-semibold">Nuevo programa Prevention</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Contenedor de contenido semanal para los suscriptores Prevention. El
          editor y el generador IA son los mismos que en Advance rolling.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Nombre *</label>
            <input
              type="text"
              autoFocus
              className="input text-sm w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Prevention Base, Prevention Movilidad…"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Descripción (opcional)</label>
            <textarea
              className="input text-sm w-full"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enfoque, para quién es…"
              rows={3}
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="w-full text-sm font-medium py-2.5 rounded-lg"
            style={{
              background: "#0A0A0A",
              color: "#FAFAFA",
              opacity: saving ? 0.5 : 1,
              cursor: saving ? "wait" : "pointer",
            }}
          >
            {saving ? "Creando…" : "Crear programa"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Lista de suscriptores ──────────────────────────────────────────────────

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  scheduled: { label: "Programada", color: "bg-blue-50 text-blue-800 border-blue-200" },
  trialing: { label: "En prueba", color: "bg-violet-50 text-violet-800 border-violet-200" },
  active: { label: "Activa", color: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  past_due: { label: "Pago fallido", color: "bg-amber-50 text-amber-800 border-amber-200" },
  unpaid: { label: "Impago", color: "bg-red-50 text-red-800 border-red-200" },
  canceled: { label: "Cancelada", color: "bg-neutral-100 text-neutral-600 border-neutral-300" },
  finished: { label: "Finalizada", color: "bg-neutral-100 text-neutral-600 border-neutral-300" },
};

function SubscribersList({ subscribers }: { subscribers: SubscriberRow[] }) {
  const [filter, setFilter] = useState<"all" | "active" | "history">("active");
  const [adding, setAdding] = useState(false);

  const filtered = subscribers.filter((s) => {
    if (filter === "all") return true;
    if (filter === "active") return ["scheduled", "trialing", "active", "past_due"].includes(s.status);
    if (filter === "history") return ["canceled", "finished", "unpaid"].includes(s.status);
    return true;
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <p className="text-sm text-neutral-500">
          {filtered.length} suscriptor{filtered.length === 1 ? "" : "es"} · Estado, plan y próximo cobro.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <FilterChip active={filter === "active"} onClick={() => setFilter("active")}>
              Activos
            </FilterChip>
            <FilterChip active={filter === "history"} onClick={() => setFilter("history")}>
              Histórico
            </FilterChip>
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
              Todos
            </FilterChip>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg"
            style={{ background: "#0A0A0A", color: "#FAFAFA" }}
          >
            + Añadir manual
          </button>
        </div>
      </div>

      {adding && <AddManualSubscriberModal onClose={() => setAdding(false)} />}

      {filtered.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{ background: "#FAFAFA", border: "1px dashed #D4D4D4" }}
        >
          <div className="text-3xl mb-2">👥</div>
          <p className="text-sm text-neutral-600">
            Aún no hay suscriptores en este estado. Cuando alguien pague por
            la landing (Sprint 4) aparecerá aquí.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden border border-neutral-200">
          <div className="divide-y divide-neutral-100">
            {filtered.map((s) => (
              <SubscriberRow key={s.id} sub={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium border ${
        active
          ? "bg-neutral-900 text-white border-neutral-900"
          : "bg-white border-neutral-200 text-neutral-600 hover:border-neutral-400"
      }`}
    >
      {children}
    </button>
  );
}

function SubscriberRow({ sub }: { sub: SubscriberRow }) {
  const statusMeta = STATUS_LABEL[sub.status] ?? {
    label: sub.status,
    color: "bg-neutral-100 text-neutral-700 border-neutral-300",
  };
  const planCfg = (PREVENTION_PLAN_CONFIG as any)[sub.plan];
  const nextEvent =
    sub.status === "scheduled" && sub.scheduledStartAt
      ? `Arranca ${fmtDate(sub.scheduledStartAt)}`
      : sub.status === "trialing" && sub.trialEndsAt
        ? `Fin de prueba ${fmtDate(sub.trialEndsAt)}`
        : sub.currentPeriodEnd
          ? `${sub.cancelAtPeriodEnd ? "Termina" : "Renueva"} ${fmtDate(sub.currentPeriodEnd)}`
          : null;

  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function resendAccess() {
    if (!sub.patient.email) {
      setResendMsg({ ok: false, text: "El paciente no tiene email en su ficha." });
      return;
    }
    setResending(true);
    setResendMsg(null);
    try {
      const res = await fetch(`/api/prevention/subscribers/${sub.id}/resend-access`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setResendMsg({
          ok: true,
          text: data.previewMode ? "Modo preview (log)" : `Enviado a ${data.sentTo}`,
        });
      } else {
        setResendMsg({ ok: false, text: data.error || "No se ha podido enviar" });
      }
    } catch (e: any) {
      setResendMsg({ ok: false, text: e?.message || "Error de red" });
    } finally {
      setResending(false);
      // Escondemos el mensaje tras 4s
      setTimeout(() => setResendMsg(null), 4000);
    }
  }

  return (
    <div className="p-3 flex items-center gap-3 flex-wrap">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/fisio/paciente/${sub.patient.id}/ficha`}
            className="font-medium text-sm hover:underline"
          >
            {sub.patient.fullName}
          </Link>
          <span
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusMeta.color}`}
          >
            {statusMeta.label}
          </span>
          {sub.cancelAtPeriodEnd && sub.status === "active" && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-200">
              No renueva
            </span>
          )}
        </div>
        <div className="text-[11px] text-neutral-500 mt-0.5 truncate">
          {sub.patient.email ?? "—"} {sub.patient.phone && `· ${sub.patient.phone}`}
        </div>
        {resendMsg && (
          <div
            className={`text-[11px] mt-1 ${resendMsg.ok ? "text-emerald-700" : "text-red-600"}`}
          >
            {resendMsg.ok ? "✓ " : "✗ "}
            {resendMsg.text}
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold tabular-nums">
          {planCfg
            ? planCfg.label
            : sub.plan === "indefinite"
              ? "Indefinida"
              : sub.plan}{" "}
          · {sub.amountCents === 0 ? "manual" : `${(sub.amountCents / 100).toFixed(0)} ${sub.currency.toUpperCase()}`}
        </div>
        {nextEvent && (
          <div className="text-[11px] text-neutral-500">{nextEvent}</div>
        )}
        {sub.originSource && (
          <div className="text-[10px] text-neutral-400 mt-0.5">
            🎯 {sub.originSource}
          </div>
        )}
        <button
          onClick={resendAccess}
          disabled={resending || !sub.patient.email}
          title={sub.patient.email ? "Reenviar magic link por email" : "Sin email en la ficha"}
          className="mt-1.5 text-[10px] font-medium px-2 py-1 rounded border border-neutral-200 hover:border-neutral-400 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {resending ? "Enviando…" : "📧 Reenviar acceso"}
        </button>
      </div>
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Modal: añadir suscriptor manual ────────────────────────────────────────

type PatientHit = {
  id: string;
  fullName: string;
  programType: string | null;
  diagnosis: string | null;
};

function AddManualSubscriberModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"new" | "existing">("new");

  // Modo nuevo
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Modo existente
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PatientHit[]>([]);
  const [selected, setSelected] = useState<PatientHit | null>(null);
  const [searching, setSearching] = useState(false);

  // Comunes
  const [plan, setPlan] = useState<"quarterly" | "semiannual" | "annual" | "indefinite">("semiannual");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [originSource, setOriginSource] = useState("");
  const [sendWelcome, setSendWelcome] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function runSearch(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setHits(await res.json());
    } finally {
      setSearching(false);
    }
  }

  async function save() {
    setError("");
    if (mode === "new" && !fullName.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    if (mode === "existing" && !selected) {
      setError("Selecciona un paciente");
      return;
    }
    setSaving(true);
    const payload: any = {
      plan,
      startDate,
      originSource: originSource.trim() || undefined,
      sendWelcome,
    };
    if (mode === "existing") {
      payload.patientId = selected!.id;
    } else {
      payload.fullName = fullName.trim();
      if (email.trim()) payload.email = email.trim();
      if (phone.trim()) payload.phone = phone.trim();
    }
    const res = await fetch("/api/prevention/manual-subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      window.location.reload();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se pudo crear");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-semibold">Añadir suscriptor manual</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Alta sin cobro (cortesía, regalo, beta). Marca el paciente como
          Prevention y le crea una suscripción activa sin pasar por Stripe.
        </p>

        {/* Toggle nuevo / existente */}
        <div className="flex gap-1 mb-4 p-1 rounded-lg bg-neutral-100">
          <button
            onClick={() => setMode("new")}
            className={`flex-1 text-xs font-medium py-1.5 rounded ${
              mode === "new" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500"
            }`}
          >
            Paciente nuevo
          </button>
          <button
            onClick={() => setMode("existing")}
            className={`flex-1 text-xs font-medium py-1.5 rounded ${
              mode === "existing" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500"
            }`}
          >
            Paciente existente
          </button>
        </div>

        <div className="space-y-3">
          {mode === "new" ? (
            <>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Nombre completo *</label>
                <input
                  type="text"
                  autoFocus
                  className="input text-sm w-full"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-neutral-500 block mb-1">Email</label>
                  <input
                    type="email"
                    className="input text-sm w-full"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="opcional"
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-500 block mb-1">Teléfono</label>
                  <input
                    type="tel"
                    className="input text-sm w-full"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="opcional"
                  />
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Buscar paciente</label>
              <input
                type="text"
                autoFocus
                className="input text-sm w-full"
                value={query}
                onChange={(e) => {
                  setSelected(null);
                  runSearch(e.target.value);
                }}
                placeholder="Escribe al menos 2 letras…"
              />
              {selected ? (
                <div className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 flex justify-between items-center">
                  <div>
                    <div className="text-sm font-medium text-emerald-900">{selected.fullName}</div>
                    <div className="text-[11px] text-emerald-700">
                      {selected.programType ?? "sin programa"}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="text-xs text-emerald-800 underline"
                  >
                    cambiar
                  </button>
                </div>
              ) : (
                query.trim().length >= 2 && (
                  <div className="mt-2 border border-neutral-200 rounded-lg max-h-40 overflow-y-auto">
                    {searching && <div className="p-2 text-xs text-neutral-400">Buscando…</div>}
                    {!searching && hits.length === 0 && (
                      <div className="p-2 text-xs text-neutral-400">Sin resultados</div>
                    )}
                    {hits.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSelected(p)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 border-b border-neutral-100 last:border-b-0"
                      >
                        <div className="font-medium">{p.fullName}</div>
                        <div className="text-[11px] text-neutral-500">
                          {p.programType ?? "sin programa"}
                        </div>
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Plan *</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { key: "quarterly", label: "Trimestral (3m)" },
                  { key: "semiannual", label: "Semestral (6m)" },
                  { key: "annual", label: "Anual (12m)" },
                  { key: "indefinite", label: "Indefinida" },
                ] as const
              ).map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPlan(p.key)}
                  className={`text-xs font-medium py-2 rounded-lg border ${
                    plan === p.key
                      ? "bg-neutral-900 text-white border-neutral-900"
                      : "bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Fecha de inicio *</label>
            <input
              type="date"
              className="input text-sm w-full"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            {plan !== "indefinite" && (
              <p className="text-[11px] text-neutral-400 mt-1">
                Termina el {previewEnd(startDate, plan)}.
              </p>
            )}
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Origen (opcional)</label>
            <input
              type="text"
              className="input text-sm w-full"
              value={originSource}
              onChange={(e) => setOriginSource(e.target.value)}
              placeholder="regalo, beta, embajador… (default: manual)"
            />
          </div>

          <label className="flex items-start gap-2 text-xs text-neutral-700 cursor-pointer select-none rounded-lg bg-emerald-50 border border-emerald-200 p-3">
            <input
              type="checkbox"
              checked={sendWelcome}
              onChange={(e) => setSendWelcome(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <strong className="text-emerald-900">Enviar email de bienvenida con acceso 1-clic</strong>
              <span className="block text-[11px] text-emerald-700/80 mt-0.5">
                Le llega un email con el link mágico — entra sin códigos ni contraseñas.
                {mode === "new" ? " Solo se envía si has puesto email." : ""}
              </span>
            </span>
          </label>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            onClick={save}
            disabled={saving}
            className="w-full text-sm font-medium py-2.5 rounded-lg"
            style={{
              background: "#10B981",
              color: "#FFFFFF",
              opacity: saving ? 0.5 : 1,
              cursor: saving ? "wait" : "pointer",
            }}
          >
            {saving ? "Creando…" : "Crear suscripción manual"}
          </button>
        </div>
      </div>
    </div>
  );
}

function previewEnd(startISO: string, plan: "quarterly" | "semiannual" | "annual"): string {
  const months = plan === "quarterly" ? 3 : plan === "semiannual" ? 6 : 12;
  const d = new Date(startISO);
  if (isNaN(d.getTime())) return "—";
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}
