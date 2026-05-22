import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";

export default async function AjustesPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (!(user.role === "ceo" || user.role === "head_success")) {
    redirect("/fisio");
  }

  return (
    <main>
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Ajustes</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Configuración de la app y servicios conectados
        </p>
      </header>

      <div className="space-y-2">
        <Link
          href="/fisio/ajustes/integraciones"
          className="block rounded-lg p-3 hover:bg-neutral-50"
          style={{ background: "#FFFFFF", border: "1px solid #E5E5E5" }}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">🔌</span>
            <div className="flex-1">
              <div className="font-medium text-sm">Integraciones</div>
              <div className="text-xs text-neutral-500">Google Calendar, futuros servicios</div>
            </div>
            <span className="text-neutral-400">→</span>
          </div>
        </Link>
      </div>
    </main>
  );
}
