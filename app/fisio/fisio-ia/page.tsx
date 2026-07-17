import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ensureDefaultAgents } from "@/lib/fisio-ai-agents";

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

      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-3">
        {agents.map((a: any) => (
          <Link
            key={a.id}
            href={`/fisio/fisio-ia/${a.slug}`}
            className="group card hover:border-neutral-900 hover:shadow-md transition-all p-5 flex items-start gap-4"
          >
            <div className="text-4xl flex-shrink-0">{a.icon}</div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-base group-hover:underline">{a.name}</h2>
              <p className="text-sm text-neutral-500 mt-1 leading-snug">{a.description}</p>
              <div className="text-xs text-neutral-400 mt-3 inline-flex items-center gap-1">
                Abrir chat →
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
