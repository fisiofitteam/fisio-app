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

type CallSummary = {
  id: string;
  clinicalSummary: string | null;
  clinicalKeyPoints: string | null;   // JSON
  coachingSummary: string | null;
  coachingKeyPoints: string | null;   // JSON
  salesSummary: string | null;        // renewalContext.summary si type=renewal
  salesKeyPoints: string | null;      // JSON renewalContext
  outcome: string | null;
  noTranscript: boolean;
  errorMessage: string | null;
  transcriptCharCount: number | null;
  generatedAt: string;
  updatedAt: string;
};

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
  durationMin: number | null;
  callSummary: CallSummary | null;
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
  patientGroupUrl,
  patientFirstName,
  baseUrl,
}: {
  patientId: string;
  /** URL del grupo de seguimiento de WhatsApp del paciente. Al pulsar el
   * botón WhatsApp por cada link pendiente, copiamos el mensaje al
   * portapapeles y abrimos el grupo. */
  patientGroupUrl: string | null;
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

  /** Copia el mensaje al portapapeles y abre el grupo del paciente. */
  function sendToGroup(call: PatientCall) {
    if (!patientGroupUrl) return;
    const url = `${baseUrl}/agendar-fisio/${call.bookingToken}`;
    const label = TYPE_LABEL[call.type].toLowerCase();
    const first = patientFirstName || "";
    const text = `Hola ${first}! Aquí tienes el link para reservar tu llamada de ${label} conmigo: ${url}`;
    navigator.clipboard.writeText(text).catch(() => {});
    window.open(patientGroupUrl, "_blank", "noopener,noreferrer");
  }

  // Muestro pending/scheduled/completed en la lista principal (los completed
  // con resumen son la joya del panel). Solo colapsamos cancelled dentro del
  // histórico corto.
  const activeCalls = calls.filter((c) => c.status !== "cancelled");
  const doneCalls = calls.filter((c) => c.status === "cancelled");

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
                  {c.status === "scheduled" && c.scheduledAt && new Date(c.scheduledAt) < new Date(Date.now() - 15 * 60_000) && !c.callSummary?.clinicalSummary && (
                    <SummaryPendingChip call={c} onRegenerated={loadCalls} />
                  )}
                  {c.callSummary?.clinicalSummary && (
                    <PatientCallSummaryPanel call={c} onRegenerated={loadCalls} />
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
                        {patientGroupUrl && (
                          <button
                            onClick={() => sendToGroup(c)}
                            className="text-[11px] font-medium px-2 py-1 rounded-md"
                            style={{ background: "#22C55E", color: "#FFFFFF" }}
                            title="Copia el mensaje al portapapeles y abre el grupo de seguimiento"
                          >
                            💬 Grupo
                          </button>
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

/**
 * Chip que se muestra cuando una llamada ya pasó (>15 min desde scheduledAt)
 * pero aún no tiene resumen. El cron corre cada 30 min; ofrecemos un botón
 * "Reintentar ahora" que llama al endpoint de regeneración para adelantarlo.
 */
function SummaryPendingChip({ call, onRegenerated }: { call: PatientCall; onRegenerated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const errMsg = call.callSummary?.errorMessage ?? null;
  const noTranscript = !!call.callSummary?.noTranscript;

  async function retry() {
    setBusy(true);
    setFeedback(null);
    const r = await fetch(`/api/patient-calls/${call.id}/regenerate`, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok && d.ok) {
      setFeedback("Resumen generado ✅");
      onRegenerated();
    } else {
      setFeedback(d.detail ?? d.error ?? "No se pudo generar");
    }
  }

  return (
    <div className="mt-2 rounded-md p-2 text-[11px]" style={{ background: "#FEF3C7", color: "#78350F", border: "1px solid #FCD34D" }}>
      <div className="font-medium mb-0.5">🤖 Esperando transcripción</div>
      <div>
        Google Meet suele tardar 5-30 min tras terminar la llamada. El cron
        reintenta cada 30 min.
      </div>
      {(errMsg || noTranscript) && (
        <div className="mt-1 text-neutral-700 italic">{errMsg ?? "Meet aún no publicó el transcript."}</div>
      )}
      <button
        onClick={retry}
        disabled={busy}
        className="mt-1.5 text-[11px] font-medium px-2 py-1 rounded-md disabled:opacity-40"
        style={{ background: "#78350F", color: "#FFFBEB" }}
      >
        {busy ? "Comprobando…" : "🔄 Reintentar ahora"}
      </button>
      {feedback && <div className="mt-1 text-neutral-700">{feedback}</div>}
    </div>
  );
}

/**
 * Panel expandible con el resumen IA de una llamada terminada. Muestra
 * clinical (evolución del paciente) + renewalContext si type=renewal +
 * coaching (feedback al fisio) + acción regenerar.
 */
function PatientCallSummaryPanel({ call, onRegenerated }: { call: PatientCall; onRegenerated: () => void }) {
  const [open, setOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const s = call.callSummary;
  if (!s) return null;

  const clinicalKp = safeParse(s.clinicalKeyPoints);
  const coachingKp = safeParse(s.coachingKeyPoints);
  const renewalKp = call.type === "renewal" ? safeParse(s.salesKeyPoints) : null;

  async function regen() {
    if (!confirm("¿Regenerar el resumen desde la transcripción? Sobrescribirá el actual.")) return;
    setRegenerating(true);
    const r = await fetch(`/api/patient-calls/${call.id}/regenerate`, { method: "POST" });
    setRegenerating(false);
    if (r.ok) onRegenerated();
  }

  return (
    <div className="mt-3 rounded-md" style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-xs font-semibold">🤖 Resumen IA {open ? "▾" : "▸"}</span>
        <span className="text-[10px] text-neutral-500">
          {s.transcriptCharCount ? `${s.transcriptCharCount.toLocaleString("es-ES")} chars` : ""}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 text-[12px]">
          {/* Clinical */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">
              Evolución clínica
            </div>
            <p className="text-neutral-800 leading-relaxed">{s.clinicalSummary}</p>
            <KpList label="Síntomas actuales" items={clinicalKp?.currentSymptoms} />
            <KpList label="Adherencia" items={clinicalKp?.adherence} />
            <KpList label="Ajustes acordados" items={clinicalKp?.planAdjustments} />
            <KpList label="Objetivos actualizados" items={clinicalKp?.goalsUpdated} />
            <KpList label="⚠️ Banderas rojas" items={clinicalKp?.redFlags} highlight />
          </div>

          {/* Renewal context (solo si type=renewal) */}
          {call.type === "renewal" && s.salesSummary && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">
                Cierre de renovación
              </div>
              <p className="text-neutral-800 leading-relaxed">{s.salesSummary}</p>
              {renewalKp?.programProposed && (
                <div className="text-[11px] text-neutral-700 mt-1">
                  <b>Propuesta:</b> {renewalKp.programProposed}
                  {renewalKp?.priceDiscussed ? ` · ${renewalKp.priceDiscussed}` : ""}
                </div>
              )}
              {renewalKp?.decision && (
                <div className="text-[11px] text-neutral-700 mt-0.5">
                  <b>Decisión:</b> {renewalKp.decision}
                </div>
              )}
              <KpList label="Objeciones" items={renewalKp?.objections} />
            </div>
          )}

          {/* Coaching (feedback al fisio) */}
          {s.coachingSummary && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">
                🎯 Feedback para el fisio
              </div>
              <p className="text-neutral-800 leading-relaxed">{s.coachingSummary}</p>
              <KpList label="👍 Puntos fuertes" items={coachingKp?.strengths} />
              <KpList label="👀 Oportunidades" items={coachingKp?.weaknesses} />
              <KpList label="💡 Para la próxima" items={coachingKp?.improvements} />
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "#E5E7EB" }}>
            <span className="text-[10px] text-neutral-500">
              Generado {formatDateTime(s.updatedAt)}
            </span>
            <button
              onClick={regen}
              disabled={regenerating}
              className="text-[11px] font-medium px-2 py-1 rounded-md disabled:opacity-40"
              style={{ background: "#0A0A0A", color: "#FAFAFA" }}
            >
              {regenerating ? "Regenerando…" : "🔄 Regenerar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function KpList({ label, items, highlight }: { label: string; items?: string[]; highlight?: boolean }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{label}</div>
      <ul className="list-disc pl-5 mt-0.5 space-y-0.5">
        {items.map((it, i) => (
          <li key={i} className={highlight ? "text-red-700 font-medium" : "text-neutral-700"}>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function safeParse(json: string | null | undefined): any {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}
