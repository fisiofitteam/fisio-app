"use client";

import { useEffect, useState } from "react";

export function RenewalThankYouClient({ token }: { token: string }) {
  const [status, setStatus] = useState<"checking" | "paid" | "slow">("checking");

  useEffect(() => {
    if (!token) {
      setStatus("slow");
      return;
    }
    let tries = 0;
    let stop = false;

    async function poll() {
      if (stop) return;
      tries++;
      try {
        const res = await fetch(`/api/renewal/${token}/status`);
        const d = await res.json().catch(() => ({}));
        if (d.status === "paid") {
          setStatus("paid");
          return;
        }
      } catch {}
      if (tries >= 40) {
        // ~60s sin confirmación: el pago puede tardar en propagarse
        setStatus("slow");
        return;
      }
      setTimeout(poll, 1500);
    }
    poll();
    return () => {
      stop = true;
    };
  }, [token]);

  return (
    <main className="min-h-screen flex items-center justify-center px-5 py-10 bg-neutral-50">
      <div className="max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-3xl font-bold" style={{ letterSpacing: "-0.03em" }}>
            Fisio<span className="brand-gradient-text">Fit</span>
          </div>
        </div>

        <div className="card text-center py-10">
          {status === "checking" && (
            <>
              <div className="text-4xl mb-3">⏳</div>
              <h1 className="font-semibold text-lg mb-1">Confirmando tu pago...</h1>
              <p className="text-sm text-neutral-500">Un momento, estamos registrando tu renovación.</p>
            </>
          )}
          {status === "paid" && (
            <>
              <div className="text-4xl mb-3">✅</div>
              <h1 className="font-semibold text-lg mb-1">¡Renovación confirmada!</h1>
              <p className="text-sm text-neutral-500">
                Tu programa se ha renovado correctamente. ¡Seguimos!
              </p>
            </>
          )}
          {status === "slow" && (
            <>
              <div className="text-4xl mb-3">📩</div>
              <h1 className="font-semibold text-lg mb-1">Pago recibido</h1>
              <p className="text-sm text-neutral-500">
                Si el pago se ha completado, tu renovación quedará registrada en unos minutos. Puedes cerrar esta página.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
