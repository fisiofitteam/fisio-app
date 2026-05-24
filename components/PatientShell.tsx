// Envoltorio visual común de la app del paciente: foto de box oscurecida +
// halo amarillo + grano + scope de estilos. Sin lógica: solo presentación.
const BOX_IMAGE_URL = "/box.jpg";

export function PatientShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen relative"
      style={{
        backgroundImage: `
          linear-gradient(180deg, rgba(10,10,10,0.90) 0%, rgba(10,10,10,0.96) 100%),
          url(${BOX_IMAGE_URL})
        `,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Halo cálido amarillo en esquina superior derecha */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 85% -10%, rgba(252, 211, 77, 0.18) 0, transparent 45%), radial-gradient(circle at 5% 105%, rgba(245, 158, 11, 0.10) 0, transparent 40%)",
        }}
      />
      {/* Grano sutil */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />

      <div className="relative patient-scope">{children}</div>
    </div>
  );
}
