"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Slot = {
  startISO: string;
  endISO: string;
  dayOfWeek: number;
  hhmm: string;
};

// ─── Helpers de fecha (clonados de AgendaLanding para mantener coherencia) ──

function formatDateLabel(iso: string, tz: string = "Europe/Madrid"): string {
  const d = new Date(iso);
  const dayName = d.toLocaleDateString("es-ES", { weekday: "long", timeZone: tz });
  const day = d.toLocaleDateString("es-ES", { day: "numeric", timeZone: tz });
  const month = d.toLocaleDateString("es-ES", { month: "long", timeZone: tz });
  return `${dayName} ${day} de ${month}`;
}

function dateKey(iso: string, tz: string = "Europe/Madrid"): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: tz });
}

function formatHHMM(iso: string, tz: string = "Europe/Madrid"): string {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: tz });
}

function getUserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function RescheduleLanding({
  token,
  firstName,
  currentSlotISO,
  status,
}: {
  token: string;
  firstName: string;
  currentSlotISO: string;
  /** Estado del lead: si != "scheduled" la cita ya no se puede mover. */
  status: string;
}) {
  const router = useRouter();
  const isActive = status === "scheduled";

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showLaterDays, setShowLaterDays] = useState(false);

  const [userTz, setUserTz] = useState<string | null>(null);
  useEffect(() => {
    setUserTz(getUserTimezone());
  }, []);
  const effectiveTz = userTz || "Europe/Madrid";
  const isUserInMadrid = userTz === "Europe/Madrid";

  async function loadSlots() {
    setLoadingSlots(true);
    setError("");
    try {
      const res = await fetch("/api/agenda/slots");
      const data = await res.json();
      if (data.ok) setSlots(data.slots);
      else setError(data.error || "No se pudieron cargar los huecos.");
    } catch {
      setError("No se pudieron cargar los huecos. Inténtalo de nuevo.");
    } finally {
      setLoadingSlots(false);
    }
  }

  useEffect(() => {
    if (isActive) loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirm() {
    if (!selectedSlot) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/agenda/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          startISO: selectedSlot.startISO,
          endISO: selectedSlot.endISO,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        // Misma página de gracias que el booking original.
        const params = new URLSearchParams({
          lead: data.leadId,
          start: selectedSlot.startISO,
          name: firstName,
        });
        router.push(`/agenda/gracias?${params.toString()}`);
      } else {
        setError(data.error || "No se pudo cambiar la cita. Inténtalo de nuevo.");
        if (res.status === 409) {
          setSelectedSlot(null);
          loadSlots();
        }
        setSubmitting(false);
      }
    } catch {
      setError("Error de red. Comprueba tu conexión.");
      setSubmitting(false);
    }
  }

  // ─── Agrupar slots por día en la TZ del usuario ───
  const slotsByDay = new Map<string, Slot[]>();
  for (const s of slots) {
    const k = dateKey(s.startISO, effectiveTz);
    if (!slotsByDay.has(k)) slotsByDay.set(k, []);
    slotsByDay.get(k)!.push(s);
  }

  function sundayEndOfThisWeek(): Date {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short" });
    const wk = fmt.format(now);
    const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    const dow = map[wk] || 1;
    const sunday = new Date(now);
    sunday.setDate(sunday.getDate() + (7 - dow));
    sunday.setHours(23, 59, 59, 999);
    return sunday;
  }
  const thisWeekEnd = sundayEndOfThisWeek();
  const thisWeekDays: Array<[string, Slot[]]> = [];
  const laterDays: Array<[string, Slot[]]> = [];
  for (const [k, ds] of slotsByDay.entries()) {
    if (new Date(ds[0].startISO) <= thisWeekEnd) thisWeekDays.push([k, ds]);
    else laterDays.push([k, ds]);
  }

  // Cita actual — para que el lead vea cuál tiene reservada antes de cambiarla.
  const currentLabel = `${formatDateLabel(currentSlotISO, effectiveTz)} a las ${formatHHMM(currentSlotISO, effectiveTz)}`;

  return (
    <main
      className="min-h-screen relative"
      style={{
        backgroundColor: "#0A0A0A",
        backgroundImage: "url('/box.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        color: "#FAFAFA",
      }}
    >
      <div className="absolute inset-0" style={{ background: "rgba(10, 10, 10, 0.72)" }} />

      <div className="relative max-w-2xl mx-auto px-5 py-10 pb-20">
        <header className="mb-8 text-center">
          <h1
            className="font-bold leading-none mb-4"
            style={{ fontSize: "clamp(32px, 5.5vw, 48px)", letterSpacing: "-0.035em" }}
          >
            Hola{firstName ? `, ${firstName}` : ""}.<br />
            <span className="brand-gradient-text">Cambia tu cita</span>
          </h1>
          <p className="text-sm sm:text-base" style={{ color: "#A3A3A3" }}>
            Elige un nuevo hueco. El anterior se libera automáticamente.
          </p>
        </header>

        <section
          className="rounded-2xl p-5 sm:p-6"
          style={{ background: "rgba(20, 20, 20, 0.85)", border: "1px solid #262626", backdropFilter: "blur(8px)" }}
        >
          {/* Cita actual */}
          <div
            className="rounded-lg p-3 mb-5 text-sm"
            style={{ background: "rgba(31, 31, 31, 0.7)", border: "1px solid #262626", color: "#D4D4D4" }}
          >
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "#737373" }}>
              Tu cita actual
            </div>
            <div className="capitalize">{currentLabel}</div>
          </div>

          {!isActive && (
            <div
              className="rounded-lg p-4 text-sm"
              style={{ background: "rgba(248, 113, 113, 0.1)", border: "1px solid #7F1D1D", color: "#FCA5A5" }}
            >
              Esta cita ya no se puede cambiar desde aquí. Escríbenos por Instagram o WhatsApp
              y te ayudamos personalmente.
            </div>
          )}

          {isActive && (
            <>
              <h2 className="text-lg font-semibold mb-1">Elige cuándo te llamamos</h2>
              <p className="text-xs mb-3" style={{ color: "#A3A3A3" }}>
                Videoconsulta de 45-60 minutos. Necesitamos al menos 24 horas de antelación.
              </p>

              <div
                className="rounded-lg px-3 py-2 mb-4 text-xs flex items-start gap-2"
                style={{ background: "rgba(252, 211, 77, 0.08)", border: "1px solid rgba(252, 211, 77, 0.25)", color: "#FCD34D" }}
              >
                <span className="flex-shrink-0">🕒</span>
                <div>
                  Las horas se muestran en tu zona horaria
                  {userTz && <> (<strong>{userTz}</strong>)</>}.
                  {!isUserInMadrid && userTz && (
                    <> También verás entre paréntesis la hora equivalente en Madrid.</>
                  )}
                </div>
              </div>

              {loadingSlots && (
                <p className="text-sm text-center py-8" style={{ color: "#A3A3A3" }}>
                  Cargando huecos disponibles…
                </p>
              )}

              {!loadingSlots && slots.length === 0 && (
                <div
                  className="rounded-lg p-4 text-sm text-center"
                  style={{ background: "rgba(31, 31, 31, 0.7)", border: "1px dashed #404040", color: "#A3A3A3", backdropFilter: "blur(8px)" }}
                >
                  No hay huecos libres en las próximas semanas. Vuelve a intentarlo más tarde o contáctanos por Instagram.
                </div>
              )}

              {!loadingSlots && slots.length > 0 && (
                <div className="space-y-3">
                  {thisWeekDays.length > 0 && (
                    <>
                      <div className="text-[10px] uppercase tracking-wider font-semibold pl-1" style={{ color: "#737373" }}>
                        Esta semana
                      </div>
                      {thisWeekDays.map(([k, ds]) => (
                        <DayBlock
                          key={k}
                          daySlots={ds}
                          selectedSlot={selectedSlot}
                          setSelectedSlot={setSelectedSlot}
                          userTz={effectiveTz}
                          isUserInMadrid={isUserInMadrid}
                        />
                      ))}
                    </>
                  )}

                  {thisWeekDays.length === 0 && (
                    <div
                      className="rounded-lg p-3 text-sm text-center"
                      style={{ background: "rgba(31, 31, 31, 0.6)", border: "1px dashed #404040", color: "#A3A3A3" }}
                    >
                      No quedan huecos disponibles esta semana. Mira las próximas fechas ↓
                    </div>
                  )}

                  {laterDays.length > 0 && (
                    <div className="pt-1">
                      <button
                        onClick={() => setShowLaterDays((v) => !v)}
                        className="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between"
                        style={{
                          background: "rgba(26, 26, 26, 0.85)",
                          border: "1px solid #262626",
                          color: "#D4D4D4",
                          backdropFilter: "blur(8px)",
                        }}
                      >
                        <span>
                          <strong style={{ color: "#FAFAFA" }}>Ver más fechas</strong>{" "}
                          <span style={{ color: "#737373" }}>· próximas semanas</span>
                        </span>
                        <span style={{ color: "#A3A3A3", fontSize: 14 }}>{showLaterDays ? "▲" : "▼"}</span>
                      </button>

                      {showLaterDays && (
                        <div className="space-y-3 mt-3">
                          {laterDays.map(([k, ds]) => (
                            <DayBlock
                              key={k}
                              daySlots={ds}
                              selectedSlot={selectedSlot}
                              setSelectedSlot={setSelectedSlot}
                              userTz={effectiveTz}
                              isUserInMadrid={isUserInMadrid}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div
                  className="rounded-lg px-3 py-2 text-sm mt-4"
                  style={{ background: "rgba(248, 113, 113, 0.1)", border: "1px solid #7F1D1D", color: "#FCA5A5" }}
                >
                  {error}
                </div>
              )}

              {selectedSlot && (
                <div
                  className="rounded-lg p-3 mt-4 text-sm"
                  style={{ background: "rgba(34, 197, 94, 0.1)", border: "1px solid #14532D", color: "#86EFAC" }}
                >
                  ✓ Has elegido el <strong>{formatDateLabel(selectedSlot.startISO, effectiveTz)}</strong> a las{" "}
                  <strong>{formatHHMM(selectedSlot.startISO, effectiveTz)}</strong>
                  {userTz && <> ({userTz})</>}
                  {!isUserInMadrid && (
                    <> · equivale a {formatHHMM(selectedSlot.startISO, "Europe/Madrid")} en Madrid</>
                  )}
                </div>
              )}

              <button
                onClick={confirm}
                disabled={!selectedSlot || submitting}
                className="w-full text-sm font-semibold rounded-lg mt-4"
                style={{
                  background: selectedSlot && !submitting ? "#FAFAFA" : "#404040",
                  color: selectedSlot && !submitting ? "#0A0A0A" : "#737373",
                  padding: 14,
                  border: "none",
                  cursor: selectedSlot && !submitting ? "pointer" : "not-allowed",
                }}
              >
                {submitting ? "Cambiando..." : "Confirmar nuevo hueco"}
              </button>

              <p className="text-xs text-center mt-3" style={{ color: "#737373" }}>
                Al confirmar, la cita anterior se cancela y recibirás el nuevo invitación por email.
              </p>
            </>
          )}
        </section>

        <footer className="mt-10 text-center text-xs" style={{ color: "#525252" }}>
          FisioFit Team · Readaptación deportiva online · {new Date().getFullYear()}
        </footer>
      </div>
    </main>
  );
}

function DayBlock({
  daySlots,
  selectedSlot,
  setSelectedSlot,
  userTz,
  isUserInMadrid,
}: {
  daySlots: Slot[];
  selectedSlot: Slot | null;
  setSelectedSlot: (s: Slot) => void;
  userTz: string;
  isUserInMadrid: boolean;
}) {
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "rgba(26, 26, 26, 0.85)", border: "1px solid #262626", backdropFilter: "blur(8px)" }}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#D4D4D4" }}>
        {formatDateLabel(daySlots[0].startISO, userTz)}
      </h3>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
        {daySlots.map((s) => {
          const isSelected = selectedSlot?.startISO === s.startISO;
          const localTime = formatHHMM(s.startISO, userTz);
          const madridTime = !isUserInMadrid ? formatHHMM(s.startISO, "Europe/Madrid") : null;
          return (
            <button
              key={s.startISO}
              onClick={() => setSelectedSlot(s)}
              className="px-2 py-2 rounded-md text-sm font-medium tabular-nums leading-tight"
              style={{
                background: isSelected ? "#FAFAFA" : "#262626",
                color: isSelected ? "#0A0A0A" : "#FAFAFA",
                border: "1px solid " + (isSelected ? "#FAFAFA" : "#404040"),
              }}
            >
              <div>{localTime}</div>
              {madridTime && (
                <div className="text-[10px] mt-0.5" style={{ opacity: 0.6 }}>
                  {madridTime} Madrid
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
