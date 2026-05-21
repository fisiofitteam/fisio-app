import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import { PublicShell } from "@/components/PublicShell";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { redirect?: string; error?: string };
}) {
  const pro = await getActiveProfessional();
  if (pro) {
    redirect(searchParams.redirect || "/fisio");
  }

  return (
    <PublicShell
      title="Inicia sesión"
      subtitle="Accede a tu panel personal."
      heroSubtitle="Acceso del equipo · Tu sitio de trabajo diario."
      footer={
        <p className="text-center text-xs" style={{ color: "#737373" }}>
          ¿Eres paciente?{" "}
          <a href="/paciente/login" style={{ color: "#0A0A0A", textDecoration: "underline", fontWeight: 600 }}>
            Accede aquí
          </a>
        </p>
      }
    >
      <LoginForm redirectTo={searchParams.redirect} />
    </PublicShell>
  );
}
