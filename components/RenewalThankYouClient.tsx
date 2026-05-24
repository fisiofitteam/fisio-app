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
    <main
      className="min-h-screen w-full"
      style={{
        backgroundColor: "#0A0A0A",
        backgroundImage: "url('/box.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="min-h-screen w-full flex items-center justify-center px-5 py-10" style={{ background: "rgba(10, 10, 10, 0.78)" }}>
        <div className="max-w-md w-full">
          <div
            className="rounded-2xl p-8 text-center"
            style={{ background: "rgba(20, 20, 20, 0.85)", border: "1px solid #262626", backdropFilter: "blur(8px)" }}
          >
            {status === "checking" && (
              <>
                <div className="text-4xl mb-3">⏳</div>
                <h1 className="font-bold text-xl mb-1" style={{ color: "#FAFAFA" }}>Confirmando tu pago...</h1>
                <p className="text-sm" style={{ color: "#A3A3A3" }}>Un momento, estamos registrando tu renovación.</p>
              </>
            )}
            {status === "paid" && (
              <>
                <div className="text-4xl mb-3">✅</div>
                <h1 className="font-bold text-xl mb-1" style={{ color: "#FAFAFA" }}>¡Renovación confirmada!</h1>
                <p className="text-sm" style={{ color: "#A3A3A3" }}>Tu programa se ha renovado correctamente. ¡Seguimos!</p>
              </>
            )}
            {status === "slow" && (
              <>
                <div className="text-4xl mb-3">📩</div>
                <h1 className="font-bold text-xl mb-1" style={{ color: "#FAFAFA" }}>Pago recibido</h1>
                <p className="text-sm" style={{ color: "#A3A3A3" }}>
                  Si el pago se ha completado, tu renovación quedará registrada en unos minutos. Puedes cerrar esta página.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
