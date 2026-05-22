"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type GoogleConnection = {
  googleEmail: string;
  googleName: string | null;
  connectedByName: string | null;
  createdAt: string;
};

export function IntegracionesView({
  googleConnection,
  flashSuccess,
  flashError,
}: {
  googleConnection: GoogleConnection | null;
  flashSuccess: boolean;
  flashError: string | null;
}) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);

  async function disconnect() {
    if (!confirm("¿Desconectar Google Calendar?\n\nLa app dejará de poder leer o crear eventos en la agenda. Tendrás que volver a conectar para reactivar la integración.")) return;
    setDisconnecting(true);
    const res = await fetch("/api/google/status", { method: "DELETE" });
    if (res.ok) {
      router.refresh();
    } else {
      alert("No se pudo desconectar. Intenta de nuevo.");
      setDisconnecting(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Flash messages */}
      {flashSuccess && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "#ECFDF5", color: "#065F46", border: "1px solid #10B981" }}>
          ✓ Google Calendar conectado correctamente
        </div>
      )}
      {flashError && (
        <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "#FEF2F2", color: "#991B1B", border: "1px solid #F87171" }}>
          Error al conectar: {flashError}
        </div>
      )}

      {/* Google Calendar */}
      <section className="card">
        <div className="flex items-start gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0"
            style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}
          >
            📅
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-medium">Google Calendar</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Permite a la app leer y crear eventos en la agenda de videoconsultas.
              Base para el auto-agendamiento desde la landing pública.
            </p>
          </div>
        </div>

        {googleConnection ? (
          <div className="rounded-lg p-3" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: "#15803D", color: "#FFFFFF" }}>
                    CONECTADO
                  </span>
                </div>
                <div className="text-sm font-medium">{googleConnection.googleEmail}</div>
                {googleConnection.googleName && (
                  <div className="text-xs" style={{ color: "#525252" }}>
                    {googleConnection.googleName}
                  </div>
                )}
                <div className="text-[11px] mt-1.5" style={{ color: "#737373" }}>
                  Conectado por {googleConnection.connectedByName || "—"} el{" "}
                  {new Date(googleConnection.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
                </div>
              </div>
              <button
                onClick={disconnect}
                disabled={disconnecting}
                className="text-xs text-red-600 hover:underline shrink-0"
              >
                {disconnecting ? "Desconectando..." : "Desconectar"}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="rounded-lg p-3 mb-3" style={{ background: "#FAFAFA", border: "1px dashed #D4D4D4" }}>
              <p className="text-xs" style={{ color: "#525252" }}>
                No hay ninguna cuenta de Google conectada. Pulsa el botón para iniciar la conexión.
              </p>
              <p className="text-[11px] mt-1.5" style={{ color: "#737373" }}>
                💡 Asegúrate de loguearte con <strong>videoconsultas@fisiofitteam.com</strong> cuando Google te lo pida (no con tu cuenta personal).
              </p>
            </div>
            <a
              href="/api/google/connect"
              className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg"
              style={{ background: "#0A0A0A", color: "#FAFAFA" }}
            >
              <span>🔗</span>
              Conectar Google Calendar
            </a>
          </div>
        )}
      </section>

      <p className="text-[11px] text-neutral-500 italic px-1">
        Más integraciones próximamente (Stripe, Meta Pixel, etc.)
      </p>
    </div>
  );
}
