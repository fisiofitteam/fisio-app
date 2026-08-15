import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ensureDefaultAgents, canAccessAgent } from "@/lib/fisio-ai-agents";
import { FisioAiLanding } from "@/components/FisioAiLanding";

export const dynamic = "force-dynamic";

export default async function FisioIaLandingPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");

  await ensureDefaultAgents();
  const allAgents = await (prisma as any).fisioAiAgent.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });
  // Filtramos por permisos: cada agente puede tener allowedRoles null (todos)
  // o un array de roles. CEO siempre lo ve todo.
  const agents = allAgents.filter((a: any) => canAccessAgent(user.role, a.allowedRoles));

  return (
    <main className="p-6">
      <header className="max-w-4xl mx-auto mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">🧠 Fisio IA</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Elige un agente para empezar. Cada uno tiene su propio brief; el CEO puede
          personalizarlos y decidir quién de tu equipo tiene acceso.
        </p>
      </header>

      <div className="max-w-4xl mx-auto">
        {agents.length === 0 ? (
          <div className="rounded-xl p-6 text-center text-sm text-neutral-500" style={{ background: "#FAFAFA", border: "1px dashed #D4D4D4" }}>
            Aún no tienes ningún agente asignado. Habla con el CEO para que te dé acceso a alguno.
          </div>
        ) : (
          <FisioAiLanding
            initialAgents={agents.map((a: any) => ({
              id: a.id,
              slug: a.slug,
              name: a.name,
              description: a.description,
              icon: a.icon,
            }))}
          />
        )}
      </div>
    </main>
  );
}
