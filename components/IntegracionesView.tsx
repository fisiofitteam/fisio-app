"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type OrganizationalConnection = {
  googleEmail: string;
  googleName: string | null;
  connectedByName: string | null;
  createdAt: string;
};

type PersonalConnection = {
  googleEmail: string;
  googleName: string | null;
  createdAt: string;
};

export function IntegracionesView({
  showOrganizational,
  organizationalConnection,
  personalConnection,
  flashSuccess,
  flashMode,
  flashError,
}: {
  showOrganizational: boolean;
  organizationalConnection: OrganizationalConnection | null;
  personalConnection: PersonalConnection | null;
  flashSuccess: boolean;
  flashMode: string | null;
  flashError: string | null;
}) {
  const router = useRouter();
  const [disconnectingOrg, setDisconnectingOrg] = useState(false);
  const [disconnectingMy, setDisconnectingMy] = useState(false);

  async function disconnect(scope: "organizational" | "personal") {
    const msg = scope === "organizational"
      ? "¿Desconectar la cuenta compartida (videoconsultas)?\n\nLa app dejará de poder gestionar la agenda compartida hasta reconectar."
      : "¿Desconectar tu cuenta de Google?\n\nLa app dejará de mostrar tus slots libres para pacientes y no podrá bajar transcripciones de tus llamadas.";
    if (!confirm(msg)) return;

    const setter = scope === "organizational" ? setDisconnectingOrg : setDisconnectingMy;
    setter(true);
    const res = await fetch(`/api/google/status?scope=${scope}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    } else {
      alert("No se pudo desconectar. Intenta de nuevo.");
      setter(false);
    }
  }

  const flashLabel = flashMode === "personal" ? "tu cuenta de Google" : "Google Calendar (compartida)";

  return (
    <div className="space-y-3">
      {flashSuccess && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "#ECFDF5", color: "#065F46", border: "1px solid #10B981" }}>
          ✓ Conectado correctamente: {flashLabel}
        </div>
      )}
      {flashError && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "#FEF2F2", color: "#991B1B", border: "1px solid #F87171" }}>
          Error al conectar: {flashError}
        </div>
      )}

      {/* ── Conexión organizacional (solo managers) ─────────────────────── */}
      {showOrganizational && (
        <section className="card">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
              📅
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-medium">Google Calendar · Cuenta compartida</h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Agenda de <strong>videoconsultas@fisiofitteam.com</strong> — la usan las llamadas de venta y el auto-agendamiento público.
              </p>
            </div>
          </div>

          {organizationalConnection ? (
            <ConnectedCard
              email={organizationalConnection.googleEmail}
              name={organizationalConnection.googleName}
              subline={`Conectado por ${organizationalConnection.connectedByName || "—"} el ${new Date(organizationalConnection.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}`}
              onDisconnect={() => disconnect("organizational")}
              disconnecting={disconnectingOrg}
            />
          ) : (
            <ConnectCta
              hint="Loguéate con videoconsultas@fisiofitteam.com cuando Google te lo pida."
              href="/api/google/connect"
              label="Conectar cuenta compartida"
            />
          )}
        </section>
      )}

      {/* ── Conexión personal del usuario logueado ─────────────────────── */}
      <section className="card">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0" style={{ background: "#EEF2FF", border: "1px solid #C7D2FE" }}>
            👤
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-medium">Mi cuenta de Google</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Necesaria para que la app lea tu calendario personal (slots libres) y baje las transcripciones de tus llamadas de optimización/renovación con pacientes.
            </p>
          </div>
        </div>

        {personalConnection ? (
          <ConnectedCard
            email={personalConnection.googleEmail}
            name={personalConnection.googleName}
            subline={`Conectada el ${new Date(personalConnection.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}`}
            onDisconnect={() => disconnect("personal")}
            disconnecting={disconnectingMy}
          />
        ) : (
          <ConnectCta
            hint="Loguéate con tu cuenta @fisiofitteam.com (la del team). No uses tu Gmail personal — Meet no expone transcripciones desde cuentas personales."
            href="/api/google/connect?mode=personal"
            label="Conectar mi Google"
          />
        )}
      </section>

      <p className="text-[11px] text-neutral-500 italic px-1">
        Más integraciones próximamente (Meta Pixel, etc.)
      </p>
    </div>
  );
}

function ConnectedCard({ email, name, subline, onDisconnect, disconnecting }: {
  email: string; name: string | null; subline: string; onDisconnect: () => void; disconnecting: boolean;
}) {
  return (
    <div className="rounded-lg p-3" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: "#15803D", color: "#FFFFFF" }}>
              CONECTADO
            </span>
          </div>
          <div className="text-sm font-medium">{email}</div>
          {name && <div className="text-xs" style={{ color: "#525252" }}>{name}</div>}
          <div className="text-[11px] mt-1.5" style={{ color: "#737373" }}>{subline}</div>
        </div>
        <button
          onClick={onDisconnect}
          disabled={disconnecting}
          className="text-xs text-red-600 hover:underline shrink-0"
        >
          {disconnecting ? "Desconectando…" : "Desconectar"}
        </button>
      </div>
    </div>
  );
}

function ConnectCta({ hint, href, label }: { hint: string; href: string; label: string }) {
  return (
    <div>
      <div className="rounded-lg p-3 mb-3" style={{ background: "#FAFAFA", border: "1px dashed #D4D4D4" }}>
        <p className="text-[11px]" style={{ color: "#525252" }}>💡 {hint}</p>
      </div>
      <a
        href={href}
        className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg"
        style={{ background: "#0A0A0A", color: "#FAFAFA" }}
      >
        <span>🔗</span>
        {label}
      </a>
    </div>
  );
}
