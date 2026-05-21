import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { LoginLanding } from "@/components/LoginLanding";
import { PublicShell } from "@/components/PublicShell";

export default async function HomePage() {
  const user = await getSessionUser();
  if (user?.kind === "professional") redirect("/fisio");
  if (user?.kind === "patient") redirect(`/paciente/${user.patient.id}`);

  // Modo desarrollo: si está activado FISIO_DEV_BYPASS, mantenemos
  // la landing de "switch user" para trastear rápido
  if (process.env.FISIO_DEV_BYPASS === "true") {
    const professionals = await prisma.professional.findMany({
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
    });
    const patients = await prisma.patient.findMany({ orderBy: { fullName: "asc" } });

    return (
      <LoginLanding
        professionals={professionals.map((p) => ({ id: p.id, fullName: p.fullName, role: p.role }))}
        patients={patients.map((p) => ({ id: p.id, fullName: p.fullName }))}
      />
    );
  }

  // Producción: dos puertas (equipo / paciente) con el chrome de marca
  return (
    <PublicShell title="¿Quién entra?" subtitle="Elige tu tipo de acceso para continuar." heroSubtitle="App interna · Equipo y pacientes.">
      <div className="space-y-3">
        <Link
          href="/login"
          className="block transition-all hover:scale-[1.01]"
          style={{
            padding: 18,
            background: "#FFFFFF",
            border: "1px solid #E5E5E5",
            borderRadius: 12,
            textDecoration: "none",
            color: "#0A0A0A",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="inline-flex items-center justify-center"
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)",
                fontSize: 22,
              }}
            >
              👥
            </div>
            <div className="flex-1">
              <div className="font-semibold text-[15px]" style={{ letterSpacing: "-0.01em" }}>
                Acceso del equipo
              </div>
              <div className="text-xs" style={{ color: "#737373" }}>
                Profesionales · Email + contraseña
              </div>
            </div>
            <span style={{ color: "#A3A3A3", fontSize: 18 }}>→</span>
          </div>
        </Link>

        <Link
          href="/paciente/login"
          className="block transition-all hover:scale-[1.01]"
          style={{
            padding: 18,
            background: "#FFFFFF",
            border: "1px solid #E5E5E5",
            borderRadius: 12,
            textDecoration: "none",
            color: "#0A0A0A",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="inline-flex items-center justify-center"
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: "#0A0A0A",
                fontSize: 22,
              }}
            >
              🏋️
            </div>
            <div className="flex-1">
              <div className="font-semibold text-[15px]" style={{ letterSpacing: "-0.01em" }}>
                Acceso de paciente
              </div>
              <div className="text-xs" style={{ color: "#737373" }}>
                Atleta · Email + código
              </div>
            </div>
            <span style={{ color: "#A3A3A3", fontSize: 18 }}>→</span>
          </div>
        </Link>
      </div>
    </PublicShell>
  );
}
