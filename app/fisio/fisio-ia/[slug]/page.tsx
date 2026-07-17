import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ensureDefaultAgents } from "@/lib/fisio-ai-agents";
import { FisioAiAgentChat } from "@/components/FisioAiAgentChat";

export const dynamic = "force-dynamic";

export default async function FisioIaAgentPage({ params }: { params: { slug: string } }) {
  const user = await getActiveProfessional();
  if (!user) redirect("/login");
  if (user.role !== "ceo") redirect("/fisio");

  await ensureDefaultAgents();
  const agent = await (prisma as any).fisioAiAgent.findUnique({ where: { slug: params.slug } });
  if (!agent) notFound();

  return (
    <main className="p-4">
      <div className="max-w-3xl mx-auto mb-3">
        <Link href="/fisio/fisio-ia" className="text-xs text-neutral-500 hover:underline">
          ← Agentes
        </Link>
      </div>
      <header className="max-w-3xl mx-auto mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <span className="text-3xl">{agent.icon}</span>
          {agent.name}
        </h1>
        <p className="text-sm text-neutral-500 mt-1">{agent.description}</p>
      </header>
      <FisioAiAgentChat
        slug={agent.slug}
        initialBrief={agent.brief}
        initialName={agent.name}
        initialDescription={agent.description}
        initialIcon={agent.icon}
        usesPatientContext={!!agent.usesPatientContext}
      />
    </main>
  );
}
