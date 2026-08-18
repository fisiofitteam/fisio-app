"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Landing pública para que el paciente reserve un hueco con su fisio.
 *
 * Flujo:
 *  1. Al montar, pide slots libres de una ventana [hoy, hoy+14 días).
 *  2. El paciente elige un slot. Si no tiene email en ficha, lo pedimos.
 *  3. POST /api/booking/[token]/reserve — la API crea el evento en Google
 *     y devuelve meetingUrl. Pintamos pantalla de éxito.
 */

type CallType = "optimization" | "renewal";

type Fisio = { fullName: string; photoUrl: string | null };
type Patient = { fullName: string; email: string | null };

const TYPE_HEADLINE: Record<CallType, string> = {
  optimization: "Llamada de optimización",
  renewal: "Llamada de renovación",
};
const TYPE_INTRO: Record<CallType, string> = {
  optimization: "Vamos a revisar cómo van los últimos días y ajustar tu plan.",
  renewal: "Repasamos tu progreso y organizamos la siguiente etapa contigo.",
};

const WINDOW_DAYS = 14;

function formatDateHeader(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}
function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
function madridDayKey(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Madrid",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
}

export function BookingCallLandingClient(props: {
  token: string;
  status: string;
  type: CallType;
  durationMin: number;
  fisio: Fisio;
  patient: Patient;
  fisioNote: string | null;
  scheduledAt: string | null;
  meetingUrl: string | null;
}) {
  const [slots, setSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState(props.patient.email ?? "");
  const [reserving, setReserving] = useState(false);
  const [reserveError, setReserveError] = useState<string | null>(null);

  // Estado local si acaba de reservar en esta sesión (sin recargar página):
  const [justScheduledAt, setJustScheduledAt] = useState<string | null>(null);
  const [justMeetingUrl, setJustMeetingUrl] = useState<string | null>(null);

  const isPending = props.status === "pending";
  const isScheduled = props.status === "scheduled" || !!justScheduledAt;
  const isExpired = props.status === "expired";
  const isCancelled = props.status === "cancelled";
  const isCompleted = props.status === "completed";

  useEffect(() => {
    if (!isPending) return;
    const from = new Date();
    const to = new Date(from.getTime() + WINDOW_DAYS * 24 * 3600 * 1000);
    (async () => {
      setLoading(true);
      setLoadError(null);
      const r = await fetch(`/api/booking/${props.token}/slots?from=${from.toISOString()}&to=${to.toISOString()}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setLoadError(d?.error ?? "No se pudo cargar la disponibilidad");
        setLoading(false);
        return;
      }
      setSlots(d.slots ?? []);
      setLoading(false);
    })();
  }, [props.token, isPending]);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of slots) {
      const k = madridDayKey(s);
      const arr = map.get(k) ?? [];
      arr.push(s);
      map.set(k, arr);
    }
    return Array.from(map.entries()).sort();
  }, [slots]);

  async function reserve() {
    if (!selected) return;
    setReserving(true);
    setReserveError(null);
    const body: Record<string, unknown> = { startAt: selected };
    if (!props.patient.email && emailInput) body.patientEmail = emailInput.trim();
    const r = await fetch(`/api/booking/${props.token}/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setReserveError(d?.error ?? "No se pudo confirmar la reserva");
      setReserving(false);
      return;
    }
    setJustScheduledAt(d.scheduledAt);
    setJustMeetingUrl(d.meetingUrl ?? null);
    setReserving(false);
  }

  const activeScheduledAt = justScheduledAt ?? props.scheduledAt;
  const activeMeetingUrl = justMeetingUrl ?? props.meetingUrl;

  return (
    <div style={{ minHeight: "100vh", background: "#F5F5F5", padding: "24px 16px 48px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        {/* Header */}
        <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "#FFFFFF" }}>
          <div style={{ background: "linear-gradient(135deg,#FCD34D 0%,#F59E0B 100%)", padding: "16px 20px" }}>
            <div className="text-xs font-medium" style={{ color: "#1F2937" }}>FisioFit App</div>
            <h1 className="text-lg font-bold mt-0.5" style={{ color: "#1F2937" }}>
              {TYPE_HEADLINE[props.type]}
            </h1>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-3">
              {props.fisio.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={props.fisio.photoUrl} alt={props.fisio.fullName} className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold" style={{ background: "#F5F5F5", color: "#525252" }}>
                  {props.fisio.fullName.slice(0, 1)}
                </div>
              )}
              <div>
                <div className="text-xs text-neutral-500">Reunión con</div>
                <div className="font-semibold text-sm">{props.fisio.fullName}</div>
                <div className="text-[11px] text-neutral-500">{props.durationMin} min · videollamada por Google Meet</div>
              </div>
            </div>
            <p className="text-sm text-neutral-700 mt-3">
              Hola <b>{props.patient.fullName.split(" ")[0]}</b>, {TYPE_INTRO[props.type]}
            </p>
            {props.fisioNote && (
              <div className="mt-3 rounded-lg p-2.5 text-xs" style={{ background: "#F5F5F5", color: "#404040" }}>
                <b>Nota:</b> {props.fisioNote}
              </div>
            )}
          </div>
        </div>

        {/* Estados terminales */}
        {isExpired && (
          <div className="rounded-2xl p-5 text-center" style={{ background: "#FFFFFF" }}>
            <div className="text-3xl mb-1">⌛</div>
            <h2 className="font-semibold">Este enlace ha caducado</h2>
            <p className="text-sm text-neutral-600 mt-1">
              Pídele a {props.fisio.fullName.split(" ")[0]} un enlace nuevo.
            </p>
          </div>
        )}
        {isCancelled && (
          <div className="rounded-2xl p-5 text-center" style={{ background: "#FFFFFF" }}>
            <div className="text-3xl mb-1">❌</div>
            <h2 className="font-semibold">Este enlace ha sido cancelado</h2>
          </div>
        )}
        {isCompleted && !justScheduledAt && (
          <div className="rounded-2xl p-5 text-center" style={{ background: "#FFFFFF" }}>
            <div className="text-3xl mb-1">✅</div>
            <h2 className="font-semibold">Llamada completada</h2>
          </div>
        )}

        {/* Reservado (ya sea de antes o justo ahora) */}
        {isScheduled && activeScheduledAt && (
          <div className="rounded-2xl p-5" style={{ background: "#FFFFFF" }}>
            <div className="text-3xl mb-1 text-center">✅</div>
            <h2 className="font-semibold text-center">¡Reserva confirmada!</h2>
            <p className="text-sm text-neutral-700 text-center mt-1">
              Nos vemos el <b>{formatDateHeader(activeScheduledAt)}</b> a las <b>{formatTime(activeScheduledAt)}</b>.
            </p>
            {activeMeetingUrl && (
              <div className="mt-4 text-center">
                <a
                  href={activeMeetingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-sm font-semibold px-4 py-2.5 rounded-lg"
                  style={{ background: "#0A0A0A", color: "#FAFAFA" }}
                >
                  Abrir Google Meet
                </a>
                <div className="text-[11px] text-neutral-500 mt-2">
                  Te hemos enviado un email de confirmación. También lo tienes en el evento del calendario.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Selector de slot */}
        {isPending && !justScheduledAt && (
          <div className="rounded-2xl p-4" style={{ background: "#FFFFFF" }}>
            <h2 className="font-semibold text-sm mb-2">Elige el día y la hora</h2>
            {loading ? (
              <div className="text-xs text-neutral-500 italic py-6 text-center">Buscando huecos disponibles…</div>
            ) : loadError ? (
              <div className="text-xs text-red-600 py-4">{loadError}</div>
            ) : slots.length === 0 ? (
              <div className="text-xs text-neutral-500 italic py-6 text-center">
                No hay huecos disponibles en los próximos días.<br />Pídele a {props.fisio.fullName.split(" ")[0]} que amplíe su agenda.
              </div>
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {slotsByDay.map(([dayKey, daySlots]) => (
                  <div key={dayKey}>
                    <div className="text-xs font-medium text-neutral-500 mb-1.5 capitalize">
                      {formatDateHeader(daySlots[0])}
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {daySlots.map((s) => {
                        const isSel = s === selected;
                        return (
                          <button
                            key={s}
                            onClick={() => setSelected(s)}
                            className="text-xs font-semibold py-2 rounded-lg tabular-nums"
                            style={{
                              background: isSel ? "#0A0A0A" : "#F5F5F5",
                              color: isSel ? "#FAFAFA" : "#171717",
                              border: isSel ? "1px solid #0A0A0A" : "1px solid transparent",
                            }}
                          >
                            {formatTime(s)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selected && (
              <div className="mt-4 pt-4 border-t" style={{ borderColor: "#E5E5E5" }}>
                <div className="text-xs text-neutral-500 mb-1">Reservarás</div>
                <div className="text-sm font-semibold capitalize">
                  {formatDateHeader(selected)} · {formatTime(selected)}
                </div>

                {!props.patient.email && (
                  <div className="mt-3">
                    <label className="text-xs text-neutral-500 block mb-1">Tu email (para la invitación de Meet)</label>
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      className="w-full text-sm p-2 rounded-lg"
                      style={{ border: "1px solid #E5E5E5" }}
                      placeholder="tu@email.com"
                    />
                  </div>
                )}

                {reserveError && (
                  <div className="text-xs text-red-600 mt-2">{reserveError}</div>
                )}

                <button
                  onClick={reserve}
                  disabled={reserving || (!props.patient.email && !emailInput)}
                  className="w-full mt-3 text-sm font-semibold py-3 rounded-lg disabled:opacity-40"
                  style={{ background: "#0A0A0A", color: "#FAFAFA" }}
                >
                  {reserving ? "Confirmando…" : "Confirmar reserva"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
