import { redirect } from "next/navigation";
import { getActivePatient } from "@/lib/auth";
import { PatientLoginForm } from "./PatientLoginForm";
import { PublicShell } from "@/components/PublicShell";

export default async function PatientLoginPage() {
  const patient = await getActivePatient();
  if (patient) {
    redirect(`/paciente/${patient.id}`);
  }

  return (
    <PublicShell
      title="Accede como paciente"
      subtitle="Te enviamos un código por email. Sin contraseñas."
      heroTitle={
        <>
          Tu proceso,
          <br />
          tu progreso,
          <br />
          <span className="brand-gradient-text">contigo.</span>
        </>
      }
      heroSubtitle="Acceso de paciente · Tu programa en el bolsillo."
      footer={
        <p className="text-center text-xs" style={{ color: "#737373" }}>
          ¿Eres del equipo?{" "}
          <a href="/login" style={{ color: "#0A0A0A", textDecoration: "underline", fontWeight: 600 }}>
            Accede aquí
          </a>
        </p>
      }
    >
      <PatientLoginForm />
    </PublicShell>
  );
}
