"use client";

import { useEffect, useState } from "react";

/**
 * Card en la ficha del paciente para que el fisio:
 *  - Genere links de reserva para optimización / renovación.
 *  - Copie el link al portapapeles o lo abra en WhatsApp con un mensaje ya redactado.
 *  - Vea el histórico corto (pending / scheduled / completed).
 *
 * No hay botón visible para el paciente — el link se pasa manualmente por chat.
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
  const [modalType, setModalType] = useState<CallType | null>(null);
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  function openModal(type: CallType) {
    setModalType(type);
    setNote("");
    setError(null);
  }

  async function submitCreate() {
    if (!modalType) return;
    setCreating(true);
    setError(null);
    const r = await fetch(`/api/patients/${patientId}/call-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: modalType, fisioNote: note || null }),
    });
    const d = await r.json();
    if (!r.ok) {
      setError(d?.error ?? "No se pudo generar el link");
      setCreating(false);
      return;
    }
    setModalType(null);
    setCreating(false);
    await loadCalls();
  }

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
              Genera un link de reserva y pásaselo al paciente por chat.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={() => openModal("optimization")}
            className="text-sm font-medium px-3 py-2 rounded-lg"
            style={{ background: "#EEF2FF", color: "#3730A3", border: "1px solid #C7D2FE" }}
          >
            🔧 Programar optimización
          </button>
          <button
            onClick={() => openModal("renewal")}
            className="text-sm font-medium px-3 py-2 rounded-lg"
            style={{ background: "#FEF3C7", color: "#78350F", border: "1px solid #FDE68A" }}
          >
            🔁 Programar renovación
          </button>
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

      {/* Modal crear link */}
      {modalType && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => !creating && setModalType(null)}
        >
          <div
            className="w-full max-w-md rounded-xl p-5"
            style={{ background: "#FFFFFF" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-base mb-1">
              Programar {TYPE_LABEL[modalType].toLowerCase()}
            </h3>
            <p className="text-xs text-neutral-500 mb-3">
              Genera un link único. El paciente elegirá el hueco cuando lo abra.
            </p>
            <label className="text-xs text-neutral-500 block mb-1">Nota para el paciente (opcional)</label>
            <textarea
              className="w-full text-sm p-2 rounded-lg mb-3"
              style={{ border: "1px solid #E5E5E5", minHeight: 80 }}
              placeholder="Ej. Quiero revisar el bloque de hombro y ajustar la carga esta semana."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
            />
            {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setModalType(null)}
                disabled={creating}
                className="text-xs font-medium px-3 py-1.5 rounded-lg"
                style={{ background: "#F5F5F5", color: "#171717" }}
              >
                Cancelar
              </button>
              <button
                onClick={submitCreate}
                disabled={creating}
                className="text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-40"
                style={{ background: "#0A0A0A", color: "#FAFAFA" }}
              >
                {creating ? "Generando…" : "Generar link"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
