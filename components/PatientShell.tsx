// Envoltorio visual común de la app del paciente: foto de box (oscurecida en
// modo oscuro, aclarada con blanco en modo claro) + halo amarillo + grano.
// El tema se aplica por clase (.patient-light) y todo sale de variables CSS.
import type { Theme } from "@/lib/theme";
import { PatientTimezoneSync } from "@/components/PatientTimezoneSync";

const BOX_IMAGE_URL = "/box.jpg";

export function PatientShell({ children, theme = "dark" }: { children: React.ReactNode; theme?: Theme }) {
  return (
    <div
      className={`patient-scope min-h-screen relative ${theme === "light" ? "patient-light" : ""}`}
      style={{
        backgroundImage: `var(--p-overlay), url(${BOX_IMAGE_URL})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Halo cálido en esquina superior derecha */}
      <div className="fixed inset-0 pointer-events-none" style={{ backgroundImage: "var(--p-halo)" }} />
      {/* Grano sutil */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(rgba(var(--p-grain-rgb), var(--p-grain)) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />

      <PatientTimezoneSync />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
