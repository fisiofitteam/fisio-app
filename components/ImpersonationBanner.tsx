"use client";

import { useState } from "react";
import { UserCog } from "lucide-react";

// Barra visible mientras el CEO está viendo el panel como otro miembro.
export function ImpersonationBanner({ name }: { name: string }) {
  const [leaving, setLeaving] = useState(false);

  async function stop() {
    setLeaving(true);
    await fetch("/api/admin/impersonate/stop", { method: "POST" });
    window.location.href = "/fisio/equipo";
  }

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2 mb-3 rounded-lg text-sm"
      style={{ background: "#FEF3C7", color: "#7C2D12", border: "1px solid #FCD34D" }}
    >
      <span className="flex items-center gap-2 min-w-0">
        <UserCog size={16} className="flex-shrink-0" />
        <span className="truncate">
          Modo superadmin: estás viendo el panel como <strong>{name}</strong>.
        </span>
      </span>
      <button
        onClick={stop}
        disabled={leaving}
        className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-md"
        style={{ background: "#0A0A0A", color: "#FFFFFF" }}
      >
        {leaving ? "Volviendo…" : "Volver a mi cuenta"}
      </button>
    </div>
  );
}
