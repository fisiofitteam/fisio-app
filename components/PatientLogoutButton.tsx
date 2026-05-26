"use client";

import { LogOut } from "lucide-react";
import { patientLogout } from "@/components/PatientSessionMenu";

export function PatientLogoutButton() {
  return (
    <button
      onClick={() => { if (confirm("¿Cerrar sesión?")) patientLogout(); }}
      className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg"
      style={{ background: "var(--p-surface-2)", color: "var(--p-text)" }}
    >
      <LogOut size={15} /> Salir
    </button>
  );
}
