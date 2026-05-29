"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AgendaLandingCopy } from "@/lib/landing-content";

type Slot = {
  startISO: string;
  endISO: string;
  dayOfWeek: number;
  hhmm: string;
};

const DAY_LABELS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

// Todas las funciones de formato aceptan la TZ del usuario. Por defecto Madrid si
// no se detecta, así no rompemos render SSR/cliente antiguo.
function formatDateLabel(iso: string, tz: string = "Europe/Madrid"): string {
  const d = new Date(iso);
  const dayName = d.toLocaleDateString("es-ES", { weekday: "long", timeZone: tz });
  const day = d.toLocaleDateString("es-ES", { day: "numeric", timeZone: tz });
  const month = d.toLocaleDateString("es-ES", { month: "long", timeZone: tz });
  return `${dayName} ${day} de ${month}`;
}

function dateKey(iso: string, tz: string = "Europe/Madrid"): string {
  // YYYY-MM-DD en la TZ indicada para agrupar slots por día
  const d = new Date(iso);
  return d.toLocaleDateString("sv-SE", { timeZone: tz });
}

function formatHHMM(iso: string, tz: string = "Europe/Madrid"): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });
}

function getUserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function AgendaLanding({ copy }: { copy: AgendaLandingCopy }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");
  const [motivo, setMotivo] = useState("");
  const [tratamientosPrevios, setTratamientosPrevios] = useState("");
  const [impactoCrossfit, setImpactoCrossfit] = useState("");

  // Step 2
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  // Booking
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Errores por campo (clave del campo → mensaje de error)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // ¿El usuario ha pulsado "ver más fechas"?
  const [showLaterDays, setShowLaterDays] = useState(false);

  // Huso horario del usuario (calculado en cliente). Si no lo tenemos aún —
  // primer render SSR/antes del useEffect— usamos Madrid como base estable.
  const [userTz, setUserTz] = useState<string | null>(null);
  useEffect(() => {
    setUserTz(getUserTimezone());
  }, []);
  const effectiveTz = userTz || "Europe/Madrid";
  const isUserInMadrid = userTz === "Europe/Madrid";

  /**
   * Valida los campos del paso 1 y devuelve un objeto con los errores
   * encontrados (clave → mensaje). Vacío si todo es válido.
   */
  function validateStep1(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (fullName.trim().length < 2) {
      errs.fullName = "Indícanos tu nombre y apellidos";
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      errs.email = "Introduce un email válido (ej. tu@email.com)";
    }
    if (phone.trim().length < 6) {
      errs.phone = "Introduce un teléfono válido";
    }
    if (instagram.trim().replace(/^@+/, "").length < 2) {
      errs.instagram = "Indícanos tu usuario de Instagram";
    }
    if (motivo.trim().length < 3) {
      errs.motivo = "Cuéntanos brevemente tu lesión o molestia";
    }
    if (tratamientosPrevios.trim().length < 3) {
      errs.tratamientosPrevios = "Indícanos qué has probado hasta ahora";
    }
    if (impactoCrossfit.trim().length < 3) {
      errs.impactoCrossfit = "Indícanos cómo te afecta en tus entrenamientos";
    }
    return errs;
  }

  // Limpia automáticamente el error de un campo cuando el usuario empieza a escribir bien
  useEffect(() => {
    if (Object.keys(fieldErrors).length === 0) return;
    const fresh = validateStep1();
    // Solo bajar errores que ya estaban marcados (no añadir nuevos hasta que pulsen el botón)
    const cleaned: Record<string, string> = {};
    for (const k of Object.keys(fieldErrors)) {
      if (fresh[k]) cleaned[k] = fresh[k];
    }
    if (Object.keys(cleaned).length !== Object.keys(fieldErrors).length) {
      setFieldErrors(cleaned);
    }
  }, [fullName, email, phone, instagram, motivo, tratamientosPrevios, impactoCrossfit]);

  async function loadSlots() {
    setLoadingSlots(true);
    setError("");
    try {
      const res = await fetch("/api/agenda/slots");
      const data = await res.json();
      if (data.ok) {
        setSlots(data.slots);
      } else {
        setError(data.error || "No se pudieron cargar los huecos disponibles.");
      }
    } catch {
      setError("No se pudieron cargar los huecos disponibles. Inténtalo de nuevo.");
    } finally {
      setLoadingSlots(false);
    }
  }

  useEffect(() => {
    if (step === 2 && slots.length === 0) {
      loadSlots();
    }
  }, [step]);

  function goStep2() {
    const errs = validateStep1();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      // Resumen amigable arriba
      const count = Object.keys(errs).length;
      setError(
        count === 1
          ? "Hay 1 campo por completar. Lo hemos marcado en rojo."
          : `Hay ${count} campos por completar. Los hemos marcado en rojo.`
      );
      // Scroll al primer campo con error
      setTimeout(() => {
        const firstKey = Object.keys(errs)[0];
        const el = document.querySelector(`[data-field="${firstKey}"]`) as HTMLElement | null;
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          // Foco para que el usuario pueda escribir directamente
          const input = el.querySelector("input, textarea") as HTMLElement | null;
          input?.focus();
        }
      }, 50);
      return;
    }
    setFieldErrors({});
    setError("");
    setStep(2);
  }

  async function book() {
    if (!selectedSlot) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/agenda/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          instagram: instagram.trim(),
          motivo: motivo.trim(),
          tratamientosPrevios: tratamientosPrevios.trim(),
          impactoCrossfit: impactoCrossfit.trim(),
          startISO: selectedSlot.startISO,
          endISO: selectedSlot.endISO,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        const params = new URLSearchParams({
          lead: data.leadId,
          start: selectedSlot.startISO,
          name: fullName.trim().split(" ")[0],
        });
        router.push(`/agenda/gracias?${params.toString()}`);
      } else {
        setError(data.error || "No se pudo reservar. Inténtalo de nuevo.");
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

  // Agrupar slots por día EN LA TZ DEL USUARIO (un slot a las 23:30 Madrid puede
  // ser del día siguiente para alguien en Bucarest, etc.)
  const slotsByDay = new Map<string, Slot[]>();
  for (const s of slots) {
    const k = dateKey(s.startISO, effectiveTz);
    if (!slotsByDay.has(k)) slotsByDay.set(k, []);
    slotsByDay.get(k)!.push(s);
  }

  // Separar días en 2 bloques: "esta semana" (hasta el próximo domingo en
  // Madrid incluido) vs "más adelante". El divisor es el domingo 23:59 de
  // la semana actual.
  // Cálculo: hoy en Madrid → dayOfWeek (1=L..7=D) → días hasta domingo = 7 - dow
  function sundayEndOfThisWeek(): Date {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short" });
    const wk = fmt.format(now);
    const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    const dow = map[wk] || 1;
    const daysUntilSunday = 7 - dow;
    const sunday = new Date(now);
    sunday.setDate(sunday.getDate() + daysUntilSunday);
    sunday.setHours(23, 59, 59, 999);
    return sunday;
  }
  const thisWeekEnd = sundayEndOfThisWeek();
  const thisWeekDays: Array<[string, Slot[]]> = [];
  const laterDays: Array<[string, Slot[]]> = [];
  for (const [dayKey, daySlots] of slotsByDay.entries()) {
    const dayStart = new Date(daySlots[0].startISO);
    if (dayStart <= thisWeekEnd) {
      thisWeekDays.push([dayKey, daySlots]);
    } else {
      laterDays.push([dayKey, daySlots]);
    }
  }

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
      {/* Overlay sutil para que la imagen del box se vea con buena legibilidad */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(10, 10, 10, 0.72)" }}
      />

      <div className="relative max-w-2xl mx-auto px-5 py-10 pb-20">
        {/* Header */}
        <header className="mb-8 text-center">
          <h1
            className="font-bold leading-none mb-4"
            style={{
              fontSize: "clamp(36px, 6vw, 56px)",
              letterSpacing: "-0.035em",
            }}
          >
            {copy.heroTitle1}<br />
            <span className="brand-gradient-text">{copy.heroTitle2}</span>
          </h1>
          <p className="text-sm sm:text-base whitespace-pre-line" style={{ color: "#A3A3A3" }}>
            {copy.heroSubtitle}
          </p>
        </header>

        {/* Tarjeta principal */}
        <section
          className="rounded-2xl p-5 sm:p-6"
          style={{ background: "rgba(20, 20, 20, 0.85)", border: "1px solid #262626", backdropFilter: "blur(8px)" }}
        >
          {/* Indicador de pasos */}
          <div className="flex items-center gap-2 mb-6 text-xs" style={{ color: "#737373" }}>
            <span
              className="px-2 py-1 rounded-md font-semibold"
              style={{
                background: step === 1 ? "#FAFAFA" : "transparent",
                color: step === 1 ? "#0A0A0A" : "#737373",
                border: step === 1 ? "none" : "1px solid #262626",
              }}
            >
              1. Cuéntanos
            </span>
            <span style={{ color: "#404040" }}>→</span>
            <span
              className="px-2 py-1 rounded-md font-semibold"
              style={{
                background: step === 2 ? "#FAFAFA" : "transparent",
                color: step === 2 ? "#0A0A0A" : "#737373",
                border: step === 2 ? "none" : "1px solid #262626",
              }}
            >
              2. Elige hueco
            </span>
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <div data-field="fullName">
                <label className="text-xs block mb-1.5" style={{ color: "#A3A3A3" }}>
                  Nombre y apellidos *
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2.5 rounded-lg text-sm"
                  style={{
                    background: "#1F1F1F",
                    border: `1px solid ${fieldErrors.fullName ? "#DC2626" : "#404040"}`,
                    color: "#FAFAFA",
                  }}
                  placeholder="Ej. Carlos Martínez"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
                {fieldErrors.fullName && (
                  <p className="text-xs mt-1" style={{ color: "#FCA5A5" }}>{fieldErrors.fullName}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div data-field="email">
                  <label className="text-xs block mb-1.5" style={{ color: "#A3A3A3" }}>
                    Email *
                  </label>
                  <input
                    type="email"
                    className="w-full px-3 py-2.5 rounded-lg text-sm"
                    style={{
                      background: "#1F1F1F",
                      border: `1px solid ${fieldErrors.email ? "#DC2626" : "#404040"}`,
                      color: "#FAFAFA",
                    }}
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  {fieldErrors.email && (
                    <p className="text-xs mt-1" style={{ color: "#FCA5A5" }}>{fieldErrors.email}</p>
                  )}
                </div>
                <div data-field="phone">
                  <label className="text-xs block mb-1.5" style={{ color: "#A3A3A3" }}>
                    Teléfono *
                  </label>
                  <input
                    type="tel"
                    className="w-full px-3 py-2.5 rounded-lg text-sm"
                    style={{
                      background: "#1F1F1F",
                      border: `1px solid ${fieldErrors.phone ? "#DC2626" : "#404040"}`,
                      color: "#FAFAFA",
                    }}
                    placeholder="+34 600 000 000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  {fieldErrors.phone && (
                    <p className="text-xs mt-1" style={{ color: "#FCA5A5" }}>{fieldErrors.phone}</p>
                  )}
                </div>
              </div>

              <div data-field="instagram">
                <label className="text-xs block mb-1.5" style={{ color: "#A3A3A3" }}>
                  Usuario de Instagram *
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2.5 rounded-lg text-sm"
                  style={{
                    background: "#1F1F1F",
                    border: `1px solid ${fieldErrors.instagram ? "#DC2626" : "#404040"}`,
                    color: "#FAFAFA",
                  }}
                  placeholder="@tuusuario"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                />
                {fieldErrors.instagram && (
                  <p className="text-xs mt-1" style={{ color: "#FCA5A5" }}>{fieldErrors.instagram}</p>
                )}
              </div>

              <div data-field="motivo">
                <label className="text-xs block mb-1.5" style={{ color: "#A3A3A3" }}>
                  ¿Qué te trae aquí? Cuéntanos tu lesión/molestia *
                </label>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-lg text-sm"
                  style={{
                    background: "#1F1F1F",
                    border: `1px solid ${fieldErrors.motivo ? "#DC2626" : "#404040"}`,
                    color: "#FAFAFA",
                  }}
                  placeholder="Ej. Llevo 3 meses con dolor de hombro al hacer snatches…"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
                {fieldErrors.motivo && (
                  <p className="text-xs mt-1" style={{ color: "#FCA5A5" }}>{fieldErrors.motivo}</p>
                )}
              </div>

              <div data-field="tratamientosPrevios">
                <label className="text-xs block mb-1.5" style={{ color: "#A3A3A3" }}>
                  ¿Qué tratamientos has probado antes? *
                </label>
                <textarea
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-lg text-sm"
                  style={{
                    background: "#1F1F1F",
                    border: `1px solid ${fieldErrors.tratamientosPrevios ? "#DC2626" : "#404040"}`,
                    color: "#FAFAFA",
                  }}
                  placeholder="Ej. Fisio durante 2 meses, descanso, antiinflamatorios…"
                  value={tratamientosPrevios}
                  onChange={(e) => setTratamientosPrevios(e.target.value)}
                />
                {fieldErrors.tratamientosPrevios && (
                  <p className="text-xs mt-1" style={{ color: "#FCA5A5" }}>{fieldErrors.tratamientosPrevios}</p>
                )}
              </div>

              <div data-field="impactoCrossfit">
                <label className="text-xs block mb-1.5" style={{ color: "#A3A3A3" }}>
                  ¿Cómo te afecta en tu CrossFit? *
                </label>
                <textarea
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-lg text-sm"
                  style={{
                    background: "#1F1F1F",
                    border: `1px solid ${fieldErrors.impactoCrossfit ? "#DC2626" : "#404040"}`,
                    color: "#FAFAFA",
                  }}
                  placeholder="Ej. No puedo hacer movimientos por encima de la cabeza, pierdo entrenos…"
                  value={impactoCrossfit}
                  onChange={(e) => setImpactoCrossfit(e.target.value)}
                />
                {fieldErrors.impactoCrossfit && (
                  <p className="text-xs mt-1" style={{ color: "#FCA5A5" }}>{fieldErrors.impactoCrossfit}</p>
                )}
              </div>

              {error && (
                <div
                  className="rounded-lg px-3 py-2 text-sm flex items-start gap-2"
                  style={{ background: "rgba(248, 113, 113, 0.1)", border: "1px solid #7F1D1D", color: "#FCA5A5" }}
                >
                  <span className="flex-shrink-0">⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={goStep2}
                className="w-full text-sm font-semibold rounded-lg"
                style={{
                  background: "#FAFAFA",
                  color: "#0A0A0A",
                  padding: 14,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Siguiente · Elegir hueco →
              </button>

              <p className="text-xs text-center" style={{ color: "#737373" }}>
                100% confidencial. Sin compromiso. Solo te llamamos para conocerte.
              </p>
            </div>
          )}

          {step === 2 && (
            <div>
              <button
                onClick={() => setStep(1)}
                className="text-xs mb-4 hover:underline"
                style={{ color: "#A3A3A3" }}
              >
                ← Volver
              </button>

              <h2 className="text-lg font-semibold mb-1">Elige cuándo te llamamos</h2>
              <p className="text-xs mb-3" style={{ color: "#A3A3A3" }}>
                Videoconsulta de 45-60 minutos. Necesitamos al menos 24 horas de antelación.
              </p>

              {/* Aviso de huso horario — las horas salen ya en la TZ del usuario */}
              <div
                className="rounded-lg px-3 py-2 mb-4 text-xs flex items-start gap-2"
                style={{ background: "rgba(252, 211, 77, 0.08)", border: "1px solid rgba(252, 211, 77, 0.25)", color: "#FCD34D" }}
              >
                <span className="flex-shrink-0">🕒</span>
                <div>
                  Las horas se muestran en tu zona horaria
                  {userTz && <> (<strong>{userTz}</strong>)</>}.
                  {!isUserInMadrid && userTz && (
                    <>
                      {" "}También verás entre paréntesis la hora equivalente en Madrid (zona horaria de nuestro equipo).
                    </>
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
                  {/* Esta semana — siempre desplegado */}
                  {thisWeekDays.length > 0 && (
                    <>
                      <div className="text-[10px] uppercase tracking-wider font-semibold pl-1" style={{ color: "#737373" }}>
                        Esta semana
                      </div>
                      {thisWeekDays.map(([dayKey, daySlots]) => (
                        <DayBlock
                          key={dayKey}
                          daySlots={daySlots}
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

                  {/* Siguientes semanas — colapsado por defecto */}
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
                          {laterDays.map(([dayKey, daySlots]) => (
                            <DayBlock
                              key={dayKey}
                              daySlots={daySlots}
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
                    <>
                      {" "}· equivale a {formatHHMM(selectedSlot.startISO, "Europe/Madrid")} en Madrid
                    </>
                  )}
                </div>
              )}

              <button
                onClick={book}
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
                {submitting ? "Reservando..." : "Confirmar reserva"}
              </button>
            </div>
          )}
        </section>

        {/* ━━━ Bloque de autoridad: equipo + credenciales (debajo del form) ━━━ */}
        <div className="mt-8">
          <TeamAuthorityBlock copy={copy} />
        </div>

        {/* ━━━ Bloques libres (casos de éxito, etc.) ━━━ */}
        {copy.blocks.map((b) => (
          <section
            key={b.id}
            className="rounded-2xl p-5 sm:p-6 mb-4"
            style={{ background: "rgba(20, 20, 20, 0.85)", border: "1px solid #262626", backdropFilter: "blur(8px)" }}
          >
            {b.imageUrl && (
              <div className="rounded-xl overflow-hidden mb-4" style={{ border: "1px solid #404040" }}>
                <img src={b.imageUrl} alt={b.title} className="w-full h-auto block" />
              </div>
            )}
            {b.title && (
              <h2 className="text-base sm:text-lg font-semibold mb-2" style={{ letterSpacing: "-0.015em", color: "#FAFAFA" }}>
                {b.title}
              </h2>
            )}
            {b.text && (
              <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#A3A3A3" }}>
                {b.text}
              </p>
            )}
          </section>
        ))}

        <footer className="mt-10 text-center text-xs" style={{ color: "#525252" }}>
          FisioFit Team · Readaptación deportiva online · {new Date().getFullYear()}
        </footer>
      </div>
    </main>
  );
}

// ============================================================================
// Bloque de un día con sus slots disponibles
// ============================================================================
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

// ============================================================================
// Bloque de autoridad: foto de grupo del equipo + credenciales
// (la imagen y los textos se editan desde Biblioteca → Landings → Agenda)
// ============================================================================
function TeamAuthorityBlock({ copy }: { copy: AgendaLandingCopy }) {
  return (
    <section
      className="rounded-2xl p-5 sm:p-6 mb-6"
      style={{
        background: "rgba(20, 20, 20, 0.85)",
        border: "1px solid #262626",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Foto de grupo del equipo (prueba social) */}
      {copy.groupImageUrl ? (
        <div className="rounded-xl overflow-hidden mb-5" style={{ border: "1px solid #404040" }}>
          <img src={copy.groupImageUrl} alt="Equipo FisioFit" className="w-full h-auto block" />
        </div>
      ) : (
        <div
          className="rounded-xl mb-5 text-center"
          style={{
            aspectRatio: "16/9",
            background: "rgba(31, 31, 31, 0.6)",
            border: "1px dashed #404040",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#525252",
            fontSize: 13,
          }}
        >
          [Equipo FisioFit]
        </div>
      )}

      {/* Copy de autoridad: combinación credenciales + cercanía */}
      <h2 className="text-base sm:text-lg font-semibold mb-2" style={{ letterSpacing: "-0.015em" }}>
        {copy.authorityTitle}
      </h2>
      <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#A3A3A3" }}>
        {copy.authorityText}
      </p>

      {/* Cards de credenciales */}
      <div className="grid grid-cols-3 gap-2 mt-5">
        {copy.stats.map((s, i) => (
          <div
            key={i}
            className="rounded-lg p-3 text-center flex flex-col items-center justify-center"
            style={{ background: "rgba(31, 31, 31, 0.7)", border: "1px solid #262626" }}
          >
            <div className="text-xl sm:text-2xl font-bold mb-0.5" style={{ color: "#FCD34D", letterSpacing: "-0.02em" }}>
              {s.value}
            </div>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: "#A3A3A3" }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
