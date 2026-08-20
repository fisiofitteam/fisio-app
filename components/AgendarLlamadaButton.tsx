"use client";

import { useEffect, useState } from "react";

/**
 * Botón "🎥 Agendar llamada" del header del paciente. Sustituye al viejo
 * "Enviar plantilla" (que servía plantillas WhatsApp para el mismo caso de
 * uso). Al pulsarlo abre un modal donde el fisio:
 *  - Elige tipo: Optimización | Renovación
 *  - Ajusta duración (viene precargada con la default del fisio)
 *  - Escribe una nota opcional
 * Genera el PatientCall y muestra el link + botón Copiar + WhatsApp.
 */

type CallType = "optimization" | "renewal";
type Defaults = { optimizationDurationMin: number; renewalDurationMin: number };

const TYPE_LABEL: Record<CallType, string> = {
  optimization: "Optimización",
  renewal: "Renovación",
};

export function AgendarLlamadaButton({
  patientId,
  patientGroupUrl,
  patientFirstName,
}: {
  patientId: string;
  /** URL del grupo de seguimiento de WhatsApp del paciente. Al pulsar el
   * botón "Enviar por WhatsApp" copiamos el mensaje al portapapeles y
   * abrimos el grupo en una pestaña nueva — el fisio pega y envía. */
  patientGroupUrl: string | null;
  patientFirstName: string;
}) {
  const [open, setOpen] = useState(false);
  const [defaults, setDefaults] = useState<Defaults | null>(null);
  const [type, setType] = useState<CallType>("optimization");
  const [durationMin, setDurationMin] = useState<string>("45");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Cargar duraciones por defecto al abrir. La primera vez pide al server,
  // después reutiliza lo cacheado en memoria del componente.
  useEffect(() => {
    if (!open || defaults) return;
    (async () => {
      const r = await fetch(`/api/patients/${patientId}/call-link`);
      if (r.ok) {
        const d = await r.json();
        setDefaults(d.defaults);
        setDurationMin(String(d.defaults.optimizationDurationMin));
      }
    })();
  }, [open, defaults, patientId]);

  // Cambiar el tipo actualiza la duración precargada (si el usuario aún no
  // la ha tocado a mano, la seguimos actualizando; si la tocó, respetamos su valor).
  function selectType(next: CallType) {
    if (!defaults) return setType(next);
    const currentDefault = type === "optimization"
      ? defaults.optimizationDurationMin
      : defaults.renewalDurationMin;
    const nextDefault = next === "optimization"
      ? defaults.optimizationDurationMin
      : defaults.renewalDurationMin;
    // Si la duración actual coincidía con el default del tipo anterior,
    // asumimos que el fisio no la había editado y la migramos al nuevo default.
    if (Number(durationMin) === currentDefault) {
      setDurationMin(String(nextDefault));
    }
    setType(next);
  }

  function resetAndClose() {
    setOpen(false);
    setType("optimization");
    setNote("");
    setError(null);
    setGeneratedUrl(null);
    setCopied(false);
    if (defaults) setDurationMin(String(defaults.optimizationDurationMin));
  }

  async function submit() {
    setCreating(true);
    setError(null);
    const dur = Math.round(Number(durationMin));
    if (!Number.isFinite(dur) || dur < 5 || dur > 240) {
      setError("Duración debe estar entre 5 y 240 minutos");
      setCreating(false);
      return;
    }
    const r = await fetch(`/api/patients/${patientId}/call-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, durationMin: dur, fisioNote: note || null }),
    });
    const d = await r.json();
    if (!r.ok) {
      setError(d?.error ?? "No se pudo generar el link");
      setCreating(false);
      return;
    }
    // La respuesta del endpoint trae `url` relativa; para compartir queremos absoluta.
    const absolute = `${window.location.origin}${d.url}`;
    setGeneratedUrl(absolute);
    setCreating(false);
    // Aviso global: si la card de la ficha está montada, se recarga sola.
    window.dispatchEvent(new CustomEvent("patient-call-created", { detail: { patientId } }));
  }

  const whatsappMessage = generatedUrl
    ? `Hola ${patientFirstName || ""}! Aquí tienes el link para reservar tu llamada de ${TYPE_LABEL[type].toLowerCase()} conmigo: ${generatedUrl}`
    : null;
  const [messageCopied, setMessageCopied] = useState(false);

  /**
   * Copia texto al portapapeles de forma robusta. Preferimos la API async
   * (navigator.clipboard) pero caemos a document.execCommand cuando el
   * navegador la niega (contextos http, iframes, permisos, etc).
   */
  async function copyText(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  function copyToClipboard() {
    if (!generatedUrl) return;
    copyText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function copyMessage() {
    if (!whatsappMessage) return;
    await copyText(whatsappMessage);
    setMessageCopied(true);
    setTimeout(() => setMessageCopied(false), 2500);
  }

  function openGroup() {
    if (!patientGroupUrl) return;
    window.open(patientGroupUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn btn-ghost text-xs"
        title="Generar link para que el paciente reserve una llamada contigo"
      >
        🎥 Agendar llamada
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => !creating && resetAndClose()}
        >
          <div
            className="w-full max-w-md rounded-xl p-5"
            style={{ background: "#FFFFFF" }}
            onClick={(e) => e.stopPropagation()}
          >
            {generatedUrl ? (
              /* Pantalla de éxito */
              <>
                <h3 className="font-semibold text-base mb-1">✅ Link generado</h3>
                <p className="text-xs text-neutral-500 mb-3">
                  Pásaselo al paciente. Podrá elegir el hueco que le venga bien de los que
                  tengas libres en tu Google Calendar.
                </p>

                {/* Mensaje preescrito editable — el fisio lo copia y lo pega
                    en el grupo. WhatsApp no permite prellenar texto en la URL
                    de grupos, así que el flujo obligado es "copiar → abrir → pegar". */}
                <label className="text-[11px] text-neutral-500 block mb-1">Mensaje sugerido</label>
                <textarea
                  readOnly
                  value={whatsappMessage ?? ""}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full text-xs p-2 rounded-lg mb-2 font-mono"
                  style={{ background: "#F5F5F5", color: "#171717", border: "1px solid #E5E5E5", minHeight: 90, resize: "vertical" }}
                />

                <div className="flex flex-wrap gap-2 mb-3">
                  <button
                    onClick={copyMessage}
                    className="text-xs font-medium px-3 py-2 rounded-lg"
                    style={{ background: "#0A0A0A", color: "#FAFAFA" }}
                  >
                    {messageCopied ? "✓ Mensaje copiado" : "📋 Copiar mensaje"}
                  </button>
                  <button
                    onClick={copyToClipboard}
                    className="text-xs font-medium px-3 py-2 rounded-lg"
                    style={{ background: "#FFFFFF", color: "#0A0A0A", border: "1px solid #E5E5E5" }}
                  >
                    {copied ? "✓ Link copiado" : "🔗 Copiar solo el link"}
                  </button>
                  {patientGroupUrl ? (
                    <button
                      onClick={openGroup}
                      className="text-xs font-medium px-3 py-2 rounded-lg"
                      style={{ background: "#22C55E", color: "#FFFFFF" }}
                      title="Abre el grupo de seguimiento — pega el mensaje copiado"
                    >
                      💬 Abrir grupo
                    </button>
                  ) : (
                    <span className="text-[11px] text-neutral-400 italic self-center">
                      Sin grupo de WhatsApp asociado al paciente
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-neutral-500 mb-3">
                  <b>Flujo:</b> pulsa <b>Copiar mensaje</b> → <b>Abrir grupo</b> → pega (Cmd+V) → enviar.
                  El link caduca en 7 días y al reservar se te añade el evento a tu Google Calendar con Meet.
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={resetAndClose}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg"
                    style={{ background: "#F5F5F5", color: "#171717" }}
                  >
                    Cerrar
                  </button>
                </div>
              </>
            ) : (
              /* Formulario de creación */
              <>
                <h3 className="font-semibold text-base mb-1">🎥 Agendar llamada</h3>
                <p className="text-xs text-neutral-500 mb-4">
                  Genera un link único de reserva para el paciente.
                </p>

                <label className="text-xs text-neutral-500 block mb-1">Tipo de llamada</label>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    onClick={() => selectType("optimization")}
                    className="text-xs font-medium px-3 py-2.5 rounded-lg"
                    style={
                      type === "optimization"
                        ? { background: "#3730A3", color: "#FFFFFF", border: "1px solid #3730A3" }
                        : { background: "#EEF2FF", color: "#3730A3", border: "1px solid #C7D2FE" }
                    }
                  >
                    🔧 Optimización
                  </button>
                  <button
                    onClick={() => selectType("renewal")}
                    className="text-xs font-medium px-3 py-2.5 rounded-lg"
                    style={
                      type === "renewal"
                        ? { background: "#78350F", color: "#FFFFFF", border: "1px solid #78350F" }
                        : { background: "#FEF3C7", color: "#78350F", border: "1px solid #FDE68A" }
                    }
                  >
                    🔁 Renovación
                  </button>
                </div>

                <label className="text-xs text-neutral-500 block mb-1">Duración (min)</label>
                <input
                  type="number"
                  min={5}
                  max={240}
                  step={5}
                  className="w-full text-sm p-2 rounded-lg mb-3"
                  style={{ border: "1px solid #E5E5E5" }}
                  value={durationMin}
                  onChange={(e) => setDurationMin(e.target.value)}
                />

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
                    onClick={resetAndClose}
                    disabled={creating}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg"
                    style={{ background: "#F5F5F5", color: "#171717" }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={submit}
                    disabled={creating}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-40"
                    style={{ background: "#0A0A0A", color: "#FAFAFA" }}
                  >
                    {creating ? "Generando…" : "Generar link"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
