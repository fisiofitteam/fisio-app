"use client";
import { useEffect, useRef, useState } from "react";
import { firstInstallments } from "@/lib/first-sale-terms";

type Sale = {
  id: string;
  started: boolean;
  productCode?: string;
  paymentProvider?: "stripe" | "paypal";
  url: string;
  grossAmountCents: number;
  amountCents: number;
  depositCents: number;
  installmentCount?: number | null;
  expired?: boolean;
};
const euros = (cents: number) =>
  (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
function linkFor(value: unknown) {
  if (typeof value !== "string" || !/^\/contratar\/[a-zA-Z0-9_-]+$/.test(value))
    throw Error("El enlace de contratación no es válido.");
  return new URL(value, window.location.origin).href;
}

export function ReservedFirstSale({ patientId }: { patientId: string }) {
  const endpoint = "/api/patients/" + encodeURIComponent(patientId) + "/first-sale";
  const [info, setInfo] = useState<{ depositCents: number } | null>(null),
    [sale, setSale] = useState<Sale | null>(null);
  const [retry, setRetry] = useState(0),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  const [program, setProgram] = useState("RECUPERA"),
    [months, setMonths] = useState(4),
    [price, setPrice] = useState("");
  const [provider, setProvider] = useState("stripe"),
    [parts, setParts] = useState(1),
    [working, setWorking] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const submitLock = useRef(false),
    linkInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const c = new AbortController();
    setInfo(null);
    setSale(null);
    setError("");
    setCopied(false);
    setConfirmCancel(false);
    (async () => {
      const res = await fetch(endpoint, { signal: c.signal, cache: "no-store" }),
        d = await res.json();
      if (!res.ok) throw Error(d.error || "No se pudo abrir la venta.");
      if (!Number.isSafeInteger(d.depositCents) || d.depositCents < 0)
        throw Error("No se pudo comprobar la señal.");
      const a = d.activeSale;
      if (a) linkFor(a.url);
      if (!c.signal.aborted) {
        setInfo({ depositCents: d.depositCents });
        setSale(a ?? null);
      }
    })().catch((e) => {
      if (!c.signal.aborted) setError(e.message || "No se pudo abrir la venta.");
    });
    return () => c.abort();
  }, [endpoint, retry]);

  const gross = /^\d+(?:[.,]\d{1,2})?$/.test(price.trim())
    ? Math.round(Number(price.trim().replace(",", ".")) * 100)
    : 0;
  const balance = gross - (info?.depositCents ?? 0);
  const installments =
    Number.isSafeInteger(balance) && balance > 0 ? firstInstallments(balance, parts) : null;
  const canGenerate = gross >= 100 && gross <= 9999900 && !!installments && installments.regularCents >= 100;
  async function generate() {
    if (!info || sale || submitLock.current || !canGenerate) return;
    submitLock.current = true;
    setWorking(true);
    setError("");
    setCopied(false);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productCode: program + "_" + months + "M",
          amountEuros: gross / 100,
          paymentProvider: provider,
          installmentCount: parts === 1 ? null : parts,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "No se pudo generar el enlace.");
      linkFor(d.url);
      setSale(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el enlace.");
    } finally {
      submitLock.current = false;
      setWorking(false);
    }
  }
  async function cancelLink() {
    if (!sale?.id || sale.started !== false || !confirmCancel || submitLock.current) return;
    submitLock.current = true;
    setWorking(true);
    setError("");
    try {
      const res = await fetch("/api/sales/" + encodeURIComponent(sale.id) + "/cancel", { method: "POST" });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        // A checkout might have begun just after it was displayed as cancellable.
        // Require an explicit refresh before offering cancellation again.
        if (res.status === 409 || res.status === 400) {
          setSale({ ...sale, started: true });
          setConfirmCancel(false);
        }
        throw Error(d.error || "No se pudo anular el enlace.");
      }
      const terms = sale.productCode?.match(/^(RECUPERA|CONSOLIDA)_(\d+)M$/);
      if (terms) {
        setProgram(terms[1]);
        setMonths(Number(terms[2]));
      }
      if (sale.paymentProvider) setProvider(sale.paymentProvider);
      setParts(sale.installmentCount || 1);
      setPrice((sale.grossAmountCents / 100).toFixed(2).replace(".", ","));
      setConfirmCancel(false);
      setSale(null);
      setInfo(null);
      setRetry((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo anular el enlace.");
    } finally {
      submitLock.current = false;
      setWorking(false);
    }
  }
  return (
    <section
      id="venta-inicial"
      className="card scroll-mt-4 space-y-4"
      aria-label="Primera venta del programa"
    >
      <div>
        <p className="text-xs font-semibold text-teal-700">En reserva</p>
        <h2 className="font-semibold text-lg">Vender programa</h2>
        <p className="mt-1 text-sm text-neutral-500">
          El primer pago del programa activará esta misma ficha. Los test y sus resultados se conservarán.
        </p>
      </div>
      {error && (
        <div role="alert" className="text-sm text-red-700">
          {error}{" "}
          <button
            type="button"
            className="underline"
            disabled={working}
            onClick={() => setRetry((n) => n + 1)}
          >
            Actualizar
          </button>
        </div>
      )}
      {!info && !error && (
        <p role="status" className="text-sm text-neutral-500">
          Consultando la reserva…
        </p>
      )}
      {info && sale ? (
        <div className="space-y-2">
          <p className="font-medium">
            {sale.expired ? "El enlace de contratación ha caducado" : "Enlace de contratación disponible"}
          </p>
          <p className="text-sm">
            Precio total: <b>{euros(sale.grossAmountCents)}</b> · Señal aplicada:{" "}
            <b>{euros(sale.depositCents)}</b> · Importe pendiente: <b>{euros(sale.amountCents)}</b>
          </p>
          {!sale.expired && (
            <>
              <label className="text-xs">
                Enlace para el paciente
                <input
                  ref={linkInput}
                  className="input block w-full text-sm mt-1"
                  readOnly
                  value={linkFor(sale.url)}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <button
                type="button"
                className="btn btn-accent text-sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(linkFor(sale.url));
                    setCopied(true);
                  } catch {
                    linkInput.current?.focus();
                    linkInput.current?.select();
                  }
                }}
              >
                {copied ? "Enlace copiado" : "Copiar enlace"}
              </button>
            </>
          )}
          {sale.started ? (
            <p className="text-xs text-neutral-600">
              El cobro está iniciado o pendiente de comprobar. Revisa su estado antes de cambiar la oferta.
            </p>
          ) : (
            sale.started === false &&
            sale.id &&
            (confirmCancel ? (
              <div className="rounded-lg bg-amber-50 p-3 text-sm">
                <p>El enlace anterior dejará de funcionar. Podrás preparar otro con nuevas condiciones.</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="font-medium text-red-700 underline"
                    disabled={working}
                    onClick={() => void cancelLink()}
                  >
                    {working ? "Anulando…" : "Confirmar anulación"}
                  </button>
                  <button
                    type="button"
                    className="underline"
                    disabled={working}
                    onClick={() => setConfirmCancel(false)}
                  >
                    Mantener enlace
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="block text-sm underline"
                disabled={working}
                onClick={() => setConfirmCancel(true)}
              >
                Anular enlace y cambiar oferta
              </button>
            ))
          )}
        </div>
      ) : (
        info && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void generate();
            }}
          >
            <fieldset disabled={working} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Programa
                  <select
                    className="input block w-full mt-1"
                    value={program}
                    onChange={(e) => setProgram(e.target.value)}
                  >
                    <option>RECUPERA</option>
                    <option>CONSOLIDA</option>
                  </select>
                </label>
                <label className="text-sm">
                  Duración
                  <select
                    className="input block w-full mt-1"
                    value={months}
                    onChange={(e) => setMonths(+e.target.value)}
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i} value={i + 1}>
                        {i + 1} {i === 0 ? "mes" : "meses"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Precio total del programa (€)
                  <input
                    className="input block w-full mt-1"
                    inputMode="decimal"
                    placeholder="Antes de descontar la señal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Pasarela
                  <select
                    className="input block w-full mt-1"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                  >
                    <option value="stripe">Stripe</option>
                    <option value="paypal">PayPal</option>
                  </select>
                </label>
                <label className="text-sm">
                  Cobro del importe pendiente
                  <select
                    className="input block w-full mt-1"
                    value={parts}
                    onChange={(e) => setParts(+e.target.value)}
                  >
                    {[1, 2, 3, 4, 6, 12].map((n) => (
                      <option key={n} value={n}>
                        {n === 1 ? "Pago único" : n + " cuotas"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="rounded-lg bg-teal-50 p-3 text-sm text-teal-950">
                Señal ya abonada: <b>{euros(info.depositCents)}</b>
                {gross > 0 && (
                  <>
                    {" "}
                    · Pendiente: <b>{euros(Math.max(0, balance))}</b>
                    {parts > 1 && installments && installments.regularCents >= 100 && (
                      <>
                        {" "}
                        (
                        {installments.remainderCents
                          ? `primer pago de ${euros(installments.firstCents)} y ${parts - 1} de ${euros(installments.regularCents)}`
                          : `${parts} cuotas de ${euros(installments.regularCents)}`}
                        )
                      </>
                    )}
                  </>
                )}
              </p>
              {price.trim() && !canGenerate && (
                <p className="text-sm text-amber-800">
                  Indica un precio válido de hasta 99.999 € y deja al menos 1 € pendiente por pago.
                </p>
              )}
              <button type="submit" className="btn btn-accent text-sm" disabled={working || !canGenerate}>
                {working ? "Generando…" : "Generar enlace de primera venta"}
              </button>
            </fieldset>
          </form>
        )
      )}
    </section>
  );
}
