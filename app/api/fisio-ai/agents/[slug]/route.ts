/**
 * GET  /api/fisio-ai/agents/[slug] — devuelve el agente completo.
 * PUT  /api/fisio-ai/agents/[slug] { name?, description?, icon?, brief? }
 *   → actualiza campos editables del agente.
 * Solo CEO por ahora.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { ensureDefaultAgents } from "@/lib/fisio-ai-agents";

async function requireCeo() {
  const user = await getActiveProfessional();
  if (!user) return { error: "Unauthorized" as const, status: 401 };
  if (user.role !== "ceo") return { error: "Forbidden" as const, status: 403 };
  return { user };
}

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const g = await requireCeo();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  await ensureDefaultAgents();
  const agent = await (prisma as any).fisioAiAgent.findUnique({ where: { slug: params.slug } });
  if (!agent) return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });
  return NextResponse.json({ agent });
}

export async function PUT(req: NextRequest, { params }: { params: { slug: string } }) {
  const g = await requireCeo();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const b = await req.json().catch(() => ({}));
  const data: any = { updatedById: g.user.id };
  if (typeof b?.name === "string" && b.name.trim()) data.name = b.name.trim();
  if (typeof b?.description === "string") data.description = b.description.trim();
  if (typeof b?.icon === "string" && b.icon.trim()) data.icon = b.icon.trim();
  if (typeof b?.brief === "string") data.brief = b.brief;
  if (typeof b?.usesPatientContext === "boolean") data.usesPatientContext = b.usesPatientContext;

  const updated = await (prisma as any).fisioAiAgent.update({
    where: { slug: params.slug },
    data,
  });
  return NextResponse.json({ agent: updated });
}
