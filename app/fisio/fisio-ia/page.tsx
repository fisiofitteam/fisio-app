import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ensureDefaultAgents } from "@/lib/fisio-ai-agents";
import { FisioAiLanding } from "@/components/FisioAiLanding";

export const dynamic = "force-dynamic";

export default async function FisioIaLandingPage() {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  // Beta cerrada al CEO mientras afinamos briefs y flujos.
  if (user.role !== "ceo") redirect("/fisio");

  await ensureDefaultAgents();
  const agents = await (prisma as any).fisioAiAgent.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });

  return (
    <main className="p-6">
      <header className="max-w-4xl mx-auto mb-6">
        <div className="text-[10px] uppercase tracking-widest font-bold text-amber-600 mb-1">
          BETA · Solo CEO
        </div>
        <h1 className="text-3xl font-bold flex items-center gap-2">🧠 Fisio IA</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Elige un agente para empezar. Cada uno tiene su propio brief que puedes editar
          desde su vista de chat.
        </p>
      </header>

      <div className="max-w-4xl mx-auto">
        <FisioAiLanding
          initialAgents={agents.map((a: any) => ({
            id: a.id,
            slug: a.slug,
            name: a.name,
            description: a.description,
            icon: a.icon,
          }))}
        />
      </div>
    </main>
  );
}
