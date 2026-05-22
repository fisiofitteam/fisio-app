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
const DAY_LABELS_SHORT = ["", "L", "M", "X", "J", "V", "S", "D"];

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const dayName = DAY_LABELS[d.getDay() === 0 ? 7 : d.getDay()];
  const day = d.getDate();
  const month = d.toLocaleDateString("es-ES", { month: "long" });
  return `${dayName} ${day} de ${month}`;
}

function dateKey(iso: string): string {
  // YYYY-MM-DD para agrupar slots por día
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AgendaLanding() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 — Datos personales y cuestionario
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [motivo, setMotivo] = useState("");
  const [tratamientosPrevios, setTratamientosPrevios] = useState("");
  const [impactoCrossfit, setImpactoCrossfit] = useState("");

  // Step 2 — Slots
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  // Booking
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function step1Valid(): boolean {
    return (
      fullName.trim().length >= 2 &&
      /^\S+@\S+\.\S+$/.test(email.trim()) &&
      phone.trim().length >= 6 &&
      motivo.trim().length >= 10 &&
      tratamientosPrevios.trim().length >= 5 &&
      impactoCrossfit.trim().length >= 5
    );
  }

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
    if (!step1Valid()) {
      setError("Por favor revisa los campos. Todos son obligatorios.");
      return;
    }
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
        // Redirección con datos en query para mostrar en /gracias
        const params = new URLSearchParams({
          lead: data.leadId,
          start: selectedSlot.startISO,
          name: fullName.trim().split(" ")[0],
        });
        router.push(`/agenda/gracias?${params.toString()}`);
      } else {
        setError(data.error || "No se pudo reservar. Inténtalo de nuevo.");
        // Si fue conflicto de slot, recargar huecos
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

  // Agrupar slots por día
  const slotsByDay = new Map<string, Slot[]>();
  for (const s of slots) {
    const k = dateKey(s.startISO);
    if (!slotsByDay.has(k)) slotsByDay.set(k, []);
    slotsByDay.get(k)!.push(s);
  }

  return (
    <main
      className="min-h-screen"
      style={{
        background: "linear-gradient(180deg, #0A0A0A 0%, #0F0F0F 100%)",
        color: "#FAFAFA",
      }}
    >
      <div className="max-w-2xl mx-auto px-5 py-10 pb-20">
        {/* Header */}
        <header className="mb-8 text-center">
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
            style={{ background: "#1F1F1F", border: "1px solid #262626" }}
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

        {/* Tarjeta principal */}
        <section
          className="rounded-2xl p-5 sm:p-6"
          style={{ background: "#141414", border: "1px solid #262626" }}
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
              <div>
                <label className="text-xs block mb-1.5" style={{ color: "#A3A3A3" }}>
                  Nombre y apellidos *
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2.5 rounded-lg text-sm"
                  style={{ background: "#1F1F1F", border: "1px solid #404040", color: "#FAFAFA" }}
                  placeholder="Ej. Carlos Martínez"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs block mb-1.5" style={{ color: "#A3A3A3" }}>
                    Email *
                  </label>
                  <input
                    type="email"
                    className="w-full px-3 py-2.5 rounded-lg text-sm"
                    style={{ background: "#1F1F1F", border: "1px solid #404040", color: "#FAFAFA" }}
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs block mb-1.5" style={{ color: "#A3A3A3" }}>
                    Teléfono *
                  </label>
                  <input
                    type="tel"
                    className="w-full px-3 py-2.5 rounded-lg text-sm"
                    style={{ background: "#1F1F1F", border: "1px solid #404040", color: "#FAFAFA" }}
                    placeholder="+34 600 000 000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs block mb-1.5" style={{ color: "#A3A3A3" }}>
                  ¿Qué te trae aquí? Cuéntanos tu lesión/molestia *
                </label>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-lg text-sm"
                  style={{ background: "#1F1F1F", border: "1px solid #404040", color: "#FAFAFA" }}
                  placeholder="Ej. Llevo 3 meses con dolor de hombro al hacer snatches…"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs block mb-1.5" style={{ color: "#A3A3A3" }}>
                  ¿Qué tratamientos has probado antes? *
                </label>
                <textarea
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-lg text-sm"
                  style={{ background: "#1F1F1F", border: "1px solid #404040", color: "#FAFAFA" }}
                  placeholder="Ej. Fisio durante 2 meses, descanso, antiinflamatorios…"
                  value={tratamientosPrevios}
                  onChange={(e) => setTratamientosPrevios(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs block mb-1.5" style={{ color: "#A3A3A3" }}>
                  ¿Cómo te afecta en tu CrossFit? *
                </label>
                <textarea
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-lg text-sm"
                  style={{ background: "#1F1F1F", border: "1px solid #404040", color: "#FAFAFA" }}
                  placeholder="Ej. No puedo hacer movimientos por encima de la cabeza, pierdo entrenos…"
                  value={impactoCrossfit}
                  onChange={(e) => setImpactoCrossfit(e.target.value)}
                />
              </div>

              {error && (
                <div
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ background: "rgba(248, 113, 113, 0.1)", border: "1px solid #7F1D1D", color: "#FCA5A5" }}
                >
                  {error}
                </div>
              )}

              <button
                onClick={goStep2}
                disabled={!step1Valid()}
                className="w-full text-sm font-semibold rounded-lg"
                style={{
                  background: step1Valid() ? "#FAFAFA" : "#404040",
                  color: step1Valid() ? "#0A0A0A" : "#737373",
                  padding: 14,
                  border: "none",
                  cursor: step1Valid() ? "pointer" : "not-allowed",
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
              <p className="text-xs mb-4" style={{ color: "#A3A3A3" }}>
                Videoconsulta de 60 minutos. Necesitarás 24h de antelación mínimo.
              </p>

              {loadingSlots && (
                <p className="text-sm text-center py-8" style={{ color: "#A3A3A3" }}>
                  Cargando huecos disponibles…
                </p>
              )}

              {!loadingSlots && slots.length === 0 && (
                <div
                  className="rounded-lg p-4 text-sm text-center"
                  style={{ background: "#1F1F1F", border: "1px dashed #404040", color: "#A3A3A3" }}
                >
                  No hay huecos libres en las próximas semanas. Vuelve a intentarlo más tarde o contáctanos por Instagram.
                </div>
              )}

              {!loadingSlots && slots.length > 0 && (
                <div className="space-y-4">
                  {Array.from(slotsByDay.entries()).map(([dayKey, daySlots]) => (
                    <div key={dayKey}>
                      <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#A3A3A3" }}>
                        {formatDateLabel(daySlots[0].startISO)}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {daySlots.map((s) => {
                          const isSelected = selectedSlot?.startISO === s.startISO;
                          return (
                            <button
                              key={s.startISO}
                              onClick={() => setSelectedSlot(s)}
                              className="px-3 py-2 rounded-lg text-sm font-medium tabular-nums"
                              style={{
                                background: isSelected ? "#FAFAFA" : "#1F1F1F",
                                color: isSelected ? "#0A0A0A" : "#FAFAFA",
                                border: "1px solid " + (isSelected ? "#FAFAFA" : "#404040"),
                              }}
                            >
                              {s.hhmm}
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
                  <strong>{selectedSlot.hhmm}</strong>
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
              style={{ background: "#141414", border: "1px solid #262626" }}
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
