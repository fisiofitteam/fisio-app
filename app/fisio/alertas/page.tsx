import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { AlertsInbox } from "@/components/AlertsInbox";

export const dynamic = "force-dynamic";

export default async function AlertasPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  // CEO no gestiona alertas — lo lleva head_success y los fisios asignados.
  if (user.role !== "fisio" && user.role !== "head_success") {
    redirect("/fisio");
  }
  const isManager = user.role === "head_success";

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <header>
        <h1 className="text-2xl font-semibold" style={{ letterSpacing: "-0.02em" }}>
          🚨 Alertas de pacientes
        </h1>
        <p className="text-sm text-neutral-600 mt-1">
          La IA analiza las sensaciones que escriben los pacientes al terminar sus sesiones.
          Cuando detecta algo que merece tu atencion, aparece aqui.
        </p>
      </header>
      <AlertsInbox managerDefault={isManager} />
    </div>
  );
}
