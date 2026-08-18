import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoutCard } from "@/components/LogoutCard";

export default async function AjustesPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  const isManager = user.role === "ceo" || user.role === "head_success";

  return (
    <main>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Ajustes</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Tu perfil, configuración de la app y servicios conectados
        </p>
      </header>

      <div className="rounded-lg p-3 mb-2 flex items-center justify-between gap-3 bg-white border border-neutral-200">
        <div className="flex items-center gap-3">
          <span className="text-xl">🎨</span>
          <div>
            <div className="font-medium text-sm">Apariencia</div>
            <div className="text-xs text-neutral-500">Tema claro u oscuro del panel</div>
          </div>
        </div>
        <ThemeToggle />
      </div>

      <div className="space-y-2">
        <Link
          href="/fisio/ajustes/perfil"
          className="block rounded-lg p-3 hover:bg-neutral-50 bg-white border border-neutral-200"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">👤</span>
            <div className="flex-1">
              <div className="font-medium text-sm">Mi perfil</div>
              <div className="text-xs text-neutral-500">Datos fiscales y foto para tus facturas</div>
            </div>
            <span className="text-neutral-400">→</span>
          </div>
        </Link>

        <Link
          href="/fisio/ajustes/notificaciones"
          className="block rounded-lg p-3 hover:bg-neutral-50 bg-white border border-neutral-200"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🔔</span>
            <div className="flex-1">
              <div className="font-medium text-sm">Notificaciones</div>
              <div className="text-xs text-neutral-500">Elige qué avisos quieres recibir</div>
            </div>
            <span className="text-neutral-400">→</span>
          </div>
        </Link>

        <Link
          href="/fisio/ajustes/integraciones"
          className="block rounded-lg p-3 hover:bg-neutral-50 bg-white border border-neutral-200"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🔌</span>
            <div className="flex-1">
              <div className="font-medium text-sm">Integraciones</div>
              <div className="text-xs text-neutral-500">Conecta tu Google Calendar para las llamadas con pacientes</div>
            </div>
            <span className="text-neutral-400">→</span>
          </div>
        </Link>

        <Link
          href="/fisio/ajustes/mi-agenda"
          className="block rounded-lg p-3 hover:bg-neutral-50 bg-white border border-neutral-200"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🗓</span>
            <div className="flex-1">
              <div className="font-medium text-sm">Mi agenda de llamadas</div>
              <div className="text-xs text-neutral-500">Horarios y duración de tus llamadas de optimización/renovación</div>
            </div>
            <span className="text-neutral-400">→</span>
          </div>
        </Link>

        {isManager && (
          <Link
            href="/fisio/ajustes/alertas-metricas"
            className="block rounded-lg p-3 hover:bg-neutral-50 bg-white border border-neutral-200"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">🚨</span>
              <div className="flex-1">
                <div className="font-medium text-sm">Alertas por métricas</div>
                <div className="text-xs text-neutral-500">Plantilla global — cuándo avisar por fatiga, RPE o sueño</div>
              </div>
              <span className="text-neutral-400">→</span>
            </div>
          </Link>
        )}

        {isManager && (
          <Link
            href="/fisio/ajustes/banners"
            className="block rounded-lg p-3 hover:bg-neutral-50 bg-white border border-neutral-200"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">📢</span>
              <div className="flex-1">
                <div className="font-medium text-sm">Avisos a pacientes</div>
                <div className="text-xs text-neutral-500">Banners programables que salen en el home según programa</div>
              </div>
              <span className="text-neutral-400">→</span>
            </div>
          </Link>
        )}
      </div>

      {/* Cerrar sesión — separado al final, con estilo de "destructivo suave".
          En desktop también está en el sidebar; aquí es el único acceso en móvil. */}
      <div className="mt-6 pt-4 border-t border-neutral-200">
        <LogoutCard />
      </div>
    </main>
  );
}
