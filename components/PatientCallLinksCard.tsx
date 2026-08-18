"use client";

import { useEffect, useState } from "react";

/**
 * Card en la ficha del paciente que MUESTRA el estado de los últimos links
 * de reserva (pending / scheduled / completed / cancelled) y permite copiar
 * un link pendiente o mandarlo por WhatsApp.
 *
 * La CREACIÓN de nuevos links se hace desde el botón "🎥 Agendar llamada"
 * del header del paciente (visible en todas las tabs del expediente).
 */

type CallType = "optimization" | "renewal";

type PatientCall = {
  id: string;
  type: CallType;
  status: string;
  bookingToken: string;
  tokenExpiresAt: string;
  scheduledAt: string | null;
  meetingUrl: string | null;
  fisioNote: string | null;
  createdAt: string;
};

const TYPE_LABEL: Record<CallType, string> = {
  optimization: "Optimización",
  renewal: "Renovación",
};

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Sin reservar", color: "#78350F", bg: "#FEF3C7" },
  scheduled: { label: "Reservada", color: "#065F46", bg: "#D1FAE5" },
  completed: { label: "Completada", color: "#3730A3", bg: "#E0E7FF" },
  cancelled: { label: "Cancelada", color: "#7C2D12", bg: "#FEE2E2" },
};

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    dateStyle: "medium",
  }).format(new Date(iso));
}

export function PatientCallLinksCard({
  patientId,
  patientPhone,
  patientFirstName,
  baseUrl,
}: {
  patientId: string;
  patientPhone: string | null;
  patientFirstName: string;
  /** Origen absoluto para armar la URL pública del link (ej. https://app.fisiofit.team). */
  baseUrl: string;
}) {
  const [calls, setCalls] = useState<PatientCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function loadCalls() {
    setLoading(true);
    const r = await fetch(`/api/patients/${patientId}/call-link`);
    if (r.ok) {
      const d = await r.json();
      setCalls(d.calls);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadCalls();
    // Sincronía con el botón "Agendar llamada" del header: al crear un link,
    // se dispara este evento y recargamos la lista sin recargar la página.
    function onCreated(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.patientId === patientId) loadCalls();
    }
    window.addEventListener("patient-call-created", onCreated);
    return () => window.removeEventListener("patient-call-created", onCreated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  function copyLink(call: PatientCall) {
    const url = `${baseUrl}/agendar-fisio/${call.bookingToken}`;
    navigator.clipboard.writeText(url);
    setCopiedId(call.id);
    setTimeout(() => setCopiedId(null), 1800);
  }

  function whatsappLink(call: PatientCall): string | null {
    if (!patientPhone) return null;
    const url = `${baseUrl}/agendar-fisio/${call.bookingToken}`;
    const label = TYPE_LABEL[call.type].toLowerCase();
    const first = patientFirstName || "";
    const text = `Hola ${first}! Aquí tienes el link para reservar tu llamada de ${label} conmigo: ${url}`;
    const phone = patientPhone.replace(/[^\d+]/g, "");
    return `https://wa.me/${phone.replace(/^\+/, "")}?text=${encodeURIComponent(text)}`;
  }

  const activeCalls = calls.filter((c) => c.status === "pending" || c.status === "scheduled");
  const doneCalls = calls.filter((c) => c.status === "completed" || c.status === "cancelled");

  return (
    <section className="mt-4 max-w-3xl mx-auto px-4">
      <div className="rounded-xl p-4" style={{ background: "#FFFFFF", border: "1px solid #E5E5E5" }}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="font-semibold text-sm">🎥 Llamadas de seguimiento</h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Estado de los links generados. Usa <b>Agendar llamada</b> arriba para crear uno nuevo.
            </p>
          </div>
        </div>

        {/* Lista de links activos */}
        {loading ? (
          <div className="text-xs text-neutral-500">Cargando…</div>
        ) : activeCalls.length === 0 && doneCalls.length === 0 ? (
          <div className="text-xs text-neutral-500 italic">Sin llamadas aún.</div>
        ) : (
          <div className="space-y-2">
            {activeCalls.map((c) => {
              const status = STATUS_LABEL[c.status] ?? { label: c.status, color: "#525252", bg: "#F5F5F5" };
              const wa = whatsappLink(c);
              return (
                <div key={c.id} className="rounded-lg p-3" style={{ background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">{TYPE_LABEL[c.type]}</span>
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                        style={{ color: status.color, background: status.bg }}
                      >
                        {status.label}
                      </span>
                    </div>
                    <span className="text-[10px] text-neutral-500">Creado {formatDate(c.createdAt)}</span>
                  </div>

                  {c.status === "scheduled" && c.scheduledAt && (
                    <div className="text-xs text-neutral-700 mb-1">
                      📅 {formatDateTime(c.scheduledAt)}
                    </div>
                  )}
                  {c.status === "scheduled" && c.meetingUrl && (
                    <a
                      href={c.meetingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs underline text-blue-700"
                    >
                      Abrir Google Meet
                    </a>
                  )}

                  {c.status === "pending" && (
                    <>
                      {c.fisioNote && (
                        <div className="text-[11px] text-neutral-600 italic mb-1 line-clamp-2">
                          Nota: {c.fisioNote}
                        </div>
                      )}
                      <div className="text-[10px] text-neutral-500 mb-2">
                        Caduca {formatDate(c.tokenExpiresAt)}
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        <button
                          onClick={() => copyLink(c)}
                          className="text-[11px] font-medium px-2 py-1 rounded-md"
                          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
                        >
                          {copiedId === c.id ? "✓ Copiado" : "📋 Copiar link"}
                        </button>
                        {wa && (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-medium px-2 py-1 rounded-md"
                            style={{ background: "#22C55E", color: "#FFFFFF" }}
                          >
                            💬 WhatsApp
                          </a>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {doneCalls.length > 0 && (
              <details className="mt-2">
                <summary className="text-xs text-neutral-500 cursor-pointer">
                  Histórico ({doneCalls.length})
                </summary>
                <div className="space-y-1 mt-2">
                  {doneCalls.map((c) => (
                    <div key={c.id} className="text-[11px] text-neutral-600 flex items-center gap-2">
                      <span className="font-medium">{TYPE_LABEL[c.type]}</span>
                      <span>·</span>
                      <span>{STATUS_LABEL[c.status]?.label ?? c.status}</span>
                      {c.scheduledAt && (
                        <>
                          <span>·</span>
                          <span>{formatDateTime(c.scheduledAt)}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
