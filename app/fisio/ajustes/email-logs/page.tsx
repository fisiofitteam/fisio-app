import { redirect } from "next/navigation";
import { getActiveProfessional } from "@/lib/session";
import { EmailLogsView } from "@/components/EmailLogsView";

export const dynamic = "force-dynamic";

export default async function EmailLogsPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo" && user.role !== "head_success") redirect("/fisio");

  return (
    <main className="p-4">
      <header className="max-w-4xl mx-auto mb-4">
        <h1 className="text-2xl font-bold">📮 Diagnóstico de emails de login</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Últimos códigos de acceso enviados. Sirve para diagnosticar cuando un paciente
          reporta "no me llega el código". Verás si Resend lo aceptó, a qué dirección se
          intentó enviar y si el paciente lo llegó a usar.
        </p>
      </header>
      <div className="max-w-4xl mx-auto">
        <EmailLogsView />
      </div>
    </main>
  );
}
