import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { LoginLanding } from "@/components/LoginLanding";

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

  // Producción: pantalla minimalista que ofrece login equipo o paciente
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: "linear-gradient(135deg, #FEF3C7 0%, #FCD34D 100%)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-neutral-900 rounded-2xl mb-3">
            <span className="text-2xl">💪</span>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900">FisioFit App</h1>
          <p className="text-sm text-neutral-700 mt-1">Selecciona cómo quieres acceder</p>
        </div>

        <div className="space-y-3">
          <Link href="/login" className="block bg-white rounded-2xl shadow-md hover:shadow-lg p-5 transition-shadow">
            <div className="flex items-center gap-3">
              <div className="text-3xl">👥</div>
              <div>
                <div className="font-semibold">Acceso del equipo</div>
                <div className="text-xs text-neutral-500">Profesionales con email + contraseña</div>
              </div>
            </div>
          </Link>

          <Link href="/paciente/login" className="block bg-white rounded-2xl shadow-md hover:shadow-lg p-5 transition-shadow">
            <div className="flex items-center gap-3">
              <div className="text-3xl">🏋️</div>
              <div>
                <div className="font-semibold">Acceso de paciente</div>
                <div className="text-xs text-neutral-500">Con tu email y código de acceso</div>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
