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
      </div>

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
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold tabular-nums">
          {planCfg ? planCfg.label : sub.plan} ·{" "}
          {(sub.amountCents / 100).toFixed(0)} {sub.currency.toUpperCase()}
        </div>
        {nextEvent && (
          <div className="text-[11px] text-neutral-500">{nextEvent}</div>
        )}
        {sub.originSource && (
          <div className="text-[10px] text-neutral-400 mt-0.5">
            🎯 {sub.originSource}
          </div>
        )}
      </div>
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}
