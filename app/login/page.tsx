import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: { redirect?: string; error?: string } }) {
  const pro = await getActiveProfessional();
  if (pro) {
    redirect(searchParams.redirect || "/fisio");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: "linear-gradient(135deg, #FEF3C7 0%, #FCD34D 100%)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-neutral-900 rounded-2xl mb-3">
            <span className="text-2xl">💪</span>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900">FisioFit App</h1>
          <p className="text-sm text-neutral-700 mt-1">Acceso al equipo</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          <LoginForm redirectTo={searchParams.redirect} />
        </div>

        <p className="text-center text-xs text-neutral-700 mt-6">
          ¿Eres paciente? <a href="/paciente/login" className="font-semibold underline">Accede aquí</a>
        </p>
      </div>
    </main>
  );
}
