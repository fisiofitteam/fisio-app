"use client";

import { useEffect, useState } from "react";

type Renewal = {
  id: string;
  programType: string | null;
  periodMonths: number;
  startDate: string | null;
  endDate: string | null;
  status: string;
  amountPaid: number | null;
  notes: string | null;
  isReservation?: boolean;
};

type Pause = {
  id: string;
  startDate: string;
  endDate: string;
  actualEndDate: string | null;
  status: string;
  reason: string | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  RECUPERA: { bg: "#FEF3C7", color: "#7C2D12" },
  CONSOLIDA: { bg: "#DBEAFE", color: "#1E40AF" },
  ADVANCE: { bg: "#E0F2FE", color: "#075985" },
};

export function SubscriptionPeriodsBlock({
  patientId,
  isManager,
  isCeo,
  canEdit,
}: {
  patientId: string;
  isManager: boolean;
  isCeo: boolean;
  // Habilita los botones de editar/borrar en cada periodo. Para fisio se
  // pasa true solo cuando el paciente fue añadido manualmente o legacy
  // (sin Sale Stripe). Si no se pasa, cae al permiso histórico (manager).
  canEdit?: boolean;
}) {
  const allowEdit = canEdit ?? isManager;
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [pauses, setPauses] = useState<Pause[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Renewal | null>(null);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    const [rRes, pRes] = await Promise.all([
      fetch(`/api/renewals?patientId=${patientId}`),
      fetch(`/api/program-pauses?patientId=${patientId}`),
    ]);
    const r = rRes.ok ? await rRes.json() : [];
    const p = pRes.ok ? await pRes.json() : [];
    setRenewals(r);
    setPauses(p.filter((x: Pause) => x.status !== "cancelled"));
    if (!silent) setLoading(false);
  }

  async function handleDelete(r: Renewal) {
    const label = r.programType ? `${r.programType}` : "periodo";
    if (!confirm(`¿Eliminar este ${label}?\n\nNo se puede deshacer.`)) return;
    const res = await fetch(`/api/renewals?id=${r.id}`, { method: "DELETE" });
    if (res.ok) {
      await load();
      window.location.reload(); // refresca el círculo del paciente
    } else {
      alert("No se pudo eliminar");
    }
  }

  useEffect(() => {
    // Saneamos al primer load (en silencio): elimina periodos basura
    // de versiones antiguas, cierra periodos vencidos, etc.
    (async () => {
      try {
        await fetch(`/api/renewals/sanitize?patientId=${patientId}`, { method: "POST" });
      } catch {}
      await load();
    })();
  }, [patientId]);

  // Para cada renewal, encontrar las pausas que cayeron dentro de ese periodo
  function pausesInsidePeriod(r: Renewal): Pause[] {
    if (!r.startDate || !r.endDate) return [];
    const periodStart = new Date(r.startDate).getTime();
    const periodEnd = new Date(r.endDate).getTime();
    return pauses.filter((p) => {
      const pStart = new Date(p.startDate).getTime();
      return pStart >= periodStart && pStart < periodEnd;
    });
  }

  return (
    <div className="mt-4 pt-4" style={{ borderTop: "1px dashed #E5E5E5" }}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">Periodos de suscripción</h3>
        <button
          onClick={() => setAdding(true)}
          className="text-xs font-medium px-2.5 py-1.5 rounded-md"
          style={{ background: "#0A0A0A", color: "#FAFAFA" }}
        >
          + Generar enlace de renovación
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-neutral-500 italic">Cargando...</p>
      ) : renewals.length === 0 ? (
        <p className="text-xs text-neutral-500 italic">
          Sin periodos registrados. Cuando renueve el paciente, crea aquí el nuevo periodo.
        </p>
      ) : (
        <div className="space-y-2">
          {renewals.map((r, i) => {
            const periodPauses = pausesInsidePeriod(r);
            const typeColor = r.programType ? TYPE_COLORS[r.programType] : null;
            const isScheduled = r.status === "scheduled";
            return (
              <div
                key={r.id}
                className="rounded-lg px-3 py-2.5 text-sm"
                style={{
                  background: r.status === "active" ? "#FAFAFA" : isScheduled ? "#FFFBEB" : "#FFFFFF",
                  border: r.status === "active"
                    ? "1px solid #0A0A0A"
                    : isScheduled
                    ? "1px dashed #F59E0B"
                    : "1px solid #E5E5E5",
                }}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                    <span className="text-xs font-bold tracking-wider" style={{ color: "#525252" }}>
                      PERIODO {i + 1}
                    </span>
                    {r.status === "active" && (
                      <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: "#0A0A0A", color: "#FAFAFA" }}>
                        ACTUAL
                      </span>
                    )}
                    {isScheduled && (
                      <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: "#F59E0B", color: "#FFFFFF" }}>
                        PROGRAMADO · empieza {formatDate(r.startDate)}
                      </span>
                    )}
                    {r.programType && typeColor && (
                      <span
                        className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded"
                        style={{ background: typeColor.bg, color: typeColor.color }}
                      >
                        {r.programType}
                      </span>
                    )}
                    {r.isReservation && (
                      <span
                        className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded"
                        style={{ background: "#FEF3C7", color: "#78350F", border: "1px solid #F59E0B" }}
                        title="Reserva de plaza: señal para mantener el sitio hasta que renueve del todo."
                      >
                        🎟️ RESERVA
                      </span>
                    )}
                  </div>
                  {allowEdit && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => setEditing(r)}
                        className="text-xs text-neutral-500 hover:text-neutral-900 px-1"
                        title="Editar"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => handleDelete(r)}
                        className="text-xs text-neutral-500 hover:text-red-600 px-1"
                        title="Eliminar"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>

                <div className="text-xs flex items-baseline gap-3 flex-wrap" style={{ color: "#737373" }}>
                  <span className="font-medium" style={{ color: "#0A0A0A" }}>
                    {(() => {
                      // Calcular meses reales desde las fechas; fallback al
                      // periodMonths guardado si faltan.
                      const s = r.startDate ? new Date(r.startDate) : null;
                      const e = r.endDate ? new Date(r.endDate) : null;
                      let m: number = r.periodMonths ?? 0;
                      if (s && e) {
                        m = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
                        if (e.getDate() < s.getDate()) m -= 1;
                        m = Math.max(0, m);
                      }
                      return `${m} ${m === 1 ? "mes" : "meses"}`;
                    })()}
                  </span>
                  <span>
                    {formatDate(r.startDate)} → {formatDate(r.endDate)}
                  </span>
                  {r.amountPaid != null && (
                    <span>
                      {r.amountPaid.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}
                    </span>
                  )}
                </div>

                {periodPauses.length > 0 && (
                  <div className="text-[10px] italic mt-1.5" style={{ color: "#737373" }}>
                    {periodPauses.map((p) => {
                      const days = daysBetween(p.startDate, p.actualEndDate || p.endDate);
                      return `Pausa ${days}d (${formatDate(p.startDate)} – ${formatDate(p.actualEndDate || p.endDate)})`;
                    }).join(" · ")}
                  </div>
                )}

                {r.notes && (
                  <div className="text-[11px] mt-1" style={{ color: "#737373" }}>
                    {r.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <AddRenewalModal
          patientId={patientId}
          canManualRenewal={allowEdit}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
            window.location.reload();
          }}
        />
      )}

      {editing && (
        <EditRenewalModal
          renewal={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

function AddRenewalModal({
  patientId,
  canManualRenewal,
  onClose,
  onSaved,
}: {
  patientId: string;
  /** Muestra el toggle "manual (sin pago)". El backend hace la comprobación
   *  fina (managers siempre; fisio solo si el paciente no vino por Stripe),
   *  así que aquí basta con reflejar la misma intención — antes el toggle
   *  se ocultaba a todo el mundo excepto al CEO, y el head_success + fisio
   *  no podían registrar renovaciones sin pago aunque el backend sí les
   *  dejaba. */
  canManualRenewal: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"link" | "manual">("link");
  const [programType, setProgramType] = useState("CONSOLIDA");
  const [periodMonths, setPeriodMonths] = useState("4");
  const [amountEuros, setAmountEuros] = useState("");
  const [notes, setNotes] = useState("");
  // Fraccionamiento del enlace de pago (null/1 = pago único; 2..12 = N cuotas mensuales vía PayPal)
  const [installmentCount, setInstallmentCount] = useState<number | null>(null);
  // Reserva de plaza: señal fija (edit importe/duración) para mantener el sitio
  // hasta que renueve del todo. Fuerza pago único y no descuenta del futuro.
  const [isReservation, setIsReservation] = useState(false);
  // Reserva pendiente de aplicar: si el paciente ya pagó una reserva y aún
  // no ha renovado del todo, se descuenta automáticamente en la renovación real.
  const [pendingReservation, setPendingReservation] = useState<{ id: string; amount: number } | null>(null);
  // Fecha de inicio opcional solo en modo manual. Si se rellena, el
  // endpoint la respeta (puede ser pasada o futura). Si se deja vacía,
  // aplica la lógica antigua: activo empieza hoy, scheduled tras el actual.
  const [customStartDate, setCustomStartDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Al montar el modal, consultamos si hay reserva pendiente para
  // aplicar el descuento automático cuando el fisio genere una renovación real.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/patients/${patientId}/renewal-link`);
        const data = await res.json().catch(() => ({}));
        if (data?.pendingReservation) setPendingReservation(data.pendingReservation);
      } catch {}
    })();
  }, [patientId]);

  async function generate() {
    setError("");
    setSaving(true);
    const res = await fetch(`/api/patients/${patientId}/renewal-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        programType,
        durationMonths: Number(periodMonths),
        amountEuros: Number(amountEuros),
        installmentCount: isReservation ? null : installmentCount,
        isReservation,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.url) {
      setLink(`${window.location.origin}${data.url}`);
    } else {
      setError(data.error || "No se pudo generar el enlace");
    }
    setSaving(false);
  }

  async function saveManual() {
    setError("");
    const months = Number(periodMonths);
    if (!Number.isFinite(months) || months <= 0) {
      setError("Indica una duración en meses (mayor que 0).");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/renewals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId,
        programType,
        periodMonths: months,
        amountPaid: amountEuros || null,
        notes: notes.trim() || null,
        startDate: customStartDate
          ? new Date(customStartDate).toISOString()
          : undefined,
      }),
    });
    if (res.ok) {
      onSaved();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se pudo registrar la renovación");
      setSaving(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  const amountInvalid = !amountEuros || Number(amountEuros) <= 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-semibold">Renovación</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>

        {link ? (
          // Enlace generado
          <div className="space-y-3 mt-2">
            <p className="text-xs text-neutral-500">
              Comparte este enlace con el paciente. Cuando pague, la renovación se registrará automáticamente
              (empezará al terminar su periodo actual, o de inmediato si ya venció).
            </p>
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2 text-xs break-all font-mono">
              {link}
            </div>
            <div className="flex gap-2">
              <button onClick={copy} className="btn btn-primary text-sm flex-1">
                {copied ? "¡Copiado!" : "Copiar enlace"}
              </button>
              <a href={link} target="_blank" rel="noopener noreferrer" className="btn text-sm flex-1 text-center">
                Abrir
              </a>
            </div>
            <p className="text-[11px] text-neutral-400">El enlace caduca en 7 días.</p>
          </div>
        ) : (
          <div className="space-y-3 mt-2">
            {/* Selector de modo (link / manual). Antes solo lo veía el CEO;
                ahora también head_success y fisios que pueden editar la
                suscripción del paciente (el backend aplica el check fino). */}
            {canManualRenewal && (
              <div className="flex gap-1 p-1 rounded-lg bg-neutral-100">
                <button
                  type="button"
                  onClick={() => { setMode("link"); setError(""); }}
                  className={`flex-1 text-xs py-1.5 rounded-md font-medium ${mode === "link" ? "bg-white shadow-sm" : "text-neutral-500"}`}
                >
                  💳 Enlace de pago
                </button>
                <button
                  type="button"
                  onClick={() => { setMode("manual"); setError(""); }}
                  className={`flex-1 text-xs py-1.5 rounded-md font-medium ${mode === "manual" ? "bg-white shadow-sm" : "text-neutral-500"}`}
                >
                  ✍️ Manual (sin pago)
                </button>
              </div>
            )}

            <p className="text-xs text-neutral-500">
              {mode === "link"
                ? "Genera un enlace de pago. El precio lo defines tú aquí."
                : "Registra la renovación directamente (sin pago online). Solo para casos puntuales."}
            </p>

            {/* Aviso de reserva pendiente que se descontará automáticamente
                cuando se genere una renovación real (no aplica en modo
                reserva ni en modo manual). */}
            {mode === "link" && !isReservation && pendingReservation && (
              <div className="rounded-lg p-2.5 border" style={{ background: "#E0F2FE", borderColor: "#0284C7" }}>
                <p className="text-xs" style={{ color: "#075985" }}>
                  <strong>🎟️ Reserva pendiente de aplicar</strong>: {pendingReservation.amount.toFixed(2).replace(".", ",")} €
                </p>
                <p className="text-[11px] mt-1" style={{ color: "#0369A1" }}>
                  Pon el importe TOTAL nominal de la renovación — se descontará la reserva
                  automáticamente al generar el link. El cliente pagará {" "}
                  <strong>importe − {pendingReservation.amount.toFixed(2).replace(".", ",")} €</strong>.
                </p>
              </div>
            )}

            {/* Toggle Reserva de plaza (solo en modo enlace y sin reserva
                pendiente ya cobrada — no tiene sentido apilar dos reservas). */}
            {mode === "link" && !pendingReservation && (
              <div className="rounded-lg p-2.5 border" style={{ background: isReservation ? "#FEF3C7" : "#FAFAFA", borderColor: isReservation ? "#F59E0B" : "#E5E7EB" }}>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isReservation}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setIsReservation(on);
                      if (on) {
                        setAmountEuros("100");
                        setPeriodMonths("1");
                        setInstallmentCount(null);
                      }
                    }}
                  />
                  <span className="text-xs font-semibold" style={{ color: isReservation ? "#78350F" : "#374151" }}>
                    🎟️ Reserva de plaza (señal)
                  </span>
                </label>
                {isReservation && (
                  <p className="text-[11px] mt-1.5" style={{ color: "#78350F" }}>
                    El paciente paga una señal para guardar su sitio y mantener acceso a la app.
                    <strong> Se descontará automáticamente</strong> del importe cuando renueve del todo.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="text-xs text-neutral-500 block mb-1">¿A qué programa renueva?</label>
              <div className="flex gap-1">
                {["RECUPERA", "CONSOLIDA", "ADVANCE"].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProgramType(p)}
                    className={`flex-1 text-xs px-2 py-2 rounded border font-medium ${
                      programType === p ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Duración (meses)</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  step="1"
                  className="input text-sm w-full"
                  value={periodMonths}
                  onChange={(e) => setPeriodMonths(e.target.value)}
                  placeholder="Ej. 4"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Importe (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input text-sm w-full"
                  value={amountEuros}
                  onChange={(e) => setAmountEuros(e.target.value)}
                  placeholder="0,00"
                />
              </div>
            </div>

            {mode === "manual" && (
              <>
                <div>
                  <label className="text-xs text-neutral-500 block mb-1">
                    Fecha de inicio (opcional)
                  </label>
                  <input
                    type="date"
                    className="input text-sm w-full"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                  />
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Si la dejas vacía: empieza hoy (o al terminar el periodo
                    actual si aún está vigente). Si la rellenas, respetamos
                    ese día — puede ser futura o pasada.
                  </p>
                </div>
                <div>
                  <label className="text-xs text-neutral-500 block mb-1">Notas (opcional)</label>
                  <input
                    type="text"
                    className="input text-sm w-full"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Cualquier nota del cierre"
                  />
                </div>
                {amountEuros && Number(amountEuros) > 0 && (
                  <p className="text-[11px] italic" style={{ color: "#737373" }}>
                    💰 Se registrará como ingreso "Renovación" en Finanzas.
                  </p>
                )}
              </>
            )}

            {/* Fraccionamiento (solo en modo enlace de pago y no reserva).
                Una reserva es siempre pago único, no tiene sentido cuotas. */}
            {mode === "link" && !isReservation && (
              <div>
                <label className="text-xs text-neutral-500 block mb-1">¿Cómo lo cobramos?</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {[null, 2, 3, 4, 6].map((n) => {
                    const active = installmentCount === n;
                    const label = n === null ? "1 pago" : `${n} cuotas`;
                    return (
                      <button
                        key={n ?? "one"}
                        type="button"
                        onClick={() => setInstallmentCount(n)}
                        className={`px-2 py-2 rounded-lg border text-xs font-medium ${
                          active
                            ? "bg-neutral-900 text-white border-neutral-900"
                            : "bg-white border-neutral-200 hover:bg-neutral-50"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {installmentCount !== null && amountEuros && Number(amountEuros) > 0 && (
                  <p className="text-[11px] text-neutral-500 italic mt-1.5">
                    PayPal cobrará {installmentCount} × {(Number(amountEuros) / installmentCount).toFixed(2).replace(".", ",")} € mensuales.
                  </p>
                )}
                {installmentCount === null && (
                  <p className="text-[11px] text-neutral-500 italic mt-1.5">
                    Pago único. PayPal ofrecerá "Paga en 3 plazos" si el cliente califica.
                  </p>
                )}
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            {mode === "link" ? (
              <button
                onClick={generate}
                disabled={saving || amountInvalid}
                className="w-full text-sm font-medium"
                style={{ background: "#0A0A0A", color: "#FAFAFA", padding: 11, borderRadius: 10, border: "none", opacity: saving || amountInvalid ? 0.5 : 1 }}
              >
                {saving ? "Generando..." : "Generar enlace de pago"}
              </button>
            ) : (
              <button
                onClick={saveManual}
                disabled={saving}
                className="w-full text-sm font-medium"
                style={{ background: "#0A0A0A", color: "#FAFAFA", padding: 11, borderRadius: 10, border: "none", opacity: saving ? 0.5 : 1 }}
              >
                {saving ? "Registrando..." : "Registrar renovación manual"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EditRenewalModal({
  renewal,
  onClose,
  onSaved,
}: {
  renewal: Renewal;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [programType, setProgramType] = useState(renewal.programType || "CONSOLIDA");
  const [periodMonths, setPeriodMonths] = useState(String(renewal.periodMonths));
  const [startDate, setStartDate] = useState(renewal.startDate ? renewal.startDate.split("T")[0] : "");
  const [amountPaid, setAmountPaid] = useState(renewal.amountPaid != null ? String(renewal.amountPaid) : "");
  const [notes, setNotes] = useState(renewal.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    setSaving(true);
    const res = await fetch("/api/renewals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: renewal.id,
        programType,
        periodMonths: Number(periodMonths),
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        amountPaid: amountPaid === "" ? null : Number(amountPaid),
        notes: notes.trim() || null,
      }),
    });
    if (res.ok) {
      onSaved();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "No se pudo guardar");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full p-5 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">Editar periodo</h3>
          <button onClick={onClose} className="text-neutral-400 text-xl leading-none">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-neutral-500 block mb-1">Programa</label>
            <div className="flex gap-1">
              {["RECUPERA", "CONSOLIDA", "ADVANCE"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProgramType(p)}
                  className={`flex-1 text-xs px-2 py-2 rounded border font-medium ${
                    programType === p ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-200"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Fecha de inicio</label>
              <input
                type="date"
                className="input text-sm w-full"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Duración (meses)</label>
              <input
                type="number"
                min="1"
                max="60"
                step="1"
                className="input text-sm w-full"
                value={periodMonths}
                onChange={(e) => setPeriodMonths(e.target.value)}
                placeholder="Ej. 4"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Importe (€)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="input text-sm w-full"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              placeholder="0,00"
            />
          </div>

          <div>
            <label className="text-xs text-neutral-500 block mb-1">Notas</label>
            <input
              type="text"
              className="input text-sm w-full"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <p className="text-[11px] italic" style={{ color: "#737373" }}>
            La fecha de fin se recalcula automáticamente con el inicio + meses.
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={save}
            disabled={saving}
            className="w-full text-sm font-medium"
            style={{
              background: "#0A0A0A",
              color: "#FAFAFA",
              padding: 11,
              borderRadius: 10,
              border: "none",
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
