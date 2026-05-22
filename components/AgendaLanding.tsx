"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Slot = {
  startISO: string;
  endISO: string;
  dayOfWeek: number;
  hhmm: string;
};

const DAY_LABELS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

function formatDateLabel(iso: string): string {
  // Mostrar la fecha en hora de Madrid usando Intl
  const d = new Date(iso);
  const dayName = d.toLocaleDateString("es-ES", { weekday: "long", timeZone: "Europe/Madrid" });
  const day = d.toLocaleDateString("es-ES", { day: "numeric", timeZone: "Europe/Madrid" });
  const month = d.toLocaleDateString("es-ES", { month: "long", timeZone: "Europe/Madrid" });
  return `${dayName} ${day} de ${month}`;
}

function dateKey(iso: string): string {
  // YYYY-MM-DD en Madrid para agrupar slots por día
  const d = new Date(iso);
  const parts = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }); // YYYY-MM-DD
  return parts;
}

function formatHHMM(iso: string): string {
  // HH:MM en Madrid
  const d = new Date(iso);
  return d.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  });
}

function formatHHMMLocal(iso: string): string {
  // HH:MM en zona local del navegador
  const d = new Date(iso);
  return d.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getUserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function AgendaLanding() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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

  // Huso horario del usuario (calculado en cliente)
  const [userTz, setUserTz] = useState<string | null>(null);
  useEffect(() => {
    setUserTz(getUserTimezone());
  }, []);
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
  }, [fullName, email, phone, motivo, tratamientosPrevios, impactoCrossfit]);

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

  // Agrupar slots por día (clave: YYYY-MM-DD en Madrid)
  const slotsByDay = new Map<string, Slot[]>();
  for (const s of slots) {
    const k = dateKey(s.startISO);
    if (!slotsByDay.has(k)) slotsByDay.set(k, []);
    slotsByDay.get(k)!.push(s);
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
      {/* Overlay oscuro para legibilidad */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(10, 10, 10, 0.88)", backdropFilter: "blur(2px)" }}
      />

      <div className="relative max-w-2xl mx-auto px-5 py-10 pb-20">
        {/* Header */}
        <header className="mb-8 text-center">
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
            style={{ background: "rgba(31, 31, 31, 0.7)", border: "1px solid #404040", backdropFilter: "blur(8px)" }}
          >
            <span style={{ fontSize: 22 }}>🩺</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold leading-tight mb-2" style={{ letterSpacing: "-0.02em" }}>
            Vuelve a entrenar sin dolor
          </h1>
          <p className="text-sm sm:text-base" style={{ color: "#A3A3A3" }}>
            Reserva una <strong style={{ color: "#FAFAFA" }}>videoconsulta gratuita</strong> de valoración con el equipo
            FisioFit Team. Te ayudamos a entender qué le pasa a tu cuerpo y diseñamos el plan para que vuelvas al box
            cuanto antes.
          </p>
        </header>

        {/* ━━━ Bloque de autoridad: equipo + credenciales ━━━ */}
        <TeamAuthorityBlock />

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

              {/* Aviso de huso horario */}
              <div
                className="rounded-lg px-3 py-2 mb-4 text-xs flex items-start gap-2"
                style={{ background: "rgba(252, 211, 77, 0.08)", border: "1px solid rgba(252, 211, 77, 0.25)", color: "#FCD34D" }}
              >
                <span className="flex-shrink-0">🕒</span>
                <div>
                  Las horas se muestran en <strong>horario de Madrid (España)</strong>.
                  {!isUserInMadrid && userTz && (
                    <>
                      {" "}Tu zona horaria detectada es <strong>{userTz}</strong>. Verás también la hora local equivalente.
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
                  {Array.from(slotsByDay.entries()).map(([dayKey, daySlots]) => (
                    <div
                      key={dayKey}
                      className="rounded-lg p-3"
                      style={{ background: "rgba(26, 26, 26, 0.85)", border: "1px solid #262626", backdropFilter: "blur(8px)" }}
                    >
                      <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#D4D4D4" }}>
                        {formatDateLabel(daySlots[0].startISO)}
                      </h3>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                        {daySlots.map((s) => {
                          const isSelected = selectedSlot?.startISO === s.startISO;
                          const madridTime = formatHHMM(s.startISO);
                          const localTime = !isUserInMadrid ? formatHHMMLocal(s.startISO) : null;
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
                              <div>{madridTime}</div>
                              {localTime && (
                                <div className="text-[10px] mt-0.5" style={{ opacity: 0.6 }}>
                                  {localTime} local
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
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
                  ✓ Has elegido el <strong>{formatDateLabel(selectedSlot.startISO)}</strong> a las{" "}
                  <strong>{formatHHMM(selectedSlot.startISO)}</strong> (hora Madrid)
                  {!isUserInMadrid && (
                    <>
                      {" "}· {formatHHMMLocal(selectedSlot.startISO)} en tu hora local
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

        {/* Beneficios */}
        <section className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: "🎯", title: "Diagnóstico claro", desc: "Sabrás exactamente qué te ocurre y por qué" },
            { icon: "📋", title: "Plan personalizado", desc: "Ejercicios y readaptación para tu caso" },
            { icon: "💪", title: "Vuelta al box", desc: "El objetivo es que vuelvas a entrenar pleno" },
          ].map((b, i) => (
            <div
              key={i}
              className="rounded-xl p-4"
              style={{ background: "rgba(20, 20, 20, 0.85)", border: "1px solid #262626", backdropFilter: "blur(8px)" }}
            >
              <div className="text-xl mb-1.5">{b.icon}</div>
              <h3 className="text-sm font-semibold mb-0.5">{b.title}</h3>
              <p className="text-xs" style={{ color: "#A3A3A3" }}>
                {b.desc}
              </p>
            </div>
          ))}
        </section>

        <footer className="mt-10 text-center text-xs" style={{ color: "#525252" }}>
          FisioFit Team · Readaptación deportiva online · {new Date().getFullYear()}
        </footer>
      </div>
    </main>
  );
}

// ============================================================================
// Bloque de autoridad: foto del equipo + credenciales
// ============================================================================
//
// Para añadir/editar miembros:
//  1. Sube la foto a /public/team/{nombre-archivo}.jpg
//  2. Añade entrada en TEAM_MEMBERS abajo (foto + nombre + rol)
//  3. Deploy
//
// El layout se elige automáticamente según el número de miembros:
//  - 3 fotos: fila horizontal
//  - 4 fotos: grid 2x2
//  - 5+ fotos: grid 3 columnas (4-5 quedan equilibradas)
//
type TeamMember = { photo: string; name: string; role: string };

const TEAM_MEMBERS: TeamMember[] = [
  // TODO: Ales subirá las fotos a /public/team/ y rellenará este array.
  // Ejemplo:
  // { photo: "/team/ales.jpg", name: "Ales Faus", role: "CEO y Fisioterapeuta" },
  // { photo: "/team/alba.jpg", name: "Alba Maldonado", role: "Fisioterapeuta" },
  // { photo: "/team/miguel.jpg", name: "Miguel Castro", role: "Head of Success" },
];

function TeamAuthorityBlock() {
  const hasPhotos = TEAM_MEMBERS.length > 0;
  // Layout dinámico según cantidad de miembros
  const gridCols =
    TEAM_MEMBERS.length <= 3
      ? "grid-cols-3"
      : TEAM_MEMBERS.length === 4
      ? "grid-cols-2 sm:grid-cols-4"
      : "grid-cols-3";

  return (
    <section
      className="rounded-2xl p-5 sm:p-6 mb-6"
      style={{
        background: "rgba(20, 20, 20, 0.85)",
        border: "1px solid #262626",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Foto/collage del equipo */}
      {hasPhotos ? (
        <div className={`grid ${gridCols} gap-3 mb-5`}>
          {TEAM_MEMBERS.map((m) => (
            <div key={m.name} className="text-center">
              <div
                className="w-full rounded-xl overflow-hidden mb-2"
                style={{
                  aspectRatio: "1/1",
                  background: "#262626",
                  border: "1px solid #404040",
                }}
              >
                <img
                  src={m.photo}
                  alt={m.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="text-xs font-semibold leading-tight" style={{ color: "#FAFAFA" }}>
                {m.name}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: "#A3A3A3" }}>
                {m.role}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Placeholder elegante mientras no hay fotos cargadas
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
        Un equipo de fisios especializado en CrossFit
      </h2>
      <p className="text-sm leading-relaxed" style={{ color: "#A3A3A3" }}>
        Llevamos <strong style={{ color: "#FAFAFA" }}>+10 años en boxes</strong>, entrenando y tratando a atletas
        como tú. No somos fisios genéricos: entendemos las exigencias del CrossFit porque las hemos vivido en
        primera persona.
      </p>

      {/* Cards de credenciales */}
      <div className="grid grid-cols-3 gap-2 mt-5">
        <div
          className="rounded-lg p-3 text-center"
          style={{ background: "rgba(31, 31, 31, 0.7)", border: "1px solid #262626" }}
        >
          <div
            className="text-xl sm:text-2xl font-bold mb-0.5"
            style={{ color: "#FCD34D", letterSpacing: "-0.02em" }}
          >
            +600
          </div>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: "#A3A3A3" }}>
            atletas recuperados
          </div>
        </div>
        <div
          className="rounded-lg p-3 text-center"
          style={{ background: "rgba(31, 31, 31, 0.7)", border: "1px solid #262626" }}
        >
          <div
            className="text-xl sm:text-2xl font-bold mb-0.5"
            style={{ color: "#FCD34D", letterSpacing: "-0.02em" }}
          >
            +10
          </div>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: "#A3A3A3" }}>
            años en boxes
          </div>
        </div>
        <div
          className="rounded-lg p-3 text-center flex flex-col items-center justify-center"
          style={{ background: "rgba(31, 31, 31, 0.7)", border: "1px solid #262626" }}
        >
          <div
            className="text-base sm:text-lg font-bold mb-0.5"
            style={{ color: "#FCD34D", letterSpacing: "-0.02em" }}
          >
            ✓
          </div>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: "#A3A3A3" }}>
            Fisios colegiados
          </div>
        </div>
      </div>
    </section>
  );
}
